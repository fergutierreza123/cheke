"use client";

import { useEffect, useState } from "react";

// The "welcome back" screen right after signing in: brand dark blue, the
// white cheke icon in the middle blinking, a greeting and a one-line status,
// then a fade into the app. Shown once per login — the server decides (the
// cheke_welcome cookie set in /auth/callback, read in the app layout), so it's
// already on screen in the very first paint with no flash of the app beneath.
//
// All the motion is CSS (see "welcome-*" in globals.css) so it doesn't wait
// for JavaScript; this component only removes itself afterwards.

export function WelcomeSplash({ firstName, businessName }: { firstName?: string | null; businessName?: string | null }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // One-shot: clear the flag so a reload doesn't replay it. The timer is a
    // safety net in case the CSS fade-out end event never fires.
    document.cookie = "cheke_welcome=; Max-Age=0; path=/";
    const timer = window.setTimeout(() => setDone(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setDone(true);
      }}
      className="welcome-screen fixed inset-0 z-[100] flex flex-col items-center justify-center bg-brand-dark px-6 text-center text-white"
    >
      <div className="welcome-icon relative h-[116px] w-[99px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- two stacked static brand layers */}
        <img src="/logos/cheke-icon-face.png" alt="" className="absolute inset-0 h-full w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img src="/logos/cheke-icon-eyes.png" alt="" className="welcome-eyes absolute inset-0 h-full w-full" />
      </div>
      <h1 className="welcome-title mt-8 font-heading text-[22px] font-semibold">
        {firstName ? `Hola de nuevo, ${firstName}` : "Hola de nuevo"}
      </h1>
      <p className="welcome-sub mt-1.5 text-sm text-white/60">
        {businessName ? `Preparando ${businessName}…` : "Preparando tu negocio…"}
      </p>
    </div>
  );
}
