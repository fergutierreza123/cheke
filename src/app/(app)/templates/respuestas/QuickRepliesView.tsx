"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import {
  BODY_MAX,
  NAME_PLACEHOLDER,
  SHORTCUT_MAX,
  normalizeShortcut,
  parsePastedReplies,
  type QuickReply,
} from "@/lib/quickReplies";
import { deleteQuickReply, importQuickReplies, saveQuickReply } from "./actions";

const PASTE_EXAMPLE = `/horario Abrimos de lunes a sábado, de 8 a 5.
/envios Hola {nombre}, enviamos a todo el país.
Llega en 2 o 3 días.`;

type Editing = { id?: string; shortcut: string; body: string } | null;

export function QuickRepliesView({ replies, canEdit }: { replies: QuickReply[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [pasting, setPasting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function startNew() {
    setPasting(false);
    setMessage(null);
    setEditing({ shortcut: "", body: "" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3.5 lg:px-8 lg:py-[18px]">
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Respuestas rápidas
            <BrandMark />
          </h1>
          <p className="text-[13.5px] text-ink-muted">En el chat, escribe / para usarlas</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <div className="mx-auto flex max-w-[640px] flex-col gap-4 lg:gap-5">
          <Link href="/templates" className="-my-2.5 w-fit px-1 py-2.5 pr-4 text-[13px] font-semibold text-brand">
            ‹ Plantillas
          </Link>

          <p className="px-1 text-[13.5px] leading-relaxed text-ink-muted">
            Ej. escribe <Code>/horario</Code> en el chat y el mensaje aparece listo. <Code>{NAME_PLACEHOLDER}</Code> se
            cambia por el nombre del cliente.
          </p>

          {!canEdit && (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-muted">
              Solo el dueño o un gerente puede crear o cambiar respuestas rápidas.
            </p>
          )}

          {canEdit && !editing && !pasting && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={startNew}
                className="min-h-11 flex-1 rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white"
              >
                Nueva respuesta
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setMessage(null);
                  setPasting(true);
                }}
                className="min-h-11 flex-1 rounded-[10px] border border-border bg-surface px-4 text-[14px] font-semibold text-ink"
              >
                Pegar varias
              </button>
            </div>
          )}

          {message && (
            <p className={`px-1 text-[13px] ${message.ok ? "text-brand-dark" : "text-danger"}`} role="status">
              {message.text}
            </p>
          )}

          {editing && !editing.id && (
            <ReplyEditor
              initial={editing}
              onDone={(text) => {
                setEditing(null);
                if (text) setMessage({ ok: true, text });
              }}
            />
          )}

          {pasting && (
            <PastePanel
              existing={replies}
              onDone={(text) => {
                setPasting(false);
                if (text) setMessage({ ok: true, text });
              }}
            />
          )}

          {replies.length === 0 && !editing && !pasting && (
            <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-[13.5px] text-ink-muted">
              Todavía no hay respuestas rápidas.
              {canEdit && " Crea la primera o pega las que ya usas en WhatsApp Business."}
            </div>
          )}

          {replies.length > 0 && (
            <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
              {replies.map((r) =>
                editing?.id === r.id ? (
                  <li key={r.id} className="border-b border-border p-3 last:border-b-0">
                    <ReplyEditor
                      initial={editing}
                      onDone={(text) => {
                        setEditing(null);
                        if (text) setMessage({ ok: true, text });
                      }}
                    />
                  </li>
                ) : (
                  <ReplyRow
                    key={r.id}
                    reply={r}
                    canEdit={canEdit}
                    onEdit={() => {
                      setPasting(false);
                      setMessage(null);
                      setEditing({ id: r.id, shortcut: r.shortcut, body: r.body });
                    }}
                    onError={(text) => setMessage({ ok: false, text })}
                  />
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 py-0.5 font-semibold text-ink">{children}</code>;
}

function ReplyRow({
  reply,
  canEdit,
  onEdit,
  onError,
}: {
  reply: QuickReply;
  canEdit: boolean;
  onEdit: () => void;
  onError: (text: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteQuickReply(reply.id);
      if (result.error) onError(result.error);
      setConfirming(false);
    });
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-start lg:px-5">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-brand">/{reply.shortcut}</div>
        <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[13.5px] leading-snug text-ink">{reply.body}</p>
      </div>
      {canEdit &&
        (confirming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[12.5px] text-ink-muted">¿Borrar?</span>
            <button
              onClick={handleDelete}
              disabled={pending}
              className="min-h-9 rounded-lg border border-danger-border bg-danger-tint px-3 text-[12.5px] font-semibold text-danger disabled:opacity-60"
            >
              {pending ? "Borrando…" : "Sí, borrar"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="min-h-9 rounded-lg border border-border px-3 text-[12.5px] text-ink-muted"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={onEdit}
              className="min-h-9 rounded-lg border border-border bg-surface-2 px-3 text-[12.5px] font-semibold text-ink"
            >
              Editar
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="min-h-9 rounded-lg border border-border px-3 text-[12.5px] text-ink-muted"
            >
              Borrar
            </button>
          </div>
        ))}
    </li>
  );
}

function ReplyEditor({
  initial,
  onDone,
}: {
  initial: { id?: string; shortcut: string; body: string };
  // A success message, or null when cancelled.
  onDone: (message: string | null) => void;
}) {
  const [shortcut, setShortcut] = useState(initial.shortcut);
  const [body, setBody] = useState(initial.body);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function addName() {
    const el = bodyRef.current;
    const at = el?.selectionStart ?? body.length;
    const next = body.slice(0, at) + NAME_PLACEHOLDER + body.slice(el?.selectionEnd ?? at);
    setBody(next);
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(at + NAME_PLACEHOLDER.length, at + NAME_PLACEHOLDER.length);
    }, 0);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await saveQuickReply({ id: initial.id, shortcut, body });
      if (result.error) setError(result.error);
      else onDone(initial.id ? "Cambios guardados." : `Lista. Escribe /${normalizeShortcut(shortcut)} en el chat.`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-brand/40 bg-surface p-4 lg:p-5">
      <label className="flex flex-col gap-1">
        <span className="text-[13.5px] font-semibold text-ink">Atajo</span>
        <div className="flex items-center rounded-lg border border-border bg-surface-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint">
          <span className="pl-3 text-[16px] font-semibold text-ink-muted lg:text-[13.5px]">/</span>
          <input
            value={shortcut}
            onChange={(e) => setShortcut(normalizeShortcut(e.target.value))}
            placeholder="horario"
            maxLength={SHORTCUT_MAX}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="min-h-11 min-w-0 flex-1 bg-transparent pl-0.5 pr-3 text-[16px] text-ink outline-none lg:text-[13.5px]"
          />
        </div>
        <span className="text-[12px] text-ink-soft">Una palabra corta, sin espacios.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[13.5px] font-semibold text-ink">Mensaje</span>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ej. Hola {nombre}, abrimos de lunes a sábado de 8 a 5."
          rows={4}
          maxLength={BODY_MAX}
          className="resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-[16px] leading-snug text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint lg:text-[13.5px]"
        />
      </label>
      <button
        type="button"
        onClick={addName}
        className="w-fit rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink"
      >
        + Nombre del cliente
      </button>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !shortcut || !body.trim()}
          className="min-h-11 flex-1 rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="min-h-11 rounded-[10px] border border-border px-4 text-[14px] text-ink-muted"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function PastePanel({ existing, onDone }: { existing: QuickReply[]; onDone: (message: string | null) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const parsed = parsePastedReplies(text);
  const taken = new Set(existing.map((r) => r.shortcut));
  const replacing = parsed.filter((r) => taken.has(r.shortcut)).length;

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await importQuickReplies(text);
      if (result.error) setError(result.error);
      else onDone(result.saved === 1 ? "Se guardó 1 respuesta." : `Se guardaron ${result.saved} respuestas.`);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/40 bg-surface p-4 lg:p-5">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">Pegar varias</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          Empieza cada respuesta con <Code>/</Code> y su atajo; el mensaje va después, en la misma línea o en las
          siguientes. Para traer las de WhatsApp Business: en la app, ve a Ajustes › Herramientas para la empresa › Respuestas
          rápidas, copia cada mensaje y pégalo aquí.
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PASTE_EXAMPLE}
        rows={8}
        autoFocus
        className="resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-[16px] leading-snug text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint lg:text-[13.5px]"
      />
      {parsed.length > 0 && (
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-muted">
          <span className="font-semibold text-ink">
            {parsed.length === 1 ? "1 respuesta" : `${parsed.length} respuestas`}:
          </span>{" "}
          {parsed.map((r) => `/${r.shortcut}`).join(", ")}
          {replacing > 0 && (
            <span className="block">
              {replacing === 1 ? "1 ya existe y se va a reemplazar." : `${replacing} ya existen y se van a reemplazar.`}
            </span>
          )}
        </div>
      )}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={pending || parsed.length === 0}
          className="min-h-11 flex-1 rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : parsed.length > 1 ? `Guardar ${parsed.length}` : "Guardar"}
        </button>
        <button
          onClick={() => onDone(null)}
          className="min-h-11 rounded-[10px] border border-border px-4 text-[14px] text-ink-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
