import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// «Listo» (migration 0045): a person closes a chat; the customer writing
// again reopens it. Only people of the chat's Tienda can close it.
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
async function status(conv: string) {
  return (await one(`select status from conversations where id = $1`, [conv])).status;
}
async function close(user: string, conv: string) {
  return t.as(user, `update conversations set status = 'closed' where id = $1 returning id`, [conv]);
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
  const token = (await rpc(OWNER, `select create_invitation($1, 'agent', $2::uuid[]) as t`, [ids.biz, [ids.storeA]])).t;
  await rpc(AGENT_A, `select accept_invitation($1)`, [token]);

  for (const [key, store] of [["A", ids.storeA], ["B", ids.storeB]] as const) {
    const channel = (await one(
      `insert into channels (business_id, store_id, type, status, external_id) values ($1, $2, 'whatsapp', 'connected', $3) returning id`,
      [ids.biz, store, `pn-${key}`],
    )).id;
    const contact = (await one(`insert into contacts (business_id, name) values ($1, $2) returning id`, [ids.biz, `C${key}`])).id;
    ids[`conv${key}`] = (await one(
      `insert into conversations (business_id, contact_id, channel_id) values ($1, $2, $3) returning id`,
      [ids.biz, contact, channel],
    )).id;
  }
});

describe("«Listo»: closing a chat", () => {
  it("an Agente closes a chat of their Tienda", async () => {
    expect((await close(AGENT_A, ids.convA)).rows).toHaveLength(1);
    expect(await status(ids.convA)).toBe("closed");
  });

  it("nobody closes a chat of a Tienda they don't work in, or of another Negocio", async () => {
    expect((await close(AGENT_A, ids.convB)).rows ?? []).toHaveLength(0);
    expect((await close(OTHER_OWNER, ids.convB)).rows ?? []).toHaveLength(0);
    expect(await status(ids.convB)).toBe("open");
  });
});

describe("the customer writing again reopens it", () => {
  it("our own reply and imported history leave it closed", async () => {
    await t.q(`insert into messages (conversation_id, business_id, direction, body) values ($1, $2, 'out', 'gracias')`, [ids.convA, ids.biz]);
    await t.q(
      `insert into messages (conversation_id, business_id, direction, body, source) values ($1, $2, 'in', 'viejo', 'history')`,
      [ids.convA, ids.biz],
    );
    expect(await status(ids.convA)).toBe("closed");
  });

  it("an inbound message (the webhook, service role) reopens it", async () => {
    const r = await t.as(
      null,
      `insert into messages (conversation_id, business_id, direction, body) values ($1, $2, 'in', 'hola otra vez')`,
      [ids.convA, ids.biz],
    );
    expect(r.error).toBeUndefined();
    expect(await status(ids.convA)).toBe("open");
  });
});

it("migration 0045 can run twice", async () => {
  await expect(t.applyMigration("0045_reopen_closed_chat.sql")).resolves.toBeUndefined();
});
