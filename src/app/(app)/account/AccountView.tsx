"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut, updateDisplayName } from "./actions";
import { initialsFor, relativeTime } from "@/lib/format";
import { BrandMark } from "@/components/BrandMark";
import type { UserInfo } from "@/lib/user";
import { isPlanActive, planLabel, PLAN_LAPSED_MESSAGE } from "@/lib/plan";
import { DeleteAccountButton, type DeletionSummary } from "./DeleteAccountDialog";

const ROLE_LABEL = { owner: "Dueño", agent: "Agente" } as const;

export function AccountView({
  user,
  provider,
  lastSignIn,
  business,
  deletion = [],
  demo = false,
}: {
  user: UserInfo;
  provider: "google" | "email";
  lastSignIn: string | null;
  business: { name: string; plan: string; role: "owner" | "agent" };
  // What "Eliminar mi cuenta" would do to each Negocio this person is in.
  deletion?: DeletionSummary;
  // The /demo phone has no real session, so saving and logging out are
  // shown but do nothing there.
  demo?: boolean;
}) {
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const dirty = name.trim() !== user.name;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return;
    setStatus("saving");
    const result = await updateDisplayName(name);
    if (result.error) {
      setError(result.error);
      setStatus("error");
    } else {
      setError("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 lg:px-8 lg:py-[18px]">
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Mi cuenta
            <BrandMark />
          </h1>
          <p className="text-[13.5px] text-ink-muted">Tus datos y tu sesión en {business.name}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <div className="mx-auto flex max-w-[640px] flex-col gap-4 lg:gap-5">
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              {initialsFor(user.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate font-heading text-[17px] font-semibold text-ink">{user.name}</div>
              <div className="truncate text-[13.5px] text-ink-muted">{user.email}</div>
              <span className="mt-1.5 inline-block rounded-full bg-brand-tint px-2.5 py-0.5 text-[11.5px] font-semibold text-brand-dark">
                {ROLE_LABEL[business.role]}
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="rounded-2xl border border-border bg-surface p-5">
            <label htmlFor="display-name" className="text-xs uppercase tracking-wide text-ink-muted">
              Tu nombre
            </label>
            <p className="mb-2 mt-0.5 text-[12.5px] text-ink-soft">Así te ve tu equipo en cheke.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="display-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (status !== "idle") setStatus("idle");
                }}
                maxLength={60}
                className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
              />
              <button
                type="submit"
                disabled={!dirty || status === "saving"}
                className="min-h-11 rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white disabled:opacity-50"
              >
                {status === "saving" ? "Guardando…" : status === "saved" ? "¡Guardado!" : "Guardar"}
              </button>
            </div>
            {status === "error" && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
          </form>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <Row label="Negocio" value={business.name} />
            {/* Name and status only. Anything that sells a plan (prices,
                upgrade, payment methods) goes in <HideInNativeApp>. */}
            <Row label="Plan" value={isPlanActive(business.plan) ? planLabel(business.plan) : PLAN_LAPSED_MESSAGE} />
            <Row label="Inicio de sesión" value={provider === "google" ? "Google" : "Código por correo"} />
            {lastSignIn && <Row label="Último acceso" value={relativeTime(lastSignIn)} />}
            <Link
              href={demo ? "#" : "/team"}
              className="flex items-center justify-between px-5 py-3.5 text-[13.5px] font-semibold text-brand hover:bg-surface-2"
            >
              Ver mi equipo e invitar personas
              <span aria-hidden>›</span>
            </Link>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-[12.5px] text-ink-soft">
            <Link href="/privacidad" className="underline underline-offset-2">Privacidad</Link>
            <Link href="/terminos" className="underline underline-offset-2">Términos</Link>
            <Link href="/eliminar-datos" className="underline underline-offset-2">Eliminar mis datos</Link>
          </div>

          {demo ? (
            <Link
              href="/demo"
              className="flex min-h-12 items-center justify-center rounded-xl border border-danger-border bg-danger-tint text-[14px] font-semibold text-danger"
            >
              Cerrar sesión
            </Link>
          ) : (
            <form action={signOut}>
              <button
                type="submit"
                className="flex min-h-12 w-full items-center justify-center rounded-xl border border-danger-border bg-danger-tint text-[14px] font-semibold text-danger transition-colors hover:bg-danger/10"
              >
                Cerrar sesión
              </button>
            </form>
          )}

          <DeleteAccountButton email={user.email} deletion={deletion} demo={demo} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 text-[13.5px]">
      <span className="text-ink-muted">{label}</span>
      <span className="truncate font-semibold text-ink">{value}</span>
    </div>
  );
}
