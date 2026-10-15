"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// A strip at the top of every signed-in screen while the phone/computer has
// no connection, so a lost signal reads as "sin conexión" instead of buttons
// silently failing. When the connection comes back it reloads the screen's
// data so nothing that arrived meanwhile is missed. (When the app can't load
// at all, the bundled public/offline.html takes over instead.)
export function OfflineBanner() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );

  const wasOffline = useRef(false);
  useEffect(() => {
    if (offline) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      router.refresh();
    }
  }, [offline, router]);

  return (
    <AnimatePresence initial={false}>
      {offline && (
        <motion.div
          role="status"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
          className="shrink-0 overflow-hidden bg-brand-dark text-white"
        >
          <div className="flex items-center justify-center gap-2 px-4 py-2 text-[12.5px] font-medium">
            <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
            Sin conexión a internet. Los mensajes nuevos aparecerán al reconectar.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
