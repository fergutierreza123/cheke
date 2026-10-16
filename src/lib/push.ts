import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { createAdminClient } from "@/lib/supabase/admin";

// Server-only. Sends a phone notification to the installed apps of the
// people responsible for a conversation when something worth interrupting
// for happens (a customer message, a chat waiting 5 / 10 minutes). Firebase
// Cloud Messaging delivers to both Android and iPhone.
//
// Who gets it (issue #28): an assigned chat notifies only its person; an
// unassigned one the Tienda's available people and its Gerente. Dueños who
// turned on "avisarme de todo" get everything.
//
// Needs FIREBASE_SERVICE_ACCOUNT_JSON (Firebase console → Project settings →
// Service accounts → Generate new private key; paste the whole JSON file as
// one line). Without it this quietly does nothing — it must never break the
// WhatsApp webhook or a chat send.

function getFirebaseApp(): App | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const existing = getApps()[0];
  if (existing) return existing;
  try {
    return initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (error) {
    console.error("push: invalid FIREBASE_SERVICE_ACCOUNT_JSON", error);
    return null;
  }
}

// How many conversations are waiting on the business: their latest message
// is from the customer. Shown as the red number on the app icon. Looks at
// the last week of messages only, so a busy business stays one quick query.
export function countAwaitingReply(
  messagesNewestFirst: Array<{ conversation_id: string; direction: string }>,
): number {
  const seen = new Set<string>();
  let waiting = 0;
  for (const m of messagesNewestFirst) {
    if (seen.has(m.conversation_id)) continue;
    seen.add(m.conversation_id);
    if (m.direction === "in") waiting++;
  }
  return waiting;
}

async function awaitingReplyCount(
  supabase: ReturnType<typeof createAdminClient>,
  storeId: string,
): Promise<number> {
  const { data } = await supabase
    .from("messages")
    .select("conversation_id, direction")
    .eq("store_id", storeId)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);
  // The message that triggered this push is already saved, so this is >= 1
  // whenever a customer just wrote; fall back to 1 if the query failed.
  return Math.max(1, countAwaitingReply(data ?? []));
}

type Admin = ReturnType<typeof createAdminClient>;

// Who should hear about a conversation right now.
// - chekelinHandling: chekelin is answering it, so nobody is interrupted
//   (only Dueños with "avisarme de todo").
// - assigned: only that person (+ "avisarme de todo").
// - unassigned: the Tienda's available people and its Gerentes (+ "avisarme
//   de todo"); the Dueños when the Tienda has nobody else.
export async function recipientsForConversation(
  supabase: Admin,
  conversation: { businessId: string; storeId: string; assignedTo: string | null; chekelinHandling?: boolean },
): Promise<string[]> {
  const { data: members } = await supabase
    .from("members")
    .select("user_id, role, away, notify_all")
    .eq("business_id", conversation.businessId);
  const everyone = members ?? [];
  const people = new Set<string>(everyone.filter((m) => m.role === "owner" && m.notify_all).map((m) => m.user_id as string));

  if (conversation.chekelinHandling) return [...people];
  if (conversation.assignedTo) {
    people.add(conversation.assignedTo);
    return [...people];
  }

  const { data: storeRows } = await supabase.from("store_members").select("user_id").eq("store_id", conversation.storeId);
  const inStore = new Set((storeRows ?? []).map((r) => r.user_id as string));
  for (const m of everyone) {
    if (!inStore.has(m.user_id)) continue;
    if (m.role === "manager" || !m.away) people.add(m.user_id);
  }
  if (people.size === 0) for (const m of everyone) if (m.role === "owner") people.add(m.user_id);
  return [...people];
}

export type PushNotification = {
  title: string;
  body: string;
  conversationId: string;
  // Extra query string for the Chat link (e.g. "reasignar=1").
  linkExtra?: string;
};

export async function sendPushToPeople(
  supabase: Admin,
  businessId: string,
  storeId: string,
  people: string[],
  notification: PushNotification,
): Promise<void> {
  try {
    const app = getFirebaseApp();
    if (!app) return;
    if (people.length === 0) return;
    const { data: devices } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("business_id", businessId)
      .in("user_id", people);
    const tokens = (devices ?? []).map((d) => d.token);
    if (tokens.length === 0) return;

    const badge = await awaitingReplyCount(supabase, storeId);

    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      // Where the app should go when the notification is tapped.
      data: {
        url: `/chat?c=${notification.conversationId}${notification.linkExtra ? `&${notification.linkExtra}` : ""}`,
      },
      // badge = the number on the app icon; the app clears it when the
      // inbox is opened (src/components/PushRegistrar.tsx).
      apns: { payload: { aps: { sound: "default", badge } } },
      android: { priority: "high", notification: { channelId: "messages", notificationCount: badge } },
    });

    // Drop tokens Firebase says are dead (app uninstalled / token rotated)
    // so we stop pushing to them.
    const dead = tokens.filter((_, i) => {
      const code = response.responses[i]?.error?.code;
      return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
    });
    if (dead.length > 0) await supabase.from("device_tokens").delete().in("token", dead);
  } catch (error) {
    console.error("push send error", error);
  }
}

// The alert for a conversation, to whoever is responsible for it now.
export async function notifyConversation(
  supabase: Admin,
  conversation: { businessId: string; storeId: string; assignedTo: string | null; chekelinHandling?: boolean },
  notification: PushNotification,
): Promise<void> {
  try {
    const people = await recipientsForConversation(supabase, conversation);
    await sendPushToPeople(supabase, conversation.businessId, conversation.storeId, people, notification);
  } catch (error) {
    console.error("push recipients error", error);
  }
}
