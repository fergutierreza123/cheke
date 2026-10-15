"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { selectStore } from "@/app/(app)/stores/actions";
import { BrandMark } from "@/components/BrandMark";
import { StoreIcon } from "@/components/StoreTag";
import type { StoreRef } from "@/lib/stores";

// For screens that only make sense one Tienda at a time (Catálogo) while
// "Todas las tiendas" is selected: pick one, and the whole app switches to it.
export function StorePicker({ title, message, stores }: { title: string; message: string; stores: StoreRef[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 lg:px-8 lg:py-[18px]">
        <h1 className="flex flex-1 items-center justify-between gap-2 font-heading text-xl font-semibold text-ink lg:flex-none">
          {title}
          <BrandMark />
        </h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-10">
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-[14px] text-ink-muted">{message}</p>
          {stores.map((s) => (
            <button
              key={s.id}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await selectStore(s.id);
                  router.refresh();
                })
              }
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left transition-colors hover:border-brand hover:bg-brand-tint disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                <StoreIcon className="h-4.5 w-4.5" />
              </span>
              <span className="flex-1 font-semibold text-ink">{s.name}</span>
              <span aria-hidden className="text-lg text-ink-soft">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
