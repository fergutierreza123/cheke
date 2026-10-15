"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { selectStore } from "@/app/(app)/stores/actions";

// A Dueño reading an archived Tienda's history ("Ver historial" in
// Administrar tiendas): a quiet reminder, with the way back.
export function ArchivedStoreBanner({ name }: { name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-surface-2 px-4 py-2 text-center text-[12.5px] text-ink-muted">
      <span>
        Estás viendo el historial de <strong className="text-ink">{name}</strong>, una tienda archivada.
      </span>
      <button
        onClick={() =>
          startTransition(async () => {
            await selectStore("all");
            router.refresh();
          })
        }
        disabled={pending}
        className="font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-60"
      >
        Volver
      </button>
    </div>
  );
}
