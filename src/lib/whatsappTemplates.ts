// WhatsApp message templates (Meta-approved), the only thing WhatsApp lets a
// business send once 24 h passed since the customer's last message.
// Pure helpers, safe to import from browser components. Table:
// whatsapp_templates (migration 0033); server side: whatsappTemplatesServer.ts.
//
// Not the same as a Plantilla (`templates`, cheke's saved replies): those are
// plain text a person edits and sends inside the 24 h window.

export type TemplateComponent = {
  type: string; // HEADER | BODY | FOOTER | BUTTONS
  format?: string; // HEADER: TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION
  text?: string;
  buttons?: Array<{ type: string; text?: string; url?: string }>;
  example?: unknown;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: TemplateComponent[];
  rejected_reason?: string | null;
};

// {{1}}, {{2}}… (positional) or {{nombre}} (named).
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

function component(t: Pick<WhatsAppTemplate, "components">, type: string): TemplateComponent | undefined {
  return (t.components ?? []).find((c) => c.type?.toUpperCase() === type);
}

function placeholdersIn(text: string | undefined): string[] {
  const seen: string[] = [];
  for (const match of (text ?? "").matchAll(PLACEHOLDER)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

// The body's variables, in order of first appearance, once each.
export function templateVariables(t: Pick<WhatsAppTemplate, "components">): string[] {
  return placeholdersIn(component(t, "BODY")?.text);
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => {
    const value = values[key];
    return value != null && value !== "" ? value : whole;
  });
}

// What the customer will read: text header, body and footer, with the values
// in place. A variable without a value stays as {{n}} (the preview shows it).
// Also saved as the message's body in Chat.
export function renderTemplate(t: Pick<WhatsAppTemplate, "components">, values: Record<string, string>): string {
  const header = component(t, "HEADER");
  const parts = [
    header && (header.format ?? "TEXT").toUpperCase() === "TEXT" ? header.text : undefined,
    component(t, "BODY")?.text,
    component(t, "FOOTER")?.text,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return fill(parts.join("\n\n"), values);
}

const GREETING_BEFORE = /(hola|buen[oa]s?\s+(d[ií]as|tardes|noches)|saludos|estimad[oa]|querid[oa]|hey|hi|hello|dear)[\s,!¡]*$/i;
const NAME_VARIABLES = new Set(["nombre", "name", "first_name", "firstname", "cliente", "customer_name"]);

// The customer's first name, capitalized ("ana maría" → "Ana"), or null when
// what we have isn't a name (empty, a phone number).
export function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || !/\p{L}/u.test(first)) return null;
  return first.charAt(0).toLocaleUpperCase("es") + first.slice(1).toLocaleLowerCase("es");
}

// Values to start the form with: the customer's first name where the
// template clearly asks for it ({{1}} right after "Hola", or a variable called
// nombre / name). Everything else starts empty.
export function suggestedValues(
  t: Pick<WhatsAppTemplate, "components">,
  contactName: string | null | undefined,
): Record<string, string> {
  const name = firstName(contactName);
  if (!name) return {};
  const values: Record<string, string> = {};
  for (const key of templateVariables(t)) {
    if (NAME_VARIABLES.has(key.toLowerCase())) values[key] = name;
  }
  if (!Object.keys(values).length) {
    const body = component(t, "BODY")?.text ?? "";
    const at = body.search(/\{\{\s*1\s*\}\}/);
    if (at >= 0 && GREETING_BEFORE.test(body.slice(0, at))) values["1"] = name;
  }
  return values;
}

function listJoin(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

// Why these values can't be sent yet (plain Spanish), or null when they can.
// Meta refuses a variable with line breaks, tabs or more than 4 spaces in a
// row (error 132018).
export function validateTemplateValues(
  t: Pick<WhatsAppTemplate, "components">,
  values: Record<string, string>,
): string | null {
  const keys = templateVariables(t);
  const missing = keys.filter((k) => !(values[k] ?? "").trim());
  if (missing.length) {
    const tags = missing.map((k) => `{{${k}}}`);
    return missing.length === 1
      ? `Completa el dato ${tags[0]} antes de enviar.`
      : `Completa los datos ${listJoin(tags)} antes de enviar.`;
  }
  const bad = keys.find((k) => /[\n\r\t]| {5,}/.test(values[k] ?? ""));
  if (bad) return `El dato {{${bad}}} no puede llevar saltos de línea ni muchos espacios seguidos.`;
  return null;
}

// Why cheke can't send this template from Chat, or null when it can. Only
// APPROVED ones go out. Templates that need a photo/video/document header,
// a variable in the header or in a link button are left to WhatsApp (cheke
// would need more inputs than a non-technical person should face).
export function templateProblem(t: Pick<WhatsAppTemplate, "status" | "components">): string | null {
  const status = t.status?.toUpperCase();
  if (status !== "APPROVED") {
    if (status === "PENDING" || status === "IN_APPEAL") return "Esta plantilla todavía está en revisión de WhatsApp.";
    if (status === "PAUSED") return "WhatsApp tiene esta plantilla pausada por quejas de clientes. Usa otra.";
    if (status === "REJECTED") return "WhatsApp rechazó esta plantilla.";
    return "Esta plantilla no está aprobada por WhatsApp.";
  }
  const header = component(t, "HEADER");
  if (header) {
    const format = (header.format ?? "TEXT").toUpperCase();
    if (format !== "TEXT") return "Esta plantilla lleva foto, video o documento: envíala desde WhatsApp.";
    if (placeholdersIn(header.text).length) return "Esta plantilla lleva datos en el encabezado: envíala desde WhatsApp.";
  }
  const buttons = component(t, "BUTTONS")?.buttons ?? [];
  if (buttons.some((b) => placeholdersIn(b.url).length)) {
    return "Esta plantilla lleva un botón con link variable: envíala desde WhatsApp.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Names people read instead of WhatsApp's codes.

// "seguimiento_pedido_2" → "Seguimiento pedido" (the _2 is a resend's).
export function templateDisplayName(name: string): string {
  const text = name.replace(/_\d+$/, "").replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// MARKETING / UTILITY → the words on screen.
export function templateCategoryLabel(category: string | null | undefined): string {
  const c = (category ?? "").toUpperCase();
  return c === "MARKETING" ? "Promoción" : c === "AUTHENTICATION" ? "Código" : "Aviso";
}

const VARIABLE_LABELS: Record<string, string> = {
  nombre: "Nombre del cliente",
  name: "Nombre del cliente",
  cliente: "Nombre del cliente",
  producto: "Producto",
  precio: "Precio",
  ciudad: "Ciudad",
};

// {{producto}} → "Producto", {{2}} → "Dato 2": a variable as a chip reads it.
export function variableLabel(key: string): string {
  const k = key.trim().toLowerCase();
  if (VARIABLE_LABELS[k]) return VARIABLE_LABELS[k];
  if (/^\d+$/.test(k)) return `Dato ${k}`;
  const text = k.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Status, as people read it on the Plantillas screen and in Chat.

export function templateStatusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
      return "Aprobada";
    case "PENDING":
    case "IN_APPEAL":
      return "En revisión";
    case "REJECTED":
      return "Rechazada";
    case "PAUSED":
      return "Pausada";
    case "DISABLED":
      return "Desactivada";
    default:
      return "Sin aprobar";
  }
}

// Meta's rejected_reason values, in plain Spanish. null = no reason to show.
const REJECTED_REASONS: Record<string, string> = {
  ABUSIVE_CONTENT: "WhatsApp considera que el mensaje tiene contenido ofensivo o no permitido.",
  INVALID_FORMAT: "El mensaje tiene un problema de formato (por ejemplo, partes que cambian mal colocadas o muy seguidas).",
  PROMOTIONAL: "El mensaje parece una promoción: envíalo otra vez como tipo «Promoción».",
  INCORRECT_CATEGORY: "El tipo elegido no corresponde al mensaje: prueba con el otro tipo.",
  TAG_CONTENT_MISMATCH: "El tipo elegido no corresponde al mensaje: prueba con el otro tipo.",
  SCAM: "WhatsApp cree que el mensaje podría usarse para engañar a clientes.",
};
export function rejectedReasonText(reason: string | null | undefined): string | null {
  if (!reason || reason.toUpperCase() === "NONE") return null;
  return REJECTED_REASONS[reason.toUpperCase()] ?? "WhatsApp no aceptó el mensaje. Revisa el texto y vuelve a enviarlo.";
}

// ---------------------------------------------------------------------------
// Reading templates from Meta (GET /{waba_id}/message_templates).

export const META_TEMPLATE_FIELDS = "id,name,language,status,category,components,rejected_reason";

export type MetaTemplateRow = {
  meta_template_id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: TemplateComponent[];
  rejected_reason: string | null;
};

// One page of Meta's answer → the rows cheke keeps. Rows without a name or
// language are skipped.
export function parseMetaTemplates(body: unknown): MetaTemplateRow[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const rows: MetaTemplateRow[] = [];
  for (const raw of data) {
    const r = raw as Record<string, unknown>;
    if (typeof r?.name !== "string" || typeof r.language !== "string") continue;
    rows.push({
      meta_template_id: String(r.id ?? ""),
      name: r.name,
      language: r.language,
      status: typeof r.status === "string" ? r.status : "PENDING",
      category: typeof r.category === "string" ? r.category : "UTILITY",
      components: Array.isArray(r.components) ? (r.components as TemplateComponent[]) : [],
      rejected_reason: typeof r.rejected_reason === "string" ? r.rejected_reason : null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Sending a Plantilla to WhatsApp for approval (POST /{waba_id}/message_templates).

// The two types a business picks from. Utility: about something the customer
// already asked or bought (order, delivery, appointment). Marketing: anything
// that promotes, offers or invites to buy. Meta charges marketing more and
// may move a template to marketing on its own.
export const NEW_TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING"] as const;
export type NewTemplateCategory = (typeof NEW_TEMPLATE_CATEGORIES)[number];
export const NEW_TEMPLATE_LANGUAGE = "es";
export const TEMPLATE_BODY_MAX = 1024;

// A Plantilla's name → a WhatsApp template name: lowercase letters, numbers
// and "_", starting with a letter ("Precio con envío" → "precio_con_envio").
export function templateSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  if (!slug) return "plantilla";
  return /^[a-z]/.test(slug) ? slug : `plantilla_${slug}`;
}

// cheke's variables ({{producto}}, {{precio}}, {nombre}) → WhatsApp's
// numbered ones, the same name always getting the same number.
export function savedReplyToMetaBody(body: string): { text: string; variables: string[] } {
  const variables: string[] = [];
  const text = body.replace(/\{\{\s*([^{}]+?)\s*\}\}|\{\s*(nombre)\s*\}/gi, (_whole, named: string | undefined, nombre: string | undefined) => {
    const key = (named ?? nombre ?? "").trim().toLowerCase();
    let index = variables.indexOf(key);
    if (index < 0) index = variables.push(key) - 1;
    return `{{${index + 1}}}`;
  });
  return { text, variables };
}

export type NewTemplate = { name: string; category: string; body: string; examples: string[] };

// Why WhatsApp would refuse this template (plain Spanish), or null.
export function validateNewTemplate(t: NewTemplate): string | null {
  const body = t.body.trim();
  if (!body) return "Escribe el mensaje de la plantilla.";
  if (!(NEW_TEMPLATE_CATEGORIES as readonly string[]).includes(t.category)) return "Elige el tipo de mensaje.";
  if (!/^[a-z][a-z0-9_]{0,511}$/.test(t.name)) return "El nombre solo puede llevar letras minúsculas, números y _.";
  if (body.length > TEMPLATE_BODY_MAX) return `El mensaje es muy largo: WhatsApp acepta hasta ${TEMPLATE_BODY_MAX} caracteres.`;
  if (/^\{\{/.test(body) || /\}\}[\s.,!?¡¿]*$/.test(body)) {
    return "WhatsApp no acepta que el mensaje empiece ni termine con una parte que cambia (como el producto). Agrega texto antes o después.";
  }
  const count = placeholdersIn(body).length;
  if (t.examples.slice(0, count).filter((e) => e?.trim()).length < count) {
    return "Escribe un ejemplo para cada parte que cambia: WhatsApp lo usa para revisar la plantilla.";
  }
  return null;
}

export type CreateTemplateRequest = {
  name: string;
  language: string;
  category: string;
  parameter_format: "positional";
  components: Array<{ type: "BODY"; text: string; example?: { body_text: string[][] } }>;
};

export function buildCreateTemplateRequest(t: NewTemplate): CreateTemplateRequest {
  const text = t.body.trim();
  const count = placeholdersIn(text).length;
  return {
    name: t.name,
    language: NEW_TEMPLATE_LANGUAGE,
    category: t.category,
    parameter_format: "positional",
    components: [
      {
        type: "BODY",
        text,
        ...(count ? { example: { body_text: [t.examples.slice(0, count).map((e) => e.trim())] } } : {}),
      },
    ],
  };
}

// Same rule as toWhatsAppNumber() in whatsapp.ts (repeated here so this file
// has no server imports): digits only, an 8-digit Honduran number gets 504.
function recipientNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 8 ? `504${digits}` : digits;
}

export type TemplateMessage = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: Array<{ type: "body"; parameters: Array<{ type: "text"; text: string; parameter_name?: string }> }>;
  };
};

// The Cloud API message (POST /{phone_number_id}/messages, type "template").
// Positional variables go in number order; named ones carry their name.
export function buildTemplateMessage(
  toPhone: string,
  t: Pick<WhatsAppTemplate, "name" | "language" | "components">,
  values: Record<string, string>,
): TemplateMessage {
  const keys = templateVariables(t);
  const positional = keys.every((k) => /^\d+$/.test(k));
  const ordered = positional ? [...keys].sort((a, b) => Number(a) - Number(b)) : keys;
  const parameters = ordered.map((k) => ({
    type: "text" as const,
    ...(positional ? {} : { parameter_name: k }),
    text: (values[k] ?? "").trim(),
  }));
  return {
    messaging_product: "whatsapp",
    to: recipientNumber(toPhone),
    type: "template",
    template: {
      name: t.name,
      language: { code: t.language },
      ...(parameters.length ? { components: [{ type: "body" as const, parameters }] } : {}),
    },
  };
}
