"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import type { StoreRef } from "@/lib/stores";
import type { AddressForm, ChekelinInfo } from "@/lib/types";
import { saveChekelinInfo } from "./actions";

const FIELDS: Array<{ key: keyof Omit<ChekelinInfo, "address_form">; label: string; hint: string; placeholder: string; max: number }> = [
  {
    key: "payment_methods",
    label: "Formas de pago",
    hint: "chekelin se los manda al cliente cuando confirma su pedido.",
    placeholder: "Ej. Transferencia BAC 7300-1122-33 a nombre de Tienda Luna, o link de pago con tarjeta: https://…",
    max: 2000,
  },
  {
    key: "shipping",
    label: "Envíos",
    hint: "A dónde envían, con quién, cuánto cuesta y cuánto tarda.",
    placeholder: "Ej. Cargo Expreso. Tegucigalpa L 80, San Pedro Sula L 120, resto del país L 150. Llega en 1 a 2 días hábiles.",
    max: 2000,
  },
  {
    key: "delivery_hours",
    label: "Recoger en tienda y horarios",
    hint: "Si se puede recoger, dónde y cuándo, y en qué horario entregan.",
    placeholder: "Ej. Lunes a sábado de 9 a. m. a 5 p. m. Se puede recoger en la tienda de col. Palmira.",
    max: 2000,
  },
  {
    key: "returns_policy",
    label: "Cambios y devoluciones",
    hint: "chekelin nunca promete un cambio o un reembolso: solo explica la política.",
    placeholder: "Ej. Cambios de talla dentro de 7 días con la etiqueta puesta. No hay devoluciones de dinero.",
    max: 2000,
  },
  {
    key: "faq",
    label: "Otras preguntas frecuentes",
    hint: "Lo que más te preguntan y no está arriba.",
    placeholder: "Ej. ¿Hacen pedidos al por mayor? Sí, desde 12 piezas, lo ve directamente el equipo.",
    max: 4000,
  },
];

const ADDRESS_OPTIONS: Array<{ id: AddressForm; label: string; hint: string }> = [
  { id: "mirror", label: "Como le hable el cliente", hint: "Recomendado" },
  { id: "vos", label: "Vos", hint: "¿Qué andás buscando?" },
  { id: "tu", label: "Tú", hint: "¿Qué buscas?" },
  { id: "usted", label: "Usted", hint: "¿Qué anda buscando?" },
];

export function ChekelinInfoView({
  store,
  stores,
  info,
  canEdit,
}: {
  store: StoreRef;
  // The Tiendas to switch between (empty with only one).
  stores: StoreRef[];
  info: ChekelinInfo;
  canEdit: boolean;
}) {
  const [form, setForm] = useState<ChekelinInfo>(info);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(info);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveChekelinInfo(store.id, form);
      setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: "Guardado. chekelin ya lo usa." });
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 lg:px-8 lg:py-[18px]">
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Lo que chekelin sabe de tu negocio
            <BrandMark />
          </h1>
          <p className="text-[13.5px] text-ink-muted">{stores.length > 0 ? store.name : "Con esto atiende y vende por ti"}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <form onSubmit={handleSave} className="mx-auto flex max-w-[640px] flex-col gap-4 lg:gap-5">
          {stores.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tienda">
              {stores.map((s) => (
                <Link
                  key={s.id}
                  href={`/chekelin?tienda=${s.id}`}
                  role="tab"
                  aria-selected={s.id === store.id}
                  className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ${
                    s.id === store.id
                      ? "border-brand-dark bg-brand-dark text-white"
                      : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
                  }`}
                >
                  {s.name}
                </Link>
              ))}
            </div>
          )}

          <p className="px-1 text-[13.5px] leading-relaxed text-ink-muted">
            chekelin responde, recomienda, toma pedidos y manda los datos de pago usando esto, tu{" "}
            <Link href="/inventory" className="font-semibold text-brand">
              Catálogo
            </Link>{" "}
            y tus{" "}
            <Link href="/templates" className="font-semibold text-brand">
              Plantillas
            </Link>
            . Escribe corto, como se lo dirías a un cliente. Si algo no está aquí, chekelin no lo inventa: le dice al
            cliente que lo confirma, te avisa a ti y sigue atendiendo lo demás.
          </p>
          {!canEdit && (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-muted">
              Solo el dueño o el gerente de la tienda puede cambiar esta información.
            </p>
          )}

          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface px-4 py-4 lg:px-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-[13.5px] font-semibold text-ink">{f.label}</span>
                <span className="text-[12px] text-ink-soft">{f.hint}</span>
                <textarea
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  readOnly={!canEdit}
                  rows={3}
                  maxLength={f.max}
                  className="mt-1 resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-[16px] leading-snug text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint lg:text-[13.5px]"
                />
              </label>
            ))}
          </div>

          <fieldset className="flex flex-col gap-2 rounded-2xl border border-border bg-surface px-4 py-4 lg:px-5">
            <legend className="px-1 text-[13.5px] font-semibold text-ink">¿Cómo le habla chekelin al cliente?</legend>
            {ADDRESS_OPTIONS.map((o) => (
              <label key={o.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13.5px] text-ink">
                <input
                  type="radio"
                  name="address_form"
                  value={o.id}
                  checked={form.address_form === o.id}
                  disabled={!canEdit}
                  onChange={() => setForm((prev) => ({ ...prev, address_form: o.id }))}
                  className="h-4 w-4 accent-[var(--color-brand)]"
                />
                <span className="font-semibold">{o.label}</span>
                <span className="text-ink-soft">{o.hint}</span>
              </label>
            ))}
          </fieldset>

          {message && (
            <p className={`px-1 text-[13px] ${message.ok ? "text-brand-dark" : "text-danger"}`} role="status">
              {message.text}
            </p>
          )}
          {canEdit && (
            <button
              type="submit"
              disabled={pending || !dirty}
              className="min-h-11 rounded-lg bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
