import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { createAdminClient } from "@/lib/supabase/admin";

// Server-only. Sends a phone notification to every installed app belonging
// to a business when something worth interrupting for happens (a customer
// message). Firebase Cloud Messaging delivers to both Android and iPhone.
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

export async function sendPushToBusiness(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
  notification: { title: string; body: string; conversationId: string },
): Promise<void> {
  try {
    const app = getFirebaseApp();
    if (!app) return;

    const { data: devices } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("business_id", businessId);
    const tokens = (devices ?? []).map((d) => d.token);
    if (tokens.length === 0) return;

    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      // Where the app should go when the notification is tapped.
      data: { url: `/chat?c=${notification.conversationId}` },
      apns: { payload: { aps: { sound: "default" } } },
      android: { priority: "high", notification: { channelId: "messages" } },
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
