"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

// What the server already knows from the user agent (see src/lib/nativeApp.ts),
// so the very first render inside the app is right, with no flash of
// web-only UI before hydration.
const NativeAppContext = createContext(false);

export function NativeAppProvider({ isNative, children }: { isNative: boolean; children: React.ReactNode }) {
  return <NativeAppContext.Provider value={isNative}>{children}</NativeAppContext.Provider>;
}

const noopSubscribe = () => () => {};

// True inside the installed iPhone/Android app, false in any browser.
// Trusts either signal: the server's user-agent check (via the provider) or
// Capacitor itself once the page is running on the phone.
export function useIsNativeApp(): boolean {
  const fromServer = useContext(NativeAppContext);
  const fromCapacitor = useSyncExternalStore(
    noopSubscribe,
    () => Capacitor.isNativePlatform(),
    () => false,
  );
  return fromServer || fromCapacitor;
}

// Wrap EVERY price, plan comparison, "mejorar plan", bank-transfer or
// PixelPay prompt for cheKe's own subscription in this. Inside the store
// apps cheKe must not sell or point to a way to pay (Apple 3.1.3(f), Google
// Play consumption-only apps), so these render nothing there. Showing the
// current plan's name is fine and doesn't need it.
//
// Not for "Cobrar" in Chat: that's a business charging ITS customers for
// physical goods, which both stores allow.
export function HideInNativeApp({ children }: { children: React.ReactNode }) {
  return useIsNativeApp() ? null : <>{children}</>;
}
