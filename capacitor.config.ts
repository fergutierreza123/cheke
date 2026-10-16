import type { CapacitorConfig } from "@capacitor/cli";

// The native iPhone/Android app is a thin shell that loads the live Cheke
// site (so every web update reaches the app instantly, no store re-review),
// plus the native bits a website can't do: push notifications, app icon
// badge, and opening from a notification tap.
//
// To create the native projects (needs Xcode / Android Studio installed):
//   npx cap add ios && npx cap add android && npx cap sync
//
// Then, for "Entrar con Face ID / huella" (src/lib/biometricLogin.ts):
// - ios/App/App/Info.plist: NSFaceIDUsageDescription =
//   "cheke usa Face ID para que entres a tu cuenta sin esperar un código."
// - android/app/src/main/AndroidManifest.xml:
//   <uses-permission android:name="android.permission.USE_BIOMETRIC" />
// (Full steps in README.md → "App móvil".)
const config: CapacitorConfig = {
  appId: "io.cheke.app",
  appName: "cheke",
  // Required by Capacitor even when `server.url` is set; nothing is served
  // from it.
  webDir: "public",
  // Lets the server recognise the app (no marketing page, no pricing UI).
  // Must match NATIVE_APP_UA_MARKER in src/lib/nativeApp.ts.
  appendUserAgent: "cheKeApp",
  server: {
    url: "https://ventas.cheke.app",
    cleartext: false,
    // Bundled inside the app (from webDir) and shown when the site can't
    // load, e.g. no internet, instead of a blank page or a browser error.
    errorPath: "offline.html",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
