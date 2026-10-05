import type { CapacitorConfig } from "@capacitor/cli";

// The native iPhone/Android app is a thin shell that loads the live Cheke
// site (so every web update reaches the app instantly, no store re-review),
// plus the native bits a website can't do: push notifications, app icon
// badge, and opening from a notification tap.
//
// To create the native projects (needs Xcode / Android Studio installed):
//   npx cap add ios && npx cap add android && npx cap sync
const config: CapacitorConfig = {
  appId: "io.cheke.app",
  appName: "cheke",
  // Required by Capacitor even when `server.url` is set; nothing is served
  // from it.
  webDir: "public",
  server: {
    url: "https://cheke-eight.vercel.app",
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
