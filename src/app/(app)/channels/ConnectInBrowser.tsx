"use client";

import { Browser } from "@capacitor/browser";

// Inside the iPhone/Android app Meta's popup can't finish: Facebook blocks
// its login in an app's embedded web view (issue #15). Canales opens in the
// phone's browser instead, where the Dueño signs in once and connects; the
// app shows the channel on the next refresh.
export function ConnectInBrowser({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => void Browser.open({ url: `${window.location.origin}/channels` })}
        className="flex h-10 items-center justify-center rounded-[10px] px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: color }}
      >
        {label}
      </button>
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        Se abre en el navegador de tu teléfono: entra con tu correo y conecta desde ahí. Al volver a la app ya aparece.
      </p>
    </div>
  );
}
