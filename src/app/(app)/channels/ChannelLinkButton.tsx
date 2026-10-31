"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import QRCode from "qrcode";
import { channelLink, DEFAULT_LINK_MESSAGE, type LinkableChannel } from "@/lib/channelLink";
import type { ChannelType } from "@/lib/types";

const NAMES: Record<ChannelType, string> = { whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Messenger" };

// "Link y QR" (issue #116): the Canal's direct link and its QR, to put in a
// bio, a flyer or on the counter. Renders nothing when cheke doesn't have
// what the link needs. The first message (WhatsApp only) is not saved.
export function ChannelLinkButton({ channel, className = "" }: { channel: LinkableChannel; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!channelLink(channel)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`h-8 shrink-0 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 ${className}`}
      >
        Link y QR
      </button>
      <AnimatePresence>{open && <LinkDialog channel={channel} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function LinkDialog({ channel, onClose }: { channel: LinkableChannel; onClose: () => void }) {
  const prefersReducedMotion = useReducedMotion();
  const [message, setMessage] = useState(DEFAULT_LINK_MESSAGE);
  const [qr, setQr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const link = channelLink(channel, message) ?? "";
  const name = NAMES[channel.type];

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { width: 640, margin: 2, color: { dark: "#001037", light: "#FFFFFF" } })
      .then((url) => live && setQr(url))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [link]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function flash(text: string) {
    setNote(text);
    setTimeout(() => setNote(null), 2000);
  }

  async function handleCopy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(link);
      ok = true;
    } catch {
      ok = copyWithSelection(link);
    }
    flash(ok ? "Link copiado" : "No se pudo copiar — mantén presionado el link para copiarlo");
  }

  async function handleDownload() {
    if (!qr) return;
    const fileName = `qr-${name.toLowerCase()}.png`;
    // The iPhone/Android app's web view ignores <a download>; its share
    // sheet has "Guardar imagen". Browsers download the file directly.
    try {
      const blob = await (await fetch(qr)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      if (isTouch && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet
    }
    const a = document.createElement("a");
    a.href = qr;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-link-title"
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
        className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-surface p-5 shadow-[0_24px_64px_rgba(0,16,55,0.35)] lg:p-6"
      >
        <h2 id="channel-link-title" className="font-heading text-lg font-semibold text-ink">
          Tu link de {name}
        </h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
          Ponlo en tu perfil, en tus anuncios o imprime el QR. Quien lo abra te escribe directo por {name}.
        </p>

        {channel.type === "whatsapp" && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink">Mensaje con el que te escriben</span>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[14px] text-ink outline-none focus:border-brand"
            />
            <span className="mt-1 block text-[12px] text-ink-soft">El cliente lo puede cambiar antes de enviarlo.</span>
          </label>
        )}

        <div className="mt-4 break-all rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-ink select-all">{link}</div>

        <div className="mt-4 flex justify-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL made here, nothing to optimize
            <img src={qr} alt={`Código QR de tu ${name}`} className="h-52 w-52 rounded-lg border border-border" />
          ) : (
            <div className="h-52 w-52 rounded-lg bg-surface-2" />
          )}
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 rounded-[10px] bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Copiar link
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!qr}
            className="flex-1 rounded-[10px] bg-surface-2 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-3 disabled:opacity-60"
          >
            Descargar QR
          </button>
        </div>
        <p aria-live="polite" className="mt-2 min-h-[18px] text-center text-[12.5px] text-ink-muted">
          {note}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full rounded-[10px] py-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-2"
        >
          Cerrar
        </button>
      </motion.div>
    </>
  );
}

// Older browsers and some in-app web views refuse navigator.clipboard
// (same fallback as Chat's "Copiar").
function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}
