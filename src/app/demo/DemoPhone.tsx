"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const BASE = "/demo/app";
const SCREENS = [
  { id: "chat", label: "Chat" },
  { id: "chekeo", label: "Chekeo" },
  { id: "contacts", label: "Contactos" },
  { id: "inventory", label: "Catálogo" },
  { id: "templates", label: "Plantillas" },
  { id: "notifications", label: "Notificaciones" },
  { id: "analytics", label: "Analítica" },
  { id: "channels", label: "Canales" },
  { id: "team", label: "Equipo" },
];

// iPhone 15 Pro logical size. The app inside is the real app in an iframe
// (phone-width, so it renders its phone layout); everything around it is
// just a frame.
const W = 393;
const H = 852;
const STATUS_H = 54;
const HOME_H = 22;
const BEZEL = 12;

export function DemoPhone() {
  const [screen, setScreen] = useState("chat");
  const [reloadKey, setReloadKey] = useState(0);
  const [banner, setBanner] = useState(false);
  const [scale, setScale] = useState(1);
  const [compact, setCompact] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    function fit() {
      setCompact(window.innerWidth < 560);
      setScale(Math.min(1, (window.innerHeight - 40) / (H + BEZEL * 2)));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const showBanner = useCallback(() => {
    setBanner(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setBanner(false), 7000);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(showBanner, 3500);
    return () => {
      window.clearTimeout(t);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [showBanner]);

  function openScreen(id: string) {
    setScreen(id);
    setReloadKey((k) => k + 1);
    setBanner(false);
  }

  // Opened on an actual phone: skip the frame and show the app itself.
  if (compact) {
    return <iframe key={reloadKey} src={`${BASE}/${screen}`} title="cheke demo" className="fixed inset-0 h-dvh w-full border-0" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center gap-16 bg-brand-dark px-8 py-5">
      <div className="hidden max-w-sm text-white xl:block">
        <div className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-accent">
          Demo interactiva
        </div>
        <h1 className="text-display font-heading text-4xl font-semibold leading-tight">
          <span className="text-accent">cheke</span> en tu iPhone
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-white/70">
          Un solo buzón para WhatsApp, Instagram y Facebook, en el bolsillo de cada cliente. Toca la pantalla: es la
          app de verdad, con datos de ejemplo.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              onClick={() => openScreen(s.id)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                screen === s.id
                  ? "border-accent bg-accent text-brand-dark"
                  : "border-white/20 text-white/80 hover:bg-white/10"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={showBanner}
          className="mt-6 flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <span aria-hidden>🔔</span> Simular mensaje nuevo
        </button>
        <p className="mt-3 text-xs text-white/45">
          Así avisará la app cada vez que entre un mensaje, aunque el teléfono esté bloqueado.
        </p>
      </div>

      <div style={{ width: (W + BEZEL * 2) * scale, height: (H + BEZEL * 2) * scale }} className="shrink-0">
        <div
          style={{ width: W + BEZEL * 2, height: H + BEZEL * 2, transform: `scale(${scale})`, transformOrigin: "top left" }}
          className="relative rounded-[62px] bg-[#0b0b0f] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.55),inset_0_0_0_2px_#2a2a33]"
        >
          <div style={{ width: W, height: H }} className="relative overflow-hidden rounded-[50px] bg-white">
            {/* status bar */}
            <div style={{ height: STATUS_H }} className="relative flex items-end justify-between bg-white px-9 pb-1.5 text-[15px] font-semibold text-black">
              <span>9:41</span>
              <span className="flex items-center gap-1.5">
                <SignalIcon />
                <WifiIcon />
                <BatteryIcon />
              </span>
            </div>
            <iframe
              key={reloadKey}
              src={`${BASE}/${screen}`}
              title="cheke demo"
              style={{ width: W, height: H - STATUS_H - HOME_H }}
              className="block border-0"
            />
            <div style={{ height: HOME_H }} className="relative bg-brand-dark">
              <div className="absolute bottom-1.5 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-white/90" />
            </div>

            {/* dynamic island */}
            <div className="absolute left-1/2 top-[11px] h-[34px] w-[122px] -translate-x-1/2 rounded-full bg-black" />

            {/* incoming-message push banner, iOS style */}
            <AnimatePresence>
              {banner && (
                <motion.button
                  initial={prefersReducedMotion ? { opacity: 0 } : { y: -120, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { y: -120, opacity: 0 }}
                  transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0.18, duration: 0.55 }}
                  onClick={() => openScreen("chat")}
                  className="absolute left-2 right-2 top-[50px] z-10 flex gap-3 rounded-[24px] bg-white/90 p-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
                  <img src="/app-icon.png" alt="" className="h-[38px] w-[38px] shrink-0 rounded-[9px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="font-semibold text-black">Juan Pérez · WhatsApp</span>
                      <span className="text-[11.5px] text-black/45">ahora</span>
                    </div>
                    <div className="truncate text-[13px] text-black/80">Hola, ¿todavía tienen la guitarra en negro?</div>
                  </div>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalIcon() {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
      <rect x="0" y="8" width="3" height="4" rx="1" />
      <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
      <rect x="10" y="3" width="3" height="9" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}
function WifiIcon() {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1.5 4.3a10 10 0 0 1 14 0" />
      <path d="M4.2 7.1a6 6 0 0 1 8.6 0" />
      <circle cx="8.5" cy="10.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function BatteryIcon() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
      <rect x="0.5" y="0.5" width="22" height="12" rx="3.5" stroke="currentColor" opacity="0.4" />
      <rect x="2" y="2" width="19" height="9" rx="2.2" fill="currentColor" />
      <path d="M24 4.5v4c.9-.3 1.5-1.1 1.5-2s-.6-1.7-1.5-2z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
