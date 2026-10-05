"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { registerDeviceToken } from "@/app/(app)/push/actions";

// Renders nothing. Inside the installed iPhone/Android app only (a normal
// browser skips this entirely): asks permission for notifications, hands
// this phone's push address to the server, and opens the right chat when a
// notification is tapped.
export function PushRegistrar() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const platform = Capacitor.getPlatform();
    if (platform !== "ios" && platform !== "android") return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const registration = await PushNotifications.addListener("registration", (t) => {
        void registerDeviceToken(t.value, platform);
      });
      const tapped = await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const url = event.notification.data?.url;
        if (typeof url === "string" && url.startsWith("/")) router.push(url);
      });
      cleanup = () => {
        void registration.remove();
        void tapped.remove();
      };
      if (cancelled) {
        cleanup();
        return;
      }

      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === "prompt") permission = await PushNotifications.requestPermissions();
      if (permission.receive === "granted") await PushNotifications.register();
    })().catch((error) => console.error("push registration error", error));

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  return null;
}
