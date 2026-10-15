import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { createAdminClient } from "@/lib/supabase/admin";

// Server-only. Sends a phone notification to the installed apps of the
// people who work in a Tienda when something worth interrupting for happens
// (a customer message). Firebase Cloud Messaging delivers to both Android and iPhone.
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

// Who gets the alert for a message in this Tienda: its Dueños, and the
// Gerentes and Agentes of the Tienda (until conversation routing exists).
async function peopleOfStore(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  storeId: string,
): Promise<string[]> {
  const [{ data: owners }, { data: store }, { data: storeMembers }] = await Promise.all([
    supabase.from("members").select("user_id").eq("business_id", businessId).eq("role", "owner"),
    supabase.from("stores").select("archived_at").eq("id", storeId).eq("business_id", businessId).maybeSingle(),
    supabase.from("store_members").select("user_id").eq("store_id", storeId),
  ]);
  const people = new Set((owners ?? []).map((o) => o.user_id as string));
  if (store && !store.archived_at) for (const m of storeMembers ?? []) people.add(m.user_id as string);
  return [...people];
}

export async function sendPushToStore(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  storeId: string,
  notification: { title: string; body: string; conversationId: string },
): Promise<void> {
  try {
    const app = getFirebaseApp();
    if (!app) return;

    const people = await peopleOfStore(supabase, businessId, storeId);
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
      data: { url: `/chat?c=${notification.conversationId}` },
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
