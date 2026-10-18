import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// whatsapp_templates (migration 0033): the WhatsApp message templates Meta
// approved (or is reviewing) for each connected number, synced from the
// WhatsApp Business Account. Same people as the Canal: the Tienda's people
// and the Dueños read them; only the server writes them.
//
// Negocio "Luna": Tiendas A and B. U1 Dueño · U2 Agente in A · U5 Gerente in B.
// Negocio "Otra": U3 Dueño. U4 belongs to no Negocio.
const OWNER = userId(1);
const AGENT_A = userId(2);
const OTHER_OWNER = userId(3);
const NOBODY = userId(4);
const MANAGER_B = userId(5);

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
async function visible(user: string | null): Promise<string[]> {
  const r = await t.as(user, `select id::text from whatsapp_templates order by 1`);
  if (!r.rows) throw new Error(r.error);
  return r.rows.map((row) => row.id as string);
}
const sorted = (...xs: string[]) => [...xs].sort();

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2, 3, 4, 5]) {
    await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  }
  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`)).id as string;
  ids.storeA = (await one(`select id from stores where business_id = $1`, [ids.biz])).id;
  ids.storeB = (await rpc(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz])).id as string;
  ids.biz2 = (await rpc(OTHER_OWNER, `select create_business('Otra') as id`)).id as string;
  ids.store2 = (await one(`select id from stores where business_id = $1`, [ids.biz2])).id;

  const invite = async (role: string, stores: string[], who: string) => {
    const token = (await rpc(OWNER, `select create_invitation($1, $2, $3::uuid[]) as t`, [ids.biz, role, stores])).t;
    await rpc(who, `select accept_invitation($1)`, [token]);
  };
  await invite("agent", [ids.storeA], AGENT_A);
  await invite("manager", [ids.storeB], MANAGER_B);

  for (const [key, biz, store] of [
    ["A", ids.biz, ids.storeA],
    ["B", ids.biz, ids.storeB],
    ["2", ids.biz2, ids.store2],
  ] as const) {
    ids[`ch${key}`] = (await one(
      `insert into channels (business_id, store_id, type, status, external_id, waba_id) values ($1, $2, 'whatsapp', 'connected', $3, $4) returning id`,
      [biz, store, `pn-${key}`, `waba-${key}`],
    )).id;
    // Written by the server (sync), as the service role.
    const r = await t.as(
      null,
      `insert into whatsapp_templates (business_id, store_id, channel_id, waba_id, name, language, status, category, components)
       values ($1, $2, $3, $4, 'seguimiento', 'es', 'APPROVED', 'UTILITY', '[{"type":"BODY","text":"Hola {{1}}"}]') returning id`,
      [biz, store, ids[`ch${key}`], `waba-${key}`],
    );
    if (!r.rows) throw new Error(r.error);
    ids[`wt${key}`] = r.rows[0].id as string;
  }
});

describe("WhatsApp templates (whatsapp_templates, migration 0033)", () => {
  it("each person sees only the templates of their own Tiendas' numbers", async () => {
    expect(await visible(OWNER)).toEqual(sorted(ids.wtA, ids.wtB));
    expect(await visible(AGENT_A)).toEqual([ids.wtA]);
    expect(await visible(MANAGER_B)).toEqual([ids.wtB]);
    expect(await visible(OTHER_OWNER)).toEqual([ids.wt2]);
    expect(await visible(NOBODY)).toEqual([]);
    expect(await visible(null)).toEqual(sorted(ids.wtA, ids.wtB, ids.wt2));
  });

  it("only the server writes them: nobody signed in can add, change or delete one", async () => {
    const add = await t.as(
      OWNER,
      `insert into whatsapp_templates (business_id, store_id, channel_id, waba_id, name, language, status, category) values ($1, $2, $3, 'waba-A', 'x', 'es', 'APPROVED', 'UTILITY')`,
      [ids.biz, ids.storeA, ids.chA],
    );
    expect(add.error).toBeDefined();
    expect((await t.as(OWNER, `update whatsapp_templates set status = 'APPROVED' where id = $1 returning id`, [ids.wtA])).rows ?? []).toEqual([]);
    expect((await t.as(OWNER, `delete from whatsapp_templates where id = $1 returning id`, [ids.wtA])).rows ?? []).toEqual([]);
  });

  it("one row per number, name and language: a re-sync updates it instead of duplicating", async () => {
    const again = await t.as(
      null,
      `insert into whatsapp_templates (business_id, store_id, channel_id, waba_id, name, language, status, category)
       values ($1, $2, $3, 'waba-A', 'seguimiento', 'es', 'PAUSED', 'UTILITY')
       on conflict (channel_id, name, language) do update set status = excluded.status returning id, status`,
      [ids.biz, ids.storeA, ids.chA],
    );
    expect(again.rows?.[0]).toEqual({ id: ids.wtA, status: "PAUSED" });
  });

  it("the Tienda must be the Canal's own", async () => {
    const wrong = await t.as(
      null,
      `insert into whatsapp_templates (business_id, store_id, channel_id, waba_id, name, language, status, category) values ($1, $2, $3, 'waba-A', 'otra', 'es', 'APPROVED', 'UTILITY')`,
      [ids.biz, ids.storeB, ids.chA],
    );
    expect(wrong.error).toBeDefined();
  });

  it("is removed with its Canal", async () => {
    await t.q(`delete from channels where id = $1`, [ids.ch2]);
    expect(await visible(null)).toEqual(sorted(ids.wtA, ids.wtB));
  });

  it("the migration can run a second time", async () => {
    await t.applyMigration("0033_whatsapp_templates.sql");
  });
});
