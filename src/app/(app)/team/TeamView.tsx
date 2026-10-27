"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  updateMemberRole,
  removeMember,
  setMemberStore,
  createInvitation,
  cancelInvitation,
  setMemberAway,
} from "./actions";
import { initialsFromEmail, relativeTime } from "@/lib/format";
import { canManageStore, ROLE_LABEL, type CurrentBusiness, type Role } from "@/lib/stores";
import type { TeamMember } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";

export type PendingInvitation = {
  id: string;
  token: string;
  role: Role;
  store_ids: string[];
  expires_at: string;
};

// Which Tiendas each Gerente/Agente is in: user id → store ids.
export type StoreMembership = Record<string, string[]>;

export function TeamView({
  business,
  members,
  storeMembership = {},
  invitations = [],
  currentUserId,
  demo = false,
}: {
  business: CurrentBusiness;
  members: TeamMember[];
  storeMembership?: StoreMembership;
  invitations?: PendingInvitation[];
  currentUserId: string;
  // The /demo phone: shown, but nothing is saved.
  demo?: boolean;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const isOwner = business.role === "owner";
  const multi = business.multiStore;
  const storeName = (id: string) => business.allStores.find((s) => s.id === id)?.name ?? "";

  async function run(action: () => Promise<{ error?: string }>) {
    if (demo) return;
    const result = await action();
    if (result.error) setToast(result.error);
  }

  function handleRemove(userId: string, email: string) {
    if (!confirm(`¿Quitar a ${email} del negocio?`)) return;
    run(() => removeMember(userId));
  }

  // Ausente and Asignación only mean something with 2+ people.
  const showAway = members.length >= 2;
  const managedStoreIds = new Set(business.stores.filter((s) => canManageStore(business, s.id)).map((s) => s.id));
  function canSetAway(m: TeamMember): boolean {
    if (m.user_id === currentUserId || isOwner) return true;
    return business.role === "manager" && m.role === "agent" && (storeMembership[m.user_id] ?? []).some((id) => managedStoreIds.has(id));
  }

  const owners = members.filter((m) => m.role === "owner");
  const hasStore = (userId: string) => business.stores.some((s) => storeMembership[userId]?.includes(s.id));
  const others = members.filter((m) => m.role !== "owner");

  function memberRow(m: TeamMember, storeId?: string) {
    const isMe = m.user_id === currentUserId;
    const canTakeOut =
      storeId !== undefined &&
      !isMe &&
      (isOwner || (business.role === "manager" && m.role === "agent" && canManageStore(business, storeId)));
    return (
      <div
        key={`${storeId ?? "all"}-${m.user_id}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 lg:gap-x-4 lg:px-5 lg:py-3.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">
            {initialsFromEmail(m.email)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink">{m.name || m.email}</div>
            <div className="text-[11px] text-ink-soft">
              {isMe && <span className="text-brand">Tú · </span>}
              {m.name && <span>{m.email} · </span>}
              Desde {relativeTime(m.joined_at)}
              {multi && storeId === undefined && m.role !== "owner" && !hasStore(m.user_id) && (
                <span className="text-danger"> · Sin tienda: no ve conversaciones</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 lg:gap-2">
          {showAway &&
            (canSetAway(m) ? (
              <AwaySwitch
                away={Boolean(m.away)}
                label={isMe ? "Tu disponibilidad" : `Disponibilidad de ${m.name || m.email}`}
                onChange={(away) => run(() => setMemberAway(m.user_id, away))}
              />
            ) : (
              m.away && (
                <span className="rounded-md bg-surface-2 px-2 py-1 text-[11.5px] font-semibold text-ink-muted">Ausente</span>
              )
            ))}
          {isOwner && !isMe && storeId === undefined ? (
            <select
              value={m.role}
              aria-label={`Rol de ${m.email}`}
              onChange={(e) => run(() => updateMemberRole(m.user_id, e.target.value as Role))}
              className="h-10 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brand lg:h-auto"
            >
              <option value="owner">Dueño</option>
              <option value="manager">Gerente</option>
              <option value="agent">Agente</option>
            </select>
          ) : (
            <span
              className={`inline-block rounded-md px-2 py-1 text-[11.5px] font-semibold ${
                m.role === "owner" ? "bg-brand-tint text-brand-dark" : "bg-surface-2 text-ink-muted"
              }`}
            >
              {ROLE_LABEL[m.role]}
            </span>
          )}
          {canTakeOut && (
            <button
              onClick={() => run(() => setMemberStore(m.user_id, m.role, storeId, false))}
              className="h-10 rounded-lg px-2 text-[12.5px] font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink lg:h-auto lg:py-1.5"
            >
              Quitar de la tienda
            </button>
          )}
          {isOwner && !isMe && storeId === undefined && (
            <button
              onClick={() => handleRemove(m.user_id, m.email)}
              aria-label="Quitar del negocio"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft hover:bg-danger-tint hover:text-danger lg:block lg:h-auto lg:w-auto lg:p-1.5"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 lg:px-8 lg:py-[18px]">
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Equipo
            <BrandMark />
          </h1>
          <p className="text-[13.5px] text-ink-muted">Quién tiene acceso a {business.name} y qué rol tiene</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 lg:gap-5">
          <InviteCard business={business} demo={demo} onError={setToast} />

          {showAway && (
            <p className="px-1 text-[12.5px] leading-snug text-ink-soft">
              Los chats nuevos van a quien esté <span className="font-semibold text-ink-muted">Disponible</span>. Con
              Ausente no te llegan nuevos.
            </p>
          )}

          {invitations.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-soft lg:px-5">
                Invitaciones sin usar
              </div>
              {invitations.map((inv) => (
                <PendingRow
                  key={inv.id}
                  invitation={inv}
                  storeNames={multi ? inv.store_ids.map(storeName).filter(Boolean) : []}
                  onCancel={() => run(() => cancelInvitation(inv.id))}
                  onError={setToast}
                />
              ))}
            </div>
          )}

          {/* No separate column-header row — on a narrow screen a header's
              columns and a data row's columns can wrap independently and
              drift apart. Each row below is self-contained instead. */}
          {!multi ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">{members.map((m) => memberRow(m))}</div>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="px-1 font-heading text-[15.5px] font-semibold text-ink">
                  Dueños <span className="text-[13px] font-normal text-ink-muted">· todas las tiendas</span>
                </h2>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">{owners.map((m) => memberRow(m))}</div>
              </section>

              {business.stores.map((store) => {
                const inStore = others.filter((m) => storeMembership[m.user_id]?.includes(store.id));
                const canAdd = isOwner || (business.role === "manager" && canManageStore(business, store.id));
                const addable = others.filter(
                  (m) => !storeMembership[m.user_id]?.includes(store.id) && (isOwner || m.role === "agent"),
                );
                return (
                  <section key={store.id} className="flex flex-col gap-2">
                    <h2 className="px-1 font-heading text-[15.5px] font-semibold text-ink">{store.name}</h2>
                    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                      {inStore.map((m) => memberRow(m, store.id))}
                      {inStore.length === 0 && (
                        <div className="px-4 py-3 text-[13px] text-ink-soft lg:px-5">Nadie más trabaja en esta tienda todavía.</div>
                      )}
                      {canAdd && addable.length > 0 && (
                        <div className="flex items-center gap-2 border-t border-border bg-surface-2/60 px-4 py-2.5 lg:px-5">
                          <label htmlFor={`add-${store.id}`} className="text-[12.5px] text-ink-muted">
                            Agregar a esta tienda:
                          </label>
                          <select
                            id={`add-${store.id}`}
                            value=""
                            onChange={(e) => {
                              const m = addable.find((a) => a.user_id === e.target.value);
                              if (m) run(() => setMemberStore(m.user_id, m.role, store.id, true));
                            }}
                            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-brand lg:h-9 lg:max-w-xs"
                          >
                            <option value="">Elige a alguien del equipo</option>
                            {addable.map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.email} · {ROLE_LABEL[m.role]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}

              {isOwner && (
                <section className="flex flex-col gap-2">
                  <h2 className="px-1 font-heading text-[15.5px] font-semibold text-ink">
                    Roles <span className="text-[13px] font-normal text-ink-muted">· gerentes y agentes de todas las tiendas</span>
                  </h2>
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                    {others.map((m) => memberRow(m))}
                    {others.length === 0 && (
                      <div className="px-4 py-3 text-[13px] text-ink-soft lg:px-5">Todavía no has invitado a nadie.</div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

// Replaces the old shared invite code: each link works once, for 7 days,
// with the role (and Tiendas) chosen here.
function InviteCard({
  business,
  demo,
  onError,
}: {
  business: CurrentBusiness;
  demo: boolean;
  onError: (message: string) => void;
}) {
  const isOwner = business.role === "owner";
  const canInvite = isOwner || business.role === "manager";
  const roles: Role[] = isOwner ? ["agent", "manager", "owner"] : ["agent"];
  const manageable = business.stores.filter((s) => canManageStore(business, s.id));
  const [role, setRole] = useState<Role>("agent");
  const [storeIds, setStoreIds] = useState<string[]>(manageable.length === 1 ? [manageable[0].id] : []);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const askStores = business.multiStore && role !== "owner" && manageable.length > 1;

  if (!canInvite) {
    return (
      <div className="rounded-2xl bg-brand-dark px-5 py-4.5 text-white lg:px-6 lg:py-5">
        <div className="font-heading text-[17px] font-semibold">Invitar a alguien</div>
        <p className="mt-1 text-[13px] text-[#A9B1CC]">Pídele al dueño o a un gerente que te mande un link de invitación para esa persona.</p>
      </div>
    );
  }

  async function handleCreate() {
    if (demo) return;
    setBusy(true);
    const result = await createInvitation(role, askStores ? storeIds : []);
    setBusy(false);
    if (result.error || !result.token) {
      onError(result.error ?? "No se pudo crear la invitación.");
      return;
    }
    setCopied(false);
    setLink(`${window.location.origin}/invitacion/${result.token}`);
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("No se pudo copiar — el link es: " + link);
    }
  }

  const whatsappText = link ? encodeURIComponent(`Te invito a ${business.name} en cheke: ${link}`) : "";

  return (
    <div className="rounded-2xl bg-brand-dark px-5 py-4.5 text-white lg:px-6 lg:py-5">
      <div className="font-heading text-[17px] font-semibold">Invitar a alguien</div>
      <p className="mt-1 text-[13px] text-[#A9B1CC]">
        Crea un link y mándaselo a esa persona. Sirve una sola vez y vence en 7 días.
      </p>

      {roles.length > 1 && (
        <div className="mt-3.5" role="group" aria-label="Rol">
          <div className="mb-1.5 text-[12px] text-[#A9B1CC]">Entra como</div>
          <div className="grid grid-cols-3 gap-1.5 lg:flex">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => {
                  setRole(r);
                  setLink(null);
                }}
                className={`min-h-10 rounded-lg px-3 text-[13px] font-semibold transition-colors lg:min-h-9 ${
                  role === r ? "bg-white text-brand-dark" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-[#A9B1CC]">{ROLE_HINT[role]}</p>
        </div>
      )}

      {askStores && (
        <div className="mt-3.5" role="group" aria-label="Tiendas">
          <div className="mb-1.5 text-[12px] text-[#A9B1CC]">En qué tiendas trabaja</div>
          <div className="flex flex-wrap gap-1.5">
            {manageable.map((s) => {
              const on = storeIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setStoreIds((prev) => (on ? prev.filter((id) => id !== s.id) : [...prev, s.id]));
                    setLink(null);
                  }}
                  className={`min-h-10 rounded-lg px-3 text-[13px] font-semibold transition-colors lg:min-h-9 ${
                    on ? "bg-accent text-brand-dark" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {link ? (
        <div className="mt-4 flex flex-col gap-2">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link de invitación"
            className="min-h-11 w-full rounded-lg bg-white/10 px-3 text-[13px] text-white outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={handleCopy}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-[13.5px] font-semibold text-brand-dark lg:min-h-10"
            >
              <CopyIcon className="h-3.5 w-3.5" />
              {copied ? "¡Copiado!" : "Copiar link"}
            </button>
            <a
              href={`https://wa.me/?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center rounded-lg bg-white/10 px-4 text-[13.5px] font-semibold text-white hover:bg-white/20 lg:min-h-10"
            >
              Enviar por WhatsApp
            </a>
            <button
              onClick={() => setLink(null)}
              className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-[#A9B1CC] hover:text-white lg:min-h-10"
            >
              Crear otro
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleCreate}
          disabled={busy || (askStores && storeIds.length === 0)}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 lg:w-auto"
        >
          {busy ? "Creando link…" : "Crear link de invitación"}
        </button>
      )}
    </div>
  );
}

// Disponible / Ausente, as a two-option segmented control (clearer than a
// bare toggle for people who aren't tech-savvy).
function AwaySwitch({ away, label, onChange }: { away: boolean; label: string; onChange: (away: boolean) => void }) {
  return (
    <div role="group" aria-label={label} className="flex h-10 rounded-lg bg-surface-2 p-0.5 lg:h-8">
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={away === value}
          onClick={() => away !== value && onChange(value)}
          className={`rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
            away === value
              ? value
                ? "bg-ink-muted text-white"
                : "bg-surface text-brand-dark shadow-[0_1px_2px_rgba(0,16,55,0.12)]"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {value ? "Ausente" : "Disponible"}
        </button>
      ))}
    </div>
  );
}

const ROLE_HINT: Record<Role, string> = {
  agent: "Responde conversaciones y mueve ventas.",
  manager: "Además conecta canales, maneja el catálogo e invita agentes.",
  owner: "Acceso completo, incluido el plan.",
};

function PendingRow({
  invitation,
  storeNames,
  onCancel,
  onError,
}: {
  invitation: PendingInvitation;
  storeNames: string[];
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [now] = useState(() => Date.now());
  const days = Math.max(1, Math.ceil((new Date(invitation.expires_at).getTime() - now) / 86_400_000));

  async function copy() {
    const link = `${window.location.origin}/invitacion/${invitation.token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("No se pudo copiar — el link es: " + link);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0 lg:px-5">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink">
          {ROLE_LABEL[invitation.role]}
          {storeNames.length > 0 && <span className="font-normal text-ink-muted"> · {storeNames.join(", ")}</span>}
        </div>
        <div className="text-[11px] text-ink-soft">Vence en {days} día{days === 1 ? "" : "s"}</div>
      </div>
      <button onClick={copy} className="h-10 rounded-lg px-3 text-[12.5px] font-semibold text-brand hover:bg-brand-tint lg:h-8">
        {copied ? "¡Copiado!" : "Copiar link"}
      </button>
      <button onClick={onCancel} className="h-10 rounded-lg px-3 text-[12.5px] font-semibold text-ink-muted hover:bg-danger-tint hover:text-danger lg:h-8">
        Anular
      </button>
    </div>
  );
}

function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {/* Phones: sits above the bottom tab bar, and w-max + a viewport cap
          stops left-1/2 from squeezing it to half the screen width. */}
      {message && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
          className="fixed bottom-24 left-1/2 z-30 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 lg:bottom-6 lg:w-auto lg:max-w-[460px] items-center gap-2.5 rounded-xl bg-brand-dark px-4.5 py-3 text-white shadow-[0_12px_32px_rgba(0,16,55,0.3)]"
        >
          <div className="text-[13px] leading-relaxed">{message}</div>
          <button onClick={onClose} aria-label="Cerrar" className="ml-1 shrink-0 text-[#A9B1CC]">
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
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
