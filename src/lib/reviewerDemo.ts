import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChannelType, ConversationStage, TemplateCategory } from "@/lib/types";

// Server-only. The sign-in Apple and Google reviewers use: a fixed email and
// password (no inbox needed) that opens a pre-filled demo Negocio in "modo
// prueba" (businesses.is_demo, supabase/migrations/0015_reviewer_demo.sql).
//
// Turned on only when both env vars are set on the server (Vercel):
//   REVIEWER_EMAIL     an address only for this, e.g. revision@cheke.io
//   REVIEWER_PASSWORD  at least 12 characters; give it to the stores only
// Without them the login screen shows no reviewer link and this does nothing.
//
// Safety: every write here goes to the one Negocio with is_demo = true, and
// the reviewer account is only ever looked up among that Negocio's members.
// If REVIEWER_EMAIL already belongs to a real person, sign-in is refused
// rather than touching their account.

type Admin = ReturnType<typeof createAdminClient>;
type Credentials = { email: string; password: string };

const MIN_PASSWORD_LENGTH = 12;
const DEMO_BUSINESS_NAME = "Tienda Luna (demo)";

function configuredCredentials(): Credentials | null {
  const email = process.env.REVIEWER_EMAIL?.trim().toLowerCase();
  const password = process.env.REVIEWER_PASSWORD;
  if (!email || !password || password.length < MIN_PASSWORD_LENGTH) return null;
  return { email, password };
}

export function reviewerLoginEnabled(): boolean {
  return configuredCredentials() !== null;
}

// Constant-time comparison, so response timing doesn't leak how much of a
// guess was right.
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Returns the credentials when the typed email + password are the
// reviewer's, otherwise null.
export function checkReviewerCredentials(email: string, password: string): Credentials | null {
  const creds = configuredCredentials();
  if (!creds) return null;
  const emailOk = sameSecret(email.trim().toLowerCase(), creds.email);
  const passwordOk = sameSecret(password, creds.password);
  return emailOk && passwordOk ? creds : null;
}

// Makes sure the demo Negocio, the reviewer account and its sample data all
// exist and look fresh. Idempotent: safe on every reviewer sign-in.
export async function prepareReviewerDemo(creds: Credentials): Promise<{ error?: string }> {
  const admin = createAdminClient();
  try {
    const businessId = await ensureDemoBusiness(admin);
    const userError = await ensureReviewerUser(admin, businessId, creds);
    if (userError) return { error: userError };
    await seedDemoBusiness(admin, businessId);
    await refreshDemoBusiness(admin, businessId);
    return {};
  } catch (error) {
    console.error("reviewer demo: setup failed", error);
    return { error: "No se pudo preparar la cuenta de demostración." };
  }
}

async function ensureDemoBusiness(admin: Admin): Promise<string> {
  const find = () => admin.from("businesses").select("id").eq("is_demo", true).maybeSingle();

  const { data: existing, error } = await find();
  // Most likely 0015_reviewer_demo.sql hasn't been run on this database.
  if (error) throw new Error(`demo business lookup failed (is migration 0015 applied?): ${error.message}`);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await admin
    .from("businesses")
    .insert({ name: DEMO_BUSINESS_NAME, plan: "pro", is_demo: true })
    .select("id")
    .single();
  if (created) return created.id;

  // Two sign-ins at once: the other one created it first (unique index).
  const { data: raced } = await find();
  if (raced) return raced.id;
  throw new Error(`could not create demo business: ${insertError?.message}`);
}

async function ensureReviewerUser(admin: Admin, businessId: string, creds: Credentials): Promise<string | null> {
  const { data: members, error } = await admin.from("members").select("user_id").eq("business_id", businessId);
  if (error) throw new Error(error.message);

  for (const m of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data.user?.email?.toLowerCase() === creds.email) {
      // Keep the password in sync with REVIEWER_PASSWORD (it may have been
      // changed in Vercel since the account was created).
      const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, {
        password: creds.password,
        email_confirm: true,
      });
      if (updateError) throw new Error(updateError.message);
      return null;
    }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: creds.email,
    password: creds.password,
    email_confirm: true,
    user_metadata: { full_name: "Revisor" },
  });
  if (createError || !created.user) {
    // Almost always: this email is already a real cheKe account. Never take
    // it over; the founder has to pick another REVIEWER_EMAIL.
    console.error("reviewer demo: REVIEWER_EMAIL can't be used (already a cheKe account?)", createError?.message);
    return "El acceso para revisores no está bien configurado.";
  }

  const { error: memberError } = await admin
    .from("members")
    .insert({ business_id: businessId, user_id: created.user.id, role: "owner" });
  if (memberError) {
    // Don't leave a half-made account behind that would block the next try.
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(memberError.message);
  }
  return null;
}

// --- Sample data ----------------------------------------------------------
// Fictional people and numbers. Nothing is ever sent to them: the demo
// Negocio is in modo prueba (see sendChatMessage).

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

type DemoMessage = { direction: "in" | "out"; body: string; minutesAgo: number; isBot?: boolean };
const DEMO_CONVERSATIONS: Array<{
  name: string;
  channel: ChannelType;
  phone?: string;
  ig_handle?: string;
  fb_id?: string;
  stage: ConversationStage;
  value_hnl: number | null;
  notes: string | null;
  messages: DemoMessage[];
}> = [
  {
    name: "Juan Pérez",
    channel: "whatsapp",
    phone: "+504 9100-0101",
    stage: "consulta",
    value_hnl: null,
    notes: "Vive en Choluteca.",
    messages: [
      { direction: "in", body: "Hola, quiero saber el precio de la guitarra acústica", minutesAgo: 34 },
      { direction: "out", body: "¡Hola Juan! La guitarra acústica cuesta L 4,500 y la tenemos en negro y café. ¿Te la enviamos?", minutesAgo: 33, isBot: true },
      { direction: "in", body: "Sí, ¿cuánto sale el envío a Choluteca?", minutesAgo: 12 },
    ],
  },
  {
    name: "María López",
    channel: "instagram",
    ig_handle: "@maria.lopez.demo",
    stage: "cotizacion",
    value_hnl: 4500,
    notes: "Prefiere pagar por transferencia.",
    messages: [
      { direction: "in", body: "¿Hacen envíos a San Pedro Sula?", minutesAgo: 2 * 60 + 10 },
      { direction: "out", body: "¡Claro! A San Pedro Sula llega en 1 día y el envío es gratis en compras arriba de L 2,000.", minutesAgo: 2 * 60 },
    ],
  },
  {
    name: "Carlos Díaz",
    channel: "whatsapp",
    phone: "+504 9100-0102",
    stage: "negociacion",
    value_hnl: 9800,
    notes: "Quiere dos guitarras para sus hijos.",
    messages: [
      { direction: "in", body: "Si me llevo dos guitarras, ¿me hacen descuento?", minutesAgo: 6 * 60 },
      { direction: "out", body: "Por las dos te queda en L 8,400 con estuche incluido.", minutesAgo: 5 * 60 + 40 },
      { direction: "in", body: "Te confirmo mañana el depósito", minutesAgo: 5 * 60 },
    ],
  },
  {
    name: "Ana Mejía",
    channel: "whatsapp",
    phone: "+504 9100-0103",
    stage: "ganado",
    value_hnl: 3200,
    notes: null,
    messages: [
      { direction: "out", body: "¡Hola Ana! Tu ukelele ya va en camino 🚚", minutesAgo: 27 * 60 },
      { direction: "in", body: "Gracias, ya me llegó 🙌", minutesAgo: 26 * 60 },
    ],
  },
  {
    name: "Luis Funes",
    channel: "instagram",
    ig_handle: "@luis.funes.demo",
    stage: "nuevo",
    value_hnl: null,
    notes: "Vino desde un anuncio de Instagram.",
    messages: [{ direction: "in", body: "¿Tienen la correa de cuero en color negro?", minutesAgo: 60 }],
  },
  {
    name: "Fátima Reyes",
    channel: "facebook",
    fb_id: "fatima.reyes.demo",
    stage: "consulta",
    value_hnl: null,
    notes: null,
    messages: [{ direction: "in", body: "Buenas, ¿qué horario tienen en la tienda?", minutesAgo: 3 * 24 * 60 }],
  },
];

const DEMO_PRODUCTS: Array<[string, string, number, number]> = [
  ["Guitarra acústica", "Instrumentos", 4500, 3],
  ["Ukelele soprano", "Instrumentos", 1800, 8],
  ["Cuerdas D'Addario", "Accesorios", 350, 2],
  ["Correa de cuero", "Accesorios", 280, 15],
  ["Afinador digital", "Accesorios", 220, 0],
  ["Estuche rígido", "Accesorios", 950, 6],
];

const DEMO_TEMPLATES: Array<[string, TemplateCategory, string]> = [
  ["Bienvenida", "bienvenida", "¡Hola! Gracias por escribirnos a Tienda Luna 🎸 ¿En qué te podemos ayudar?"],
  ["Precio con envío", "precios", "¡Hola! La {{producto}} cuesta {{precio}}. ¿Te la enviamos a {{ciudad}}?"],
  ["Datos de pago", "pagos", "Puedes depositar a la cuenta de Tienda Luna y enviarnos la foto del comprobante."],
  ["Envíos", "envios", "Hacemos envíos a todo el país. Tegucigalpa y San Pedro Sula: 1 día. Resto: 2-3 días."],
];

async function count(admin: Admin, table: string, businessId: string): Promise<number> {
  const { count: n, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

// Fills an empty demo Negocio. Each part only runs when that part is empty,
// so a reviewer's own changes survive the next sign-in.
async function seedDemoBusiness(admin: Admin, businessId: string): Promise<void> {
  const now = Date.now();

  const channelIds: Partial<Record<ChannelType, string>> = {};
  const { data: channels } = await admin.from("channels").select("id, type").eq("business_id", businessId);
  for (const c of channels ?? []) channelIds[c.type as ChannelType] = c.id;
  for (const type of ["whatsapp", "instagram", "facebook"] as const) {
    if (channelIds[type]) continue;
    const { data, error } = await admin
      .from("channels")
      .insert({
        business_id: businessId,
        type,
        status: "connected",
        // No external_id or token on purpose: this channel can't reach Meta.
        ...(type === "whatsapp"
          ? { verified_name: "Tienda Luna", display_phone: "Número de demostración", connected_at: new Date(now).toISOString() }
          : {}),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`channel: ${error?.message}`);
    channelIds[type] = data.id;
  }

  if ((await count(admin, "contacts", businessId)) === 0) {
    for (const c of DEMO_CONVERSATIONS) {
      const { data: contact, error: contactError } = await admin
        .from("contacts")
        .insert({
          business_id: businessId,
          name: c.name,
          phone: c.phone ?? null,
          ig_handle: c.ig_handle ?? null,
          fb_id: c.fb_id ?? null,
          notes: c.notes,
        })
        .select("id")
        .single();
      if (contactError || !contact) throw new Error(`contact: ${contactError?.message}`);

      const last = c.messages[c.messages.length - 1];
      const { data: conversation, error: convError } = await admin
        .from("conversations")
        .insert({
          business_id: businessId,
          contact_id: contact.id,
          channel_id: channelIds[c.channel],
          status: "open",
          stage: c.stage,
          value_hnl: c.value_hnl,
          bot_enabled: false,
          last_message_at: new Date(now - last.minutesAgo * MIN).toISOString(),
        })
        .select("id")
        .single();
      if (convError || !conversation) throw new Error(`conversation: ${convError?.message}`);

      const { error: msgError } = await admin.from("messages").insert(
        c.messages.map((m) => ({
          conversation_id: conversation.id,
          business_id: businessId,
          direction: m.direction,
          body: m.body,
          is_bot: m.isBot ?? false,
          status: "read",
          created_at: new Date(now - m.minutesAgo * MIN).toISOString(),
        })),
      );
      if (msgError) throw new Error(`messages: ${msgError.message}`);
    }
  }

  if ((await count(admin, "products", businessId)) === 0) {
    const { error } = await admin.from("products").insert(
      DEMO_PRODUCTS.map(([name, category, price, stock], i) => ({
        business_id: businessId,
        retailer_id: `demo-${i + 1}`,
        name,
        category,
        description: "Disponible en negro y café.",
        price_hnl: price,
        stock,
        visible: true,
      })),
    );
    if (error) throw new Error(`products: ${error.message}`);
  }

  if ((await count(admin, "templates", businessId)) === 0) {
    const { error } = await admin
      .from("templates")
      .insert(DEMO_TEMPLATES.map(([name, category, body]) => ({ business_id: businessId, name, category, body })));
    if (error) throw new Error(`templates: ${error.message}`);
  }
}

// On every reviewer sign-in: WhatsApp stays "connected" (even if the
// reviewer pressed Desconectar last time) and every conversation is inside
// WhatsApp's 24-hour reply window, so the reviewer can always reply.
async function refreshDemoBusiness(admin: Admin, businessId: string): Promise<void> {
  const windowOpenUntil = new Date(Date.now() + 24 * HOUR).toISOString();
  const [channels, conversations] = await Promise.all([
    admin.from("channels").update({ status: "connected" }).eq("business_id", businessId).eq("type", "whatsapp"),
    admin.from("conversations").update({ window_expires_at: windowOpenUntil }).eq("business_id", businessId),
  ]);
  if (channels.error) throw new Error(`refresh channels: ${channels.error.message}`);
  if (conversations.error) throw new Error(`refresh conversations: ${conversations.error.message}`);
}
