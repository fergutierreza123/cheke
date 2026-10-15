"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Capacitor } from "@capacitor/core";
import { registerDeviceToken } from "@/app/(app)/push/actions";

// "Ahora no" on the notifications card hides it on this phone for a week.
const DISMISSED_KEY = "cheke_push_prompt_dismissed_at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return !!at && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

function nativePlatform(): "ios" | "android" | null {
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : null;
}

// Clears the notifications already shown on the phone and, on iPhone, the
// red number on the app icon. Called whenever the inbox is on screen.
async function clearDeliveredNotifications() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Not registered yet (permission not given) — nothing to clear.
  }
}

// Mounted on every signed-in screen; does nothing in a normal browser.
// Inside the installed iPhone/Android app:
// - never asks for notification permission on its own. On the inbox, a card
//   explains why and only "Activar avisos" triggers the phone's prompt, so
//   it's asked in context, after login. Saying no changes nothing else.
// - hands this phone's push address to the server once permission is given
// - opens the right conversation when a notification is tapped
// - clears the icon badge and refreshes data when the inbox is opened or
//   the app comes back to the foreground
export function PushRegistrar() {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [askable, setAskable] = useState(false);
  const [asking, setAsking] = useState(false);
  const onInbox = pathname.startsWith("/chat");

  useEffect(() => {
    const platform = nativePlatform();
    if (!platform) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const [{ PushNotifications }, { App }] = await Promise.all([
        import("@capacitor/push-notifications"),
        import("@capacitor/app"),
      ]);

      const handles = await Promise.all([
        PushNotifications.addListener("registration", (t) => {
          void registerDeviceToken(t.value, platform);
        }),
        PushNotifications.addListener("registrationError", (error) => {
          console.error("push registration error", error);
        }),
        // Also fires right after a cold start from a tapped notification:
        // Capacitor holds the tap until this listener is added.
        PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const url = event.notification.data?.url;
          if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) router.push(url);
        }),
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) return;
          router.refresh();
          if (window.location.pathname.startsWith("/chat")) void clearDeliveredNotifications();
        }),
      ]);
      cleanup = () => handles.forEach((h) => void h.remove());
      if (cancelled) {
        cleanup();
        return;
      }

      // The server sends customer messages on this Android channel
      // (src/lib/push.ts); creating it makes them show as "Mensajes" in the
      // phone's settings and pop up with sound.
      if (platform === "android") {
        await PushNotifications.createChannel({
          id: "messages",
          name: "Mensajes de clientes",
          importance: 5,
          visibility: 0,
          sound: "default",
        }).catch(() => {});
      }

      const permission = await PushNotifications.checkPermissions();
      if (cancelled) return;
      if (permission.receive === "granted") await PushNotifications.register();
      else if (permission.receive !== "denied") setAskable(true);
    })().catch((error) => console.error("push setup error", error));

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  useEffect(() => {
    if (onInbox && nativePlatform()) void clearDeliveredNotifications();
  }, [onInbox]);

  async function enable() {
    setAsking(true);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive === "granted") await PushNotifications.register();
    } catch (error) {
      console.error("push permission error", error);
    }
    setAsking(false);
    setAskable(false);
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Storage blocked: the card just comes back next time.
    }
    setAskable(false);
  }

  const show = askable && onInbox && !recentlyDismissed();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="dialog"
          aria-label="Activar avisos de mensajes"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
          className="fixed inset-x-3 z-40 mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_44px_rgba(0,16,55,0.22)]"
          style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          <div className="font-heading text-[15px] font-semibold text-ink">¿Te avisamos cuando un cliente escriba?</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Recibe un aviso en este teléfono con cada mensaje nuevo, para no dejar ninguna venta sin responder.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={asking}
              className="min-h-11 flex-1 rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {asking ? "Un momento…" : "Activar avisos"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 rounded-[10px] border border-border px-4 text-[13.5px] font-semibold text-ink-muted"
            >
              Ahora no
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
