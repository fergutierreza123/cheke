import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// chekelin's monthly count and usage records (migration 0037). The Dueño
// reads the month's count (the meter in Mi cuenta); nobody signed in reads
// the token records or writes either table; only the server does. Users
// can't give themselves an extra pack.
//
// Negocio "Luna": U1 Dueño · U2 Agente. Negocio "Otra": U3 Dueño.
const OWNER = userId(1);
const AGENT = userId(2);
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
async function count(user: string, table: string): Promise<number> {
  const r = await t.as(user, `select count(*)::int as n from ${table}`);
  if (!r.rows) throw new Error(r.error);
  return r.rows[0].n as number;
}

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2, 3]) await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`)).id as string;
  ids.store = (await one(`select id from stores where business_id = $1`, [ids.biz])).id;
  await rpc(OTHER_OWNER, `select create_business('Otra') as id`);
  const token = (await rpc(OWNER, `select create_invitation($1, 'agent', $2::uuid[]) as t`, [ids.biz, [ids.store]])).t;
  await rpc(AGENT, `select accept_invitation($1)`, [token]);

  const channel = (await one(
    `insert into channels (business_id, store_id, type, status, external_id) values ($1, $2, 'whatsapp', 'connected', 'pn-1') returning id`,
    [ids.biz, ids.store],
  )).id;
  const contact = (await one(`insert into contacts (business_id, name) values ($1, 'Marielos') returning id`, [ids.biz])).id;
  ids.conv = (await one(`insert into conversations (business_id, contact_id, channel_id) values ($1, $2, $3) returning id`, [
    ids.biz,
    contact,
    channel,
  ])).id;

  await t.q(`insert into chekelin_monthly_conversations (conversation_id, month, business_id, store_id) values ($1, '2026-10-01', $2, $3)`, [
    ids.conv,
    ids.biz,
    ids.store,
  ]);
  await t.q(
    `insert into chekelin_usage (business_id, store_id, conversation_id, kind, model, input_tokens, output_tokens) values ($1, $2, $3, 'seller', 'claude-sonnet-5-5', 600, 350)`,
    [ids.biz, ids.store, ids.conv],
  );
});

describe("chekelin's monthly count", () => {
  it("the Dueño reads it; the Agente and other Negocios don't", async () => {
    expect(await count(OWNER, "chekelin_monthly_conversations")).toBe(1);
    expect(await count(AGENT, "chekelin_monthly_conversations")).toBe(0);
    expect(await count(OTHER_OWNER, "chekelin_monthly_conversations")).toBe(0);
  });

  it("counts a conversation once a month", async () => {
    await expect(
      t.q(`insert into chekelin_monthly_conversations (conversation_id, month, business_id) values ($1, '2026-10-01', $2)`, [ids.conv, ids.biz]),
    ).rejects.toThrow();
  });

  it("nobody signed in writes it", async () => {
    const r = await t.as(
      OWNER,
      `insert into chekelin_monthly_conversations (conversation_id, month, business_id) values ($1, '2026-11-01', $2)`,
      [ids.conv, ids.biz],
    );
    expect(r.rows).toBeUndefined();
  });
});

describe("chekelin's usage records", () => {
  it("are server-only, even for the Dueño", async () => {
    expect(await count(OWNER, "chekelin_usage")).toBe(0);
    const r = await t.as(OWNER, `insert into chekelin_usage (business_id, kind, model) values ($1, 'seller', 'x')`, [ids.biz]);
    expect(r.rows).toBeUndefined();
  });
});

describe("the extra pack", () => {
  it("a Dueño can't give themselves one", async () => {
    await t.as(OWNER, `update businesses set chekelin_extra = 1000, chekelin_extra_month = '2026-10-01' where id = $1`, [ids.biz]);
    expect((await one(`select chekelin_extra from businesses where id = $1`, [ids.biz])).chekelin_extra).toBe(0);
  });
});
