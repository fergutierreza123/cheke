import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Etiquetas (contacts.tags): editing them follows the contact-edit rule
// from 0001 (any member of the Negocio), and nobody outside it can read or
// write them. No migration: the column and RLS already exist.
//
// Negocio "Luna": U1 Dueño · U2 Agente. Negocio "Otra": U3 Dueño.
const OWNER = userId(1);
const AGENT = userId(2);
const OTHER_OWNER = userId(3);

let t: TestDb;
let biz = "";
let contact = "";

async function rpc(user: string, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  if (!r.rows) throw new Error(r.error);
  return r.rows;
}

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2, 3]) {
    await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  }
  biz = (await rpc(OWNER, `select create_business('Luna') as id`))[0].id as string;
  await rpc(OTHER_OWNER, `select create_business('Otra') as id`);
  const store = ((await t.q(`select id from stores where business_id = $1`, [biz]))[0] as { id: string }).id;
  const token = (await rpc(OWNER, `select create_invitation($1, 'agent', $2::uuid[]) as t`, [biz, [store]]))[0].t;
  await rpc(AGENT, `select accept_invitation($1)`, [token]);
  contact = ((await t.q(`insert into contacts (business_id, name) values ($1, 'Ana') returning id`, [biz]))[0] as { id: string }).id;
});

describe("contacts.tags under RLS", () => {
  it("an Agente of the Negocio can set a contact's Etiquetas", async () => {
    const rows = await rpc(AGENT, `update contacts set tags = $1 where id = $2 returning id`, [["vip", "mayorista"], contact]);
    expect(rows).toHaveLength(1);
  });

  it("another Negocio can neither change nor read them", async () => {
    expect(await rpc(OTHER_OWNER, `update contacts set tags = '{}' where id = $1 returning id`, [contact])).toHaveLength(0);
    expect(await rpc(OTHER_OWNER, `select id from contacts where tags && $1`, [["vip"]])).toHaveLength(0);
    const [row] = (await t.q(`select tags from contacts where id = $1`, [contact])) as Array<{ tags: string[] }>;
    expect(row.tags).toEqual(["vip", "mayorista"]);
  });

  it("the Negocio can query contacts by Etiqueta (what a Campaña will use)", async () => {
    const rows = await rpc(OWNER, `select id from contacts where business_id = $1 and tags && $2`, [biz, ["mayorista", "otra"]]);
    expect(rows.map((r) => r.id)).toEqual([contact]);
  });
});
