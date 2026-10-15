// Shown only in "Todas las tiendas" (2+ Tiendas on screen): which Tienda a
// conversation, card or notification belongs to, and a filter to narrow the
// combined list down to one Tienda. A Negocio with one Tienda never renders
// these (callers pass `storeNames` = null).

export type StoreNames = Record<string, string>;

export function StoreTag({ name, className = "" }: { name: string | undefined; className?: string }) {
  if (!name) return null;
  return (
    <span
      title={name}
      className={`inline-flex max-w-[140px] shrink-0 items-center gap-1 truncate rounded-md bg-surface-2 px-1.5 py-[1px] text-[10.5px] font-semibold text-ink-muted ${className}`}
    >
      <StoreIcon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

// Same pill vocabulary as Chat's channel filter, so it reads as one more
// filter rather than a new control.
export function StoreFilter({
  storeNames,
  value,
  onChange,
  className = "",
}: {
  storeNames: StoreNames;
  value: string | "all";
  onChange: (value: string | "all") => void;
  className?: string;
}) {
  const options: Array<[string, string]> = [["all", "Todas las tiendas"], ...Object.entries(storeNames)];
  return (
    <div role="group" aria-label="Filtrar por tienda" className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map(([id, label]) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`rounded-lg border px-2.5 py-[5px] text-[12.5px] font-semibold transition-colors ${
              active ? "border-brand-dark bg-brand-dark text-white" : "border-border bg-surface-2 text-ink-muted hover:bg-surface-3"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function StoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 11v9h14v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
