import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// QA ronda 3: the database side of the features merged in #73–#78 working
// together: the routing trigger (0021) with chekelin's map pin, a Plantilla
// after 24 h and Modo prueba's voice note; "No leídos" (0034) with
// Reintentar; and who may do each of these (RLS), as the real roles.
//
// Negocio "Luna": Tiendas A and B. U1 Dueño · U2 Agente in A · U3 Gerente of A.
const OWNER = userId(1);
const AGENT_A = userId(2);
const MANAGER_A = userId(3);

let t: TestDb;
const ids: Record<string, string> = {};

async function one(sql: string, params: unknown[] = []) {
  return (await t.q(sql, params))[0] as Record<string, unknown>;
}
async function as(user: string | null, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  if (!r.rows) throw new Error(r.error);
  return r.rows;
}
async function unread(user: string, conv: string): Promise<number> {
  const rows = await as(user, `select unread_count from conversation_unread where conversation_id = $1`, [conv]);
  return Number(rows[0]?.unread_count ?? 0);
}
const conversation = (id: string) =>
  one(`select handed_off_at, assigned_to, awaiting_since, last_inbound_at, last_human_reply_at from conversations where id = $1`, [id]);

async function newChat(key: string, store: string) {
  const channel = (await one(
    `insert into channels (business_id, store_id, type, status, external_id) values ($1, $2, 'whatsapp', 'connected', $3) returning id`,
    [ids.biz, store, `pn-${key}`],
  )).id as string;
  const contact = (await one(`insert into contacts (business_id, name, phone) values ($1, $2, $3) returning id`, [ids.biz, `C${key}`, `5049999000${key.length}`])).id;
  return (await one(`insert into conversations (business_id, contact_id, channel_id) values ($1, $2, $3) returning id`, [ids.biz, contact, channel])).id as string;
}

// A customer message as the webhook saves it (service role).
async function customerWrites(conv: string, body: string) {
  return (await as(null, `insert into messages (conversation_id, business_id, direction, body, status) values ($1, $2, 'in', $3, 'sent') returning id`, [conv, ids.biz, body]))[0].id as string;
}

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2, 3]) await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  ids.biz = (await as(OWNER, `select create_business('Luna') as id`))[0].id as string;
  ids.storeA = (await one(`select id from stores where business_id = $1`, [ids.biz])).id as string;
  ids.storeB = (await as(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz]))[0].id as string;
  for (const [user, role] of [[AGENT_A, "agent"], [MANAGER_A, "manager"]] as const) {
    const token = (await as(OWNER, `select create_invitation($1, $2, $3::uuid[]) as t`, [ids.biz, role, [ids.storeA]]))[0].t;
    await as(user, `select accept_invitation($1)`, [token]);
  }
});

describe("chekelin's map pin and the routing trigger", () => {
  it("chekelin sending the Tienda's location doesn't hand the chat off nor clear «No leídos»", async () => {
    const conv = await newChat("pin", ids.storeA);
    await customerWrites(conv, "¿dónde están?");
    await as(
      null,
      `insert into messages (conversation_id, business_id, direction, body, is_bot, status, media_kind, media_info)
       values ($1, $2, 'out', '📍 Tienda Luna', true, 'sent', 'location', '{"latitude":14.07,"longitude":-87.19,"place":"Tienda Luna"}')`,
      [conv, ids.biz],
    );
    expect(await conversation(conv)).toMatchObject({ handed_off_at: null, assigned_to: null });
    expect(await unread(AGENT_A, conv)).toBe(1);
  });

  it("an Agente sends «Ubicación» as a map card: allowed in their Tienda, it's a person's reply", async () => {
    const conv = await newChat("ubic", ids.storeA);
    await customerWrites(conv, "¿dirección?");
    await as(
      AGENT_A,
      `insert into messages (conversation_id, business_id, direction, body, media_kind, media_info) values ($1, $2, 'out', '📍 Tienda Luna', 'location', '{"latitude":14.07,"longitude":-87.19}')`,
      [conv, ids.biz],
    );
    const c = await conversation(conv);
    expect(c.handed_off_at).not.toBeNull();
    expect(c.assigned_to).toBe(AGENT_A);
    expect(await unread(AGENT_A, conv)).toBe(0);
  });
});

describe("a Plantilla after 24 h, then the customer answers", () => {
  it("the Plantilla is the Agente's reply (chat theirs, chekelin quiet); the customer's answer starts the timers and counts as unread", async () => {
    const conv = await newChat("tpl", ids.storeA);
    await t.q(`update conversations set window_expires_at = now() - interval '1 hour' where id = $1`, [conv]);
    await as(AGENT_A, `insert into messages (conversation_id, business_id, direction, body) values ($1, $2, 'out', 'Hola Ana, ¿te interesa todavía la blusa?')`, [conv, ids.biz]);
    expect(await conversation(conv)).toMatchObject({ assigned_to: AGENT_A, awaiting_since: null });

    await customerWrites(conv, "sí, todavía");
    const c = await conversation(conv);
    expect(c.handed_off_at).not.toBeNull();
    expect(c.awaiting_since).not.toBeNull();
    expect(c.last_inbound_at).not.toBeNull();
    expect(await unread(AGENT_A, conv)).toBe(1);
  });
});

describe("Reintentar and «No leídos», as the Agente", () => {
  it("the Agente marks their failed reply as sent again in their Tienda, never in another Tienda", async () => {
    const conv = await newChat("retry", ids.storeA);
    const convB = await newChat("retryB", ids.storeB);
    await customerWrites(conv, "hola");
    const failed = (await as(AGENT_A, `insert into messages (conversation_id, business_id, direction, body) values ($1, $2, 'out', 'hola!') returning id`, [conv, ids.biz]))[0].id;
    await as(AGENT_A, `update messages set status = 'failed', error_code = 131026, error_reason = 'No se pudo entregar' where id = $1`, [failed]);
    const fixed = await as(AGENT_A, `update messages set status = 'sent', error_code = null, error_reason = null, external_message_id = 'wamid.r1' where id = $1 returning status`, [failed]);
    expect(fixed).toEqual([{ status: "sent" }]);

    const other = (await as(OWNER, `insert into messages (conversation_id, business_id, direction, body, status) values ($1, $2, 'out', 'x', 'failed') returning id`, [convB, ids.biz]))[0].id;
    expect(await as(AGENT_A, `update messages set status = 'sent' where id = $1 returning id`, [other])).toEqual([]);
  });
});

describe("Modo prueba: a voice note recorded as the customer", () => {
  it("saved by the signed-in person as the customer's message: it starts the timers and isn't signed as theirs", async () => {
    const conv = await newChat("prueba", ids.storeA);
    const row = (await as(
      AGENT_A,
      `insert into messages (conversation_id, business_id, direction, body, media_kind, media_path) values ($1, $2, 'in', '🎤 Nota de voz', 'voice', 'x/y/z.ogg') returning sent_by`,
      [conv, ids.biz],
    ))[0];
    expect(row.sent_by).toBeNull();
    const c = await conversation(conv);
    expect(c.last_inbound_at).not.toBeNull();
    expect(c.handed_off_at).toBeNull();
    expect(await unread(AGENT_A, conv)).toBe(1);
  });
});

describe("the Tienda's location: who may change it", () => {
  it("the Tienda's Gerente may; its Agente may not; nobody from Tienda A changes Tienda B's", async () => {
    await as(OWNER, `insert into store_chekelin_info (store_id, business_id) values ($1, $2), ($3, $2) on conflict do nothing`, [ids.storeA, ids.biz, ids.storeB]);
    expect(await as(MANAGER_A, `update store_chekelin_info set location_address = 'Col. Kennedy', location_lat = 14.05, location_lng = -87.17 where store_id = $1 returning store_id`, [ids.storeA])).toHaveLength(1);
    expect(await as(AGENT_A, `update store_chekelin_info set location_address = 'otra' where store_id = $1 returning store_id`, [ids.storeA])).toEqual([]);
    expect(await as(MANAGER_A, `update store_chekelin_info set location_address = 'otra' where store_id = $1 returning store_id`, [ids.storeB])).toEqual([]);
    expect(await one(`select location_address from store_chekelin_info where store_id = $1`, [ids.storeA])).toEqual({ location_address: "Col. Kennedy" });
  });
});
