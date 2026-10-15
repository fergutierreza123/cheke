"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { selectStore } from "@/app/(app)/stores/actions";
import type { StoreRef, StoreSelection } from "@/lib/stores";
import { StoreIcon } from "@/components/StoreTag";

// The store selector, only rendered when the person works in 2+ Tiendas.
// A native <select>: on phones it opens the system picker everyone already
// knows. "Todas las tiendas" combines Chat, Chekeo, Notificaciones and
// Analítica; the choice is remembered (cookie) and applies to every screen.
export type StoreSwitcherProps = {
  stores: StoreRef[];
  selected: StoreSelection;
  archivedSelected: StoreRef | null;
  canManage: boolean;
};

export function StoreSwitcher({
  stores,
  selected,
  archivedSelected,
  canManage,
  variant = "sidebar",
  onNavigate,
}: {
  stores: StoreRef[];
  selected: StoreSelection;
  // A Dueño reading an archived Tienda's history.
  archivedSelected: StoreRef | null;
  // Dueños: link to create / rename / archive Tiendas.
  canManage: boolean;
  variant?: "sidebar" | "sheet";
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(value: string) {
    startTransition(async () => {
      await selectStore(value);
      router.refresh();
    });
  }

  const sheet = variant === "sheet";
  return (
    <div className={sheet ? "mb-1 px-1" : "px-4 pb-4"}>
      <label
        className={`relative flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.06] px-3 transition-colors focus-within:border-accent hover:bg-white/[0.09] ${
          sheet ? "min-h-12" : "min-h-10"
        } ${pending ? "opacity-70" : ""}`}
      >
        <StoreIcon className="h-4 w-4 shrink-0 text-accent" />
        <span className="sr-only">Tienda</span>
        <select
          value={archivedSelected ? archivedSelected.id : selected}
          onChange={(e) => handleChange(e.target.value)}
          disabled={pending}
          className={`min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-5 font-semibold text-white outline-none ${
            sheet ? "text-[15px]" : "text-[13.5px]"
          }`}
        >
          <option value="all" className="text-ink">
            Todas las tiendas
          </option>
          {stores.map((s) => (
            <option key={s.id} value={s.id} className="text-ink">
              {s.name}
            </option>
          ))}
          {archivedSelected && (
            <option value={archivedSelected.id} className="text-ink">
              {archivedSelected.name} (archivada)
            </option>
          )}
        </select>
        <ChevronIcon className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-[#9AA3C4]" />
      </label>
      {canManage && (
        <Link
          href="/stores"
          onClick={onNavigate}
          className={`mt-1.5 inline-block px-1 text-[#9AA3C4] underline-offset-2 hover:text-white hover:underline ${
            sheet ? "text-[13px]" : "text-[12px]"
          }`}
        >
          Administrar tiendas
        </Link>
      )}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
