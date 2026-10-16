"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { syncBiometricSession } from "@/lib/biometricLogin";

// Mounted on every signed-in screen; does nothing in a normal browser or
// when "Entrar con Face ID" is off. Supabase replaces the refresh token
// each time the session renews, so the copy saved behind Face ID /
// fingerprint is rewritten (silently, no prompt) when the app opens, when
// the session renews in the page, and when the app goes to the background
// (which also catches renewals done by the server on page loads).
export function BiometricSessionSync() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void syncBiometricSession();

    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") void syncBiometricSession();
    });

    let removeAppListener: (() => void) | undefined;
    let cancelled = false;
    void import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) void syncBiometricSession();
      });
      if (cancelled) void handle.remove();
      else removeAppListener = () => void handle.remove();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      removeAppListener?.();
    };
  }, []);

  return null;
}
