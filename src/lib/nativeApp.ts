// How the server tells the installed iPhone/Android app apart from a normal
// browser: capacitor.config.ts adds this marker to the app's user agent
// (`appendUserAgent`), so every request the app makes carries it. Keep the
// two in sync. Safe to import anywhere (server or client); it reads nothing.
//
// Client components should use `useIsNativeApp()` from
// src/components/NativeApp.tsx instead, which also asks Capacitor directly.
export const NATIVE_APP_UA_MARKER = "cheKeApp";

export function isNativeAppUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes(NATIVE_APP_UA_MARKER);
}

// Where the installed app lands once signed in: the inbox, so the app opens
// on the thing people use it for (App Store guideline 4.2) instead of the
// web's default screen.
export const NATIVE_APP_HOME = "/chat";
