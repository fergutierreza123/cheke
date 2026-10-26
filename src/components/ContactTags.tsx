"use client";

import { useId, useState } from "react";
import { setContactTags } from "@/app/(app)/contacts/actions";
import { normalizeTag, TAG_MAX } from "@/lib/tags";

// A Contacto's Etiquetas as chips, as in design/Contacts.html. With
// `suggestions` the chips can be removed and new ones added (suggesting
// the Negocio's existing Etiquetas); without it they're read-only.
// Render with key={contact.id} so switching contacts resets it.
export function ContactTags({
  contactId,
  tags: initialTags,
  suggestions,
  onSaved,
}: {
  contactId: string;
  tags: string[];
  suggestions?: string[];
  onSaved?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState(initialTags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const editable = suggestions !== undefined;

  // Optimistic: the chip changes at once and comes back if saving fails.
  async function save(next: string[]) {
    const before = tags;
    setTags(next);
    setError(null);
    const result = await setContactTags(contactId, next).catch(() => ({
      error: "No se pudieron guardar las etiquetas. Inténtalo de nuevo.",
      tags: undefined,
    }));
    if (result.error || !result.tags) {
      setTags(before);
      setError(result.error ?? null);
      return;
    }
    setTags(result.tags);
    onSaved?.(result.tags);
  }

  function add() {
    const tag = normalizeTag(draft);
    setDraft("");
    if (tag && !tags.includes(tag)) void save([...tags, tag]);
  }

  if (!editable && tags.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-muted">Etiquetas</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent-tint py-[3px] pl-2.5 pr-2.5 text-[11.5px] font-semibold text-brand-dark"
          >
            {tag}
            {editable && (
              <button
                type="button"
                aria-label={`Quitar etiqueta ${tag}`}
                onClick={() => void save(tags.filter((t) => t !== tag))}
                className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full text-brand-dark/70 hover:bg-white/60"
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </span>
        ))}
        {editable && (
          <>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  add();
                }
              }}
              onBlur={add}
              list={listId}
              maxLength={TAG_MAX}
              placeholder={tags.length ? "Agregar" : "Agregar etiqueta"}
              aria-label="Agregar etiqueta"
              className="min-w-0 w-32 rounded-full border border-dashed border-border bg-transparent px-2.5 py-[3px] text-[12px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
            />
            <datalist id={listId}>
              {suggestions.filter((s) => !tags.includes(s)).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
