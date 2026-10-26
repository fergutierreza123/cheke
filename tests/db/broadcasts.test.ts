import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Difusión (migration 0042): broadcasts are read and created by the Dueños
// and the Gerentes of that Tienda; their recipients are written only by the
// server. contacts.marketing_opt_out starts false.
//
// Negocio "Luna": Tiendas A and B. U1 Dueño · U2 Agente in A · U5 Gerente in B.
// Negocio "Otra": U3 Dueño.
const OWNER = userId(1);
const AGENT_A = userId(2);
const OTHER_OWNER = userId(3);
const MANAGER_B = userId(5);

let t: TestDb;
const ids: Record<string, string> = {};

async function one(sql: string, params: unknown[] = []) {
  return (await t.q(sql, params))[0] as Record<string, string>;
}
async function rpc(user: string | null, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  if (!r.rows) throw new Error(r.error);
  return r.rows;
}
const create = (user: string, store: string, channel: string, status = "draft") =>
  t.as(
    user,
    `insert into broadcasts (business_id, store_id, channel_id, template, tags, status, created_by)
     values ($1, $2, $3, '{"name":"oferta","language":"es","category":"MARKETING","components":[]}', '{vip}', $4, $5) returning id`,
    [ids.biz, store, channel, status, user],
  );
const visible = async (user: string, table: string) =>
  (await rpc(user, `select id::text from ${table} order by 1`)).map((r) => r.id as string);

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2, 3, 5]) {
    await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  }
  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`))[0].id as string;
  ids.storeA = (await one(`select id from stores where business_id = $1`, [ids.biz])).id;
  ids.storeB = (await rpc(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz]))[0].id as string;
  await rpc(OTHER_OWNER, `select create_business('Otra') as id`);
  const invite = async (role: string, stores: string[], who: string) => {
    const token = (await rpc(OWNER, `select create_invitation($1, $2, $3::uuid[]) as t`, [ids.biz, role, stores]))[0].t;
    await rpc(who, `select accept_invitation($1)`, [token]);
  };
  await invite("agent", [ids.storeA], AGENT_A);
  await invite("manager", [ids.storeB], MANAGER_B);
  for (const key of ["A", "B"]) {
    ids[`ch${key}`] = (await one(
      `insert into channels (business_id, store_id, type, status, external_id) values ($1, $2, 'whatsapp', 'connected', $3) returning id`,
      [ids.biz, ids[`store${key}`], `pn-${key}`],
    )).id;
  }
  ids.contact = (await one(`insert into contacts (business_id, name, tags) values ($1, 'Ana', '{vip}') returning id`, [ids.biz])).id;
});

describe("Difusión (broadcasts, migration 0042)", () => {
  it("contacts start without opting out of offers", async () => {
    expect((await one(`select marketing_opt_out from contacts where id = $1`, [ids.contact])).marketing_opt_out).toBe(false);
  });

  it("the Dueño and the Gerente of that Tienda create one; an Agente or another Negocio can't", async () => {
    ids.bA = ((await create(OWNER, ids.storeA, ids.chA)).rows?.[0].id ?? "") as string;
    ids.bB = ((await create(MANAGER_B, ids.storeB, ids.chB)).rows?.[0].id ?? "") as string;
    expect(ids.bA).not.toBe("");
    expect(ids.bB).not.toBe("");
    expect((await create(MANAGER_B, ids.storeA, ids.chA)).error).toBeDefined();
    expect((await create(AGENT_A, ids.storeA, ids.chA)).error).toBeDefined();
    expect((await create(OTHER_OWNER, ids.storeA, ids.chA)).error).toBeDefined();
  });

  it("starts as a draft (only the server starts sending), from its own Tienda's number", async () => {
    expect((await create(OWNER, ids.storeA, ids.chA, "sending")).error).toBeDefined();
    expect((await create(OWNER, ids.storeB, ids.chA)).error).toBeDefined();
  });

  it("each person reads only what they manage", async () => {
    expect(await visible(OWNER, "broadcasts")).toEqual([ids.bA, ids.bB].sort());
    expect(await visible(MANAGER_B, "broadcasts")).toEqual([ids.bB]);
    expect(await visible(AGENT_A, "broadcasts")).toEqual([]);
    expect(await visible(OTHER_OWNER, "broadcasts")).toEqual([]);
  });

  it("recipients: only the server writes them, the same people read them", async () => {
    const add = (user: string | null, broadcast: string) =>
      t.as(user, `insert into broadcast_recipients (broadcast_id, business_id, contact_id) values ($1, $2, $3) returning id`, [broadcast, ids.biz, ids.contact]);
    expect((await add(OWNER, ids.bA)).error).toBeDefined();
    const rA = (await rpc(null, `insert into broadcast_recipients (broadcast_id, business_id, contact_id) values ($1, $2, $3) returning id`, [ids.bA, ids.biz, ids.contact]))[0].id as string;
    const rB = (await rpc(null, `insert into broadcast_recipients (broadcast_id, business_id, contact_id) values ($1, $2, $3) returning id`, [ids.bB, ids.biz, ids.contact]))[0].id as string;
    expect(await visible(OWNER, "broadcast_recipients")).toEqual([rA, rB].sort());
    expect(await visible(MANAGER_B, "broadcast_recipients")).toEqual([rB]);
    expect(await visible(AGENT_A, "broadcast_recipients")).toEqual([]);
    expect(await rpc(OWNER, `update broadcast_recipients set status = 'sent' where id = $1 returning id`, [rA])).toEqual([]);
    expect(await rpc(OWNER, `update broadcasts set status = 'done' where id = $1 returning id`, [ids.bA])).toEqual([]);
  });

  it("the migration can run a second time", async () => {
    await t.applyMigration("0042_broadcasts.sql");
  });
});
