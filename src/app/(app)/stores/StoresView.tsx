"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { StoreIcon } from "@/components/StoreTag";
import type { StoreRef } from "@/lib/stores";
import { archiveStore, createStore, renameStore, reopenStore, selectStore } from "./actions";

export function StoresView({
  businessName,
  stores,
  archivedStores,
}: {
  businessName: string;
  stores: StoreRef[];
  archivedStores: StoreRef[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function handleArchive(store: StoreRef) {
    const ok = window.confirm(
      `¿Archivar ${store.name}? Se desconectan sus canales y deja de verse en el día a día. Su historial se guarda y puedes reabrirla cuando quieras.`,
    );
    if (ok) run(() => archiveStore(store.id));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 lg:px-8 lg:py-[18px]">
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Tiendas
            <BrandMark />
          </h1>
          <p className="text-[13.5px] text-ink-muted">Las tiendas de {businessName}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <div className="mx-auto flex max-w-[640px] flex-col gap-4 lg:gap-5">
          <p className="px-1 text-[13.5px] leading-relaxed text-ink-muted">
            Cada tienda tiene sus propios canales, catálogo y chekeo, y su equipo solo ve sus conversaciones. Los
            contactos y las plantillas se comparten entre todas.
          </p>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {stores.map((store) => (
              <div key={store.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                  <StoreIcon className="h-4 w-4" />
                </span>
                {editingId === store.id ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => renameStore(store.id, editName), () => setEditingId(null));
                    }}
                  >
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={60}
                      aria-label="Nombre de la tienda"
                      className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                    />
                    <button type="submit" disabled={pending} className="min-h-10 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white disabled:opacity-60">
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-ink-muted hover:bg-surface-2">
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{store.name}</div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => {
                          setEditingId(store.id);
                          setEditName(store.name);
                        }}
                        className="min-h-10 rounded-lg px-3 text-[12.5px] font-semibold text-brand hover:bg-brand-tint lg:min-h-8"
                      >
                        Cambiar nombre
                      </button>
                      {stores.length > 1 && (
                        <button
                          onClick={() => handleArchive(store)}
                          disabled={pending}
                          className="min-h-10 rounded-lg px-3 text-[12.5px] font-semibold text-ink-muted hover:bg-danger-tint hover:text-danger disabled:opacity-60 lg:min-h-8"
                        >
                          Archivar
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <form
            className="rounded-2xl border border-border bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createStore(newName), () => setNewName(""));
            }}
          >
            <label htmlFor="new-store" className="font-heading text-[15.5px] font-semibold text-ink">
              Agregar una tienda
            </label>
            <p className="mb-2.5 mt-0.5 text-[12.5px] text-ink-soft">
              Después conectas sus canales en Canales e invitas a su equipo en Equipo.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="new-store"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={60}
                placeholder="Ej. Boutique Alaia – Mall Multiplaza"
                className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
              />
              <button
                type="submit"
                disabled={pending || !newName.trim()}
                className="min-h-11 rounded-[10px] bg-brand px-4 text-[13.5px] font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Agregar tienda"}
              </button>
            </div>
          </form>

          {error && (
            <div role="alert" className="rounded-lg border border-danger-border bg-danger-tint px-4 py-3 text-[13px] text-danger">
              {error}
            </div>
          )}

          {archivedStores.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 font-heading text-[15.5px] font-semibold text-ink">Archivadas</h2>
              <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                {archivedStores.map((store) => (
                  <div key={store.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink-muted">{store.name}</div>
                      <div className="text-[11.5px] text-ink-soft">Canales desconectados · historial guardado</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => run(() => selectStore(store.id), () => router.push("/chat"))}
                        disabled={pending}
                        className="min-h-10 rounded-lg px-3 text-[12.5px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-60 lg:min-h-8"
                      >
                        Ver historial
                      </button>
                      <button
                        onClick={() => run(() => reopenStore(store.id))}
                        disabled={pending}
                        className="min-h-10 rounded-lg px-3 text-[12.5px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60 lg:min-h-8"
                      >
                        Reabrir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
