import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Migration 0034: the Chat list's "No leídos" (view conversation_unread) and
// the Tienda's location in "Lo que chekelin sabe" (store_chekelin_info).
//
// Negocio "Luna": Tiendas A and B. U1 Dueño · U2 Agente in A.
// Negocio "Otra": U3 Dueño.
const OWNER = userId(1);
const AGENT_A = userId(2);
const OTHER_OWNER = userId(3);

let t: TestDb;
const ids: Record<string, string> = {};

async function one(sql: string, params: unknown[] = []) {
  return (await t.q(sql, params))[0] as Record<string, string>;
}
async function rpc(user: string, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  if (!r.rows) throw new Error(r.error);
  return r.rows[0];
}
async function unread(user: string): Promise<Record<string, number>> {
  const r = await t.as(user, `select conversation_id::text as id, unread_count from conversation_unread`);
  if (!r.rows) throw new Error(r.error);
  return Object.fromEntries(r.rows.map((row) => [row.id as string, Number(row.unread_count)]));
}

// Seconds after a fixed start, so the order of messages is certain.
const at = (s: number) => new Date(Date.UTC(2026, 9, 18, 10, 0, s)).toISOString();
async function message(conv: string, biz: string, s: number, fields: Record<string, unknown>) {
  const cols = ["conversation_id", "business_id", "body", "created_at", ...Object.keys(fields)];
  const vals = [conv, biz, "m", at(s), ...Object.values(fields)];
  await t.q(`insert into messages (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
}

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2, 3]) {
    await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  }
  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`)).id as string;
  ids.storeA = (await one(`select id from stores where business_id = $1`, [ids.biz])).id;
  ids.storeB = (await rpc(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz])).id as string;
  ids.biz2 = (await rpc(OTHER_OWNER, `select create_business('Otra') as id`)).id as string;
  ids.store2 = (await one(`select id from stores where business_id = $1`, [ids.biz2])).id;
  const token = (await rpc(OWNER, `select create_invitation($1, 'agent', $2::uuid[]) as t`, [ids.biz, [ids.storeA]])).t;
  await rpc(AGENT_A, `select accept_invitation($1)`, [token]);

  for (const [key, biz, store] of [
    ["A", ids.biz, ids.storeA],
    ["B", ids.biz, ids.storeB],
    ["2", ids.biz2, ids.store2],
  ] as const) {
    const channel = (await one(
      `insert into channels (business_id, store_id, type, status, external_id) values ($1, $2, 'whatsapp', 'connected', $3) returning id`,
      [biz, store, `pn-${key}`],
    )).id;
    const contact = (await one(`insert into contacts (business_id, name) values ($1, $2) returning id`, [biz, `C${key}`])).id;
    ids[`conv${key}`] = (await one(
      `insert into conversations (business_id, contact_id, channel_id) values ($1, $2, $3) returning id`,
      [biz, contact, channel],
    )).id;
  }

  // A: history (ignored), one read, a person's answer, then 2 new ones and chekelin's reply.
  await message(ids.convA, ids.biz, 1, { direction: "in", status: "delivered", source: "history" });
  await message(ids.convA, ids.biz, 2, { direction: "in", status: "read" });
  await message(ids.convA, ids.biz, 3, { direction: "out", status: "sent" });
  await message(ids.convA, ids.biz, 4, { direction: "in", status: "sent" });
  await message(ids.convA, ids.biz, 5, { direction: "out", status: "sent", is_bot: true });
  await message(ids.convA, ids.biz, 6, { direction: "in", status: "delivered" });
  // B: one unread, then answered from the phone (Coexistence).
  await message(ids.convB, ids.biz, 1, { direction: "in", status: "sent" });
  await message(ids.convB, ids.biz, 2, { direction: "out", status: "sent", source: "phone" });
  // Otra: one unread.
  await message(ids.conv2, ids.biz2, 1, { direction: "in", status: "sent" });
});

describe("conversation_unread (migration 0034)", () => {
  it("counts the customer's messages after the last person's answer, not chekelin's", async () => {
    expect(await unread(OWNER)).toEqual({ [ids.convA]: 2 });
  });

  it("respects RLS: each person only sees counts of their own Tiendas' chats", async () => {
    await message(ids.convB, ids.biz, 3, { direction: "in", status: "sent" });
    expect(await unread(OWNER)).toEqual({ [ids.convA]: 2, [ids.convB]: 1 });
    expect(await unread(AGENT_A)).toEqual({ [ids.convA]: 2 });
    expect(await unread(OTHER_OWNER)).toEqual({ [ids.conv2]: 1 });
  });

  it("drops to zero once someone opens the chat (inbound marked read)", async () => {
    await rpc(AGENT_A, `update messages set status = 'read' where conversation_id = $1 and direction = 'in' returning id`, [ids.convA]);
    expect((await unread(AGENT_A))[ids.convA]).toBeUndefined();
  });
});

describe("the Tienda's location in store_chekelin_info (migration 0034)", () => {
  it("the Dueño saves address, Maps link and pin; the Tienda's Agente reads them", async () => {
    await rpc(
      OWNER,
      `insert into store_chekelin_info (store_id, business_id, location_address, location_maps_url, location_lat, location_lng)
       values ($1, $2, 'Col. Palmira', 'https://maps.app.goo.gl/x', 14.0723, -87.1921) returning store_id`,
      [ids.storeA, ids.biz],
    );
    const row = await rpc(AGENT_A, `select location_address, location_lat, location_lng from store_chekelin_info where store_id = $1`, [
      ids.storeA,
    ]);
    expect(row).toMatchObject({ location_address: "Col. Palmira", location_lat: 14.0723, location_lng: -87.1921 });
  });

  it("refuses an impossible pin", async () => {
    const r = await t.as(OWNER, `update store_chekelin_info set location_lat = 120 where store_id = $1`, [ids.storeA]);
    expect(r.error).toBeDefined();
  });

  it("is safe to run again", async () => {
    await t.applyMigration("0034_unread_and_store_location.sql");
    expect(await unread(OWNER)).toBeDefined();
  });
});
