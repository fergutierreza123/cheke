"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { updateMemberRole, removeMember } from "./actions";
import { initialsFromEmail, relativeTime } from "@/lib/format";
import type { CurrentBusiness } from "@/lib/business";
import type { TeamMember } from "@/lib/types";

export function TeamView({
  business,
  members,
  currentUserId,
}: {
  business: CurrentBusiness;
  members: TeamMember[];
  currentUserId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isOwner = business.role === "owner";

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(business.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast("No se pudo copiar — el código es: " + business.inviteCode);
    }
  }

  async function handleRoleChange(userId: string, role: "owner" | "agent") {
    const result = await updateMemberRole(userId, role);
    if (result.error) setToast(result.error);
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`¿Quitar a ${email} del negocio?`)) return;
    const result = await removeMember(userId);
    if (result.error) setToast(result.error);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-8 py-[18px]">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Equipo</h1>
          <p className="text-[13.5px] text-ink-muted">Quién tiene acceso a {business.name} y qué rol tiene</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-brand-dark px-6 py-5 text-white">
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] uppercase tracking-wide text-[#A9B1CC]">Código de invitación</div>
              <div className="font-heading text-2xl font-bold tracking-wide">{business.inviteCode}</div>
              <p className="mt-1 text-[13px] text-[#A9B1CC]">
                Comparte este código — en la pantalla de inicio pueden unirse a {business.name} con él.
              </p>
            </div>
            <button
              onClick={handleCopyInvite}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
            >
              <CopyIcon className="h-3.5 w-3.5" />
              {copied ? "¡Copiado!" : "Copiar código"}
            </button>
          </div>

          {/* No separate column-header row — on a narrow screen a header's
              columns and a data row's columns can wrap independently and
              drift apart. Each row below is self-contained instead: the
              role pill and the date read fine on their own with no header
              to line up with. */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {members.map((m) => {
              const isMe = m.user_id === currentUserId;
              return (
                <div
                  key={m.user_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">
                      {initialsFromEmail(m.email)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-ink">{m.email}</div>
                      <div className="text-[11px] text-ink-soft">
                        {isMe && <span className="text-brand">Tú · </span>}
                        Desde {relativeTime(m.joined_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOwner && !isMe ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value as "owner" | "agent")}
                        className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brand"
                      >
                        <option value="owner">Dueño</option>
                        <option value="agent">Agente</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-block rounded-md px-2 py-1 text-[11.5px] font-semibold ${
                          m.role === "owner" ? "bg-brand-tint text-brand-dark" : "bg-surface-2 text-ink-muted"
                        }`}
                      >
                        {m.role === "owner" ? "Dueño" : "Agente"}
                      </span>
                    )}
                    {isOwner && !isMe && (
                      <button
                        onClick={() => handleRemove(m.user_id, m.email)}
                        aria-label="Quitar del negocio"
                        className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-tint hover:text-danger"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed bottom-6 left-1/2 z-30 flex max-w-[460px] -translate-x-1/2 items-center gap-2.5 rounded-xl bg-brand-dark px-4.5 py-3 text-white shadow-[0_12px_32px_rgba(0,16,55,0.3)]"
          >
            <div className="text-[13px] leading-relaxed">{toast}</div>
            <button onClick={() => setToast(null)} aria-label="Cerrar" className="ml-1 shrink-0 text-[#A9B1CC]">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
