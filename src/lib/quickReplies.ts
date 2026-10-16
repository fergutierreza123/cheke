// Respuestas rápidas (issue #52): saved replies of a Negocio, inserted in
// the Chat composer by typing "/" and their shortcut. Pure helpers, safe to
// import from browser components. Table: quick_replies (migration 0024).

export type QuickReply = { id: string; shortcut: string; body: string };

export const SHORTCUT_MAX = 30;
export const BODY_MAX = 2000;

// The placeholder replaced by the Contacto's first name when used.
export const NAME_PLACEHOLDER = "{nombre}";

// What people type after "/" → what the database keeps: lowercase, no
// accents, spaces become "-", anything else dropped ("Envíos SPS" → "envios-sps").
export function normalizeShortcut(raw: string): string {
  return fold(raw)
    .trim()
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, SHORTCUT_MAX);
}

// Lowercase without accents, for matching.
function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// The "/word" being typed at the end of the composer, or null. "/" alone
// gives "" (show every reply). Only at the start or after a space, so a
// link like "https://…" never opens the picker.
export function slashQuery(draft: string): string | null {
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(draft);
  return match ? match[1] : null;
}

// Replies whose shortcut (or text) matches what was typed; shortcut
// matches first.
export function filterQuickReplies(replies: QuickReply[], query: string): QuickReply[] {
  const q = normalizeShortcut(query);
  if (!q) return replies;
  const starts = replies.filter((r) => r.shortcut.startsWith(q));
  const contains = replies.filter(
    (r) => !r.shortcut.startsWith(q) && (r.shortcut.includes(q) || fold(r.body).includes(q)),
  );
  return [...starts, ...contains];
}

// The reply's text for this Contacto: {nombre} becomes their first name.
// When the name is unknown (only a phone number), the placeholder and the
// space before it disappear: "Hola {nombre}, …" → "Hola, …".
export function fillQuickReply(body: string, contactName: string | null | undefined): string {
  const first = (contactName ?? "").trim().split(/\s+/)[0] ?? "";
  const hasName = /\p{L}/u.test(first);
  return hasName ? body.replaceAll(NAME_PLACEHOLDER, first) : body.replace(/\s*\{nombre\}/g, "");
}

// Puts the reply in place of the "/word" at the end of the draft.
export function insertQuickReply(draft: string, text: string): string {
  return draft.replace(/(^|\s)\/[^\s/]*$/, (_m, before: string) => before + text);
}

// "Pegar varias": every reply starts on a line with "/atajo", and its text
// follows on the same line and/or the next lines, until the next "/atajo".
//   /horario Abrimos de lunes a sábado, 8 a 5.
//   /envios
//   Enviamos a todo el país.
//   Llega en 2 o 3 días.
export function parsePastedReplies(text: string): Array<{ shortcut: string; body: string }> {
  const out: Array<{ shortcut: string; body: string }> = [];
  let current: { shortcut: string; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    if (current.shortcut && body) {
      // The same shortcut twice: the last one wins.
      const i = out.findIndex((r) => r.shortcut === current!.shortcut);
      if (i >= 0) out.splice(i, 1);
      out.push({ shortcut: current.shortcut, body: body.slice(0, BODY_MAX) });
    }
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = /^\s*\/(\S+)\s*(.*)$/.exec(line);
    if (m) {
      flush();
      current = { shortcut: normalizeShortcut(m[1]), lines: m[2] ? [m[2]] : [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return out;
}
