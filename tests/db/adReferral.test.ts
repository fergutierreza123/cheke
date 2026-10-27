import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Migration 0039: the ad a chat came from, on conversations.
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
async function headlines(user: string) {
  const r = await t.as(user, `select referral_headline from conversations where referral is not null order by referral_headline`);
  if (!r.rows) throw new Error(r.error);
  return r.rows.map((row) => row.referral_headline);
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
    // The webhook (service role) saves the ad.
    const r = await t.as(
      null,
      `update conversations set referral = $2, referral_source = 'anuncio', referral_ad_id = $3, referral_headline = $4, referral_at = now()
       where id = $1 returning id`,
      [ids[`conv${key}`], JSON.stringify({ source_id: `ad-${key}`, source_type: "ad" }), `ad-${key}`, `Anuncio ${key}`],
    );
    expect(r.error).toBeUndefined();
  }
});

describe("conversation ad referral (migration 0039)", () => {
  it("each person only sees the ads of chats they can already see", async () => {
    expect(await headlines(OWNER)).toEqual(["Anuncio A", "Anuncio B"]);
    expect(await headlines(AGENT_A)).toEqual(["Anuncio A"]);
    expect(await headlines(OTHER_OWNER)).toEqual(["Anuncio 2"]);
  });

  it("nobody signed in can change or fake it, but the rest of the chat stays editable", async () => {
    const changed = await t.as(OWNER, `update conversations set referral_headline = 'Otro' where id = $1 returning id`, [ids.convA]);
    expect(changed.error).toBeDefined();
    const cleared = await t.as(AGENT_A, `update conversations set referral = null where id = $1 returning id`, [ids.convA]);
    expect(cleared.error).toBeDefined();
    expect(await headlines(OWNER)).toEqual(["Anuncio A", "Anuncio B"]);

    const stage = await t.as(AGENT_A, `update conversations set stage = 'consulta' where id = $1 returning id`, [ids.convA]);
    expect(stage.rows).toHaveLength(1);
  });

  it("refuses an unknown source", async () => {
    await expect(t.q(`update conversations set referral_source = 'tv' where id = $1`, [ids.convA])).rejects.toThrow();
  });

  it("is safe to run again", async () => {
    await t.applyMigration("0039_conversation_ad_referral.sql");
    expect(await headlines(OWNER)).toEqual(["Anuncio A", "Anuncio B"]);
  });
});
