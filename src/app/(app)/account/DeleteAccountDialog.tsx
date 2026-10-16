"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { deleteAccount } from "./actions";
import { resaveBiometricLogin, turnOffBiometricLogin } from "@/lib/biometricLogin";
import { forgetPasskeyOnThisDevice } from "@/lib/passkeyLogin";
import { DELETE_CONFIRM_WORD, type DeletionOutcome } from "./deletion";

export type DeletionSummary = { businessName: string; outcome: DeletionOutcome }[];

// "Eliminar mi cuenta": a button that opens a confirmation dialog saying
// exactly what gets deleted, and asks the person to type ELIMINAR.
export function DeleteAccountButton({
  email,
  deletion,
  demo = false,
}: {
  email: string;
  deletion: DeletionSummary;
  demo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const prefersReducedMotion = useReducedMotion();

  const blocked = deletion.find((d) => d.outcome === "blocked");
  const leaving = deletion.filter((d) => d.outcome === "leave");
  const deleting = deletion.filter((d) => d.outcome === "delete");
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRM_WORD;

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped("");
    setError("");
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || demo) return;
    setError("");
    startTransition(async () => {
      // Forget the Face ID / fingerprint login first: on success the action
      // redirects away and nothing after it runs.
      const biometricWasOn = await turnOffBiometricLogin();
      forgetPasskeyOnThisDevice();
      const result = await deleteAccount(typed);
      // Only reached on failure: the account still exists, put it back.
      if (result?.error) {
        if (biometricWasOn) await resaveBiometricLogin();
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto min-h-11 px-3 text-[13px] font-semibold text-danger underline-offset-2 hover:underline"
      >
        Eliminar mi cuenta
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={close}
              className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
              className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-surface p-5 shadow-[0_24px_64px_rgba(0,16,55,0.35)] lg:p-7"
            >
              <h2 id="delete-account-title" className="font-heading text-lg font-semibold text-ink">
                {blocked ? "Todavía no puedes eliminar tu cuenta" : "¿Eliminar tu cuenta?"}
              </h2>

              {blocked ? (
                <>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                    Eres el único dueño de <strong className="text-ink">{blocked.businessName}</strong> y hay más
                    personas en tu equipo. Si te vas, nadie podría administrar el negocio.
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                    Primero haz dueño a otra persona en Equipo (o quita a los demás miembros). Después vuelve aquí para
                    eliminar tu cuenta.
                  </p>
                  <div className="mt-5 flex gap-2.5">
                    <button
                      type="button"
                      onClick={close}
                      className="flex-1 rounded-[10px] bg-surface-2 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-3"
                    >
                      Cerrar
                    </button>
                    <Link
                      href={demo ? "#" : "/team"}
                      className="flex flex-1 items-center justify-center rounded-[10px] bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      Ir a Equipo
                    </Link>
                  </div>
                </>
              ) : (
                <form onSubmit={handleSubmit}>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                    Esto pasa de inmediato y no se puede deshacer:
                  </p>
                  <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-snug text-ink">
                    <li>
                      Se borra tu cuenta de cheke{email ? ` (${email})` : ""} y ya no podrás iniciar sesión con ella.
                    </li>
                    <li>Dejas de recibir avisos de mensajes en tus teléfonos.</li>
                    {leaving.map((b) => (
                      <li key={b.businessName}>
                        Sales de {b.businessName}. El negocio y sus conversaciones, contactos y catálogo siguen para el
                        resto del equipo.
                      </li>
                    ))}
                  </ul>

                  {deleting.map((b) => (
                    <div
                      key={b.businessName}
                      className="mt-3 rounded-[10px] border border-danger-border bg-danger-tint px-3.5 py-3 text-[13px] leading-snug text-danger"
                    >
                      <strong>Eres la única persona en {b.businessName}</strong>, así que también se elimina el negocio
                      completo: contactos, conversaciones, catálogo y fotos, plantillas, pedidos y canales conectados.
                    </div>
                  ))}

                  <p className="mt-3 text-[12.5px] leading-snug text-ink-soft">
                    Las copias de seguridad se borran solas en pocas semanas. Solo guardamos lo que la ley nos obligue
                    (por ejemplo, registros de facturación).
                  </p>

                  <label htmlFor="delete-confirm" className="mt-4 block text-[13px] text-ink">
                    Para confirmar, escribe <strong className="font-heading">{DELETE_CONFIRM_WORD}</strong>
                  </label>
                  <input
                    id="delete-confirm"
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      if (error) setError("");
                    }}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="mt-1.5 min-h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3.5 text-[14px] text-ink outline-none focus:border-danger focus:ring-2 focus:ring-danger-tint"
                  />
                  {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}

                  <div className="mt-5 flex gap-2.5">
                    <button
                      type="button"
                      onClick={close}
                      disabled={pending}
                      className="flex-1 rounded-[10px] bg-surface-2 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-3 disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!confirmed || pending || demo}
                      className="flex-1 rounded-[10px] bg-danger py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {pending ? "Eliminando…" : "Eliminar mi cuenta"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
