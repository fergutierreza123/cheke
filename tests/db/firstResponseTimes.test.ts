import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Migration 0041: Analítica's "Tiempo de primera respuesta" per person.
//
// Negocio "Luna": Tiendas A and B. U1 Dueño · U2 Agente in A.
const OWNER = userId(1);
const AGENT_A = userId(2);

let t: TestDb;
const ids: Record<string, string> = {};

async function one(sql: string, params: unknown[] = []) {
  return (await t.q(sql, params))[0] as Record<string, string>;
}
async function rpc(user: string, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  if (!r.rows) throw new Error(r.error);
  return r.rows;
}
// "mes" rows as { user: [replies, median seconds] }.
async function month(user: string, storeIds: string[]) {
  const rows = await rpc(user, `select * from first_response_times($1::uuid[]) where period = 'mes'`, [storeIds]);
  return Object.fromEntries(rows.map((r) => [r.user_id as string, [r.replies, r.median_seconds]]));
}

// Minutes ago: everything is within the last 40 minutes, so it lands in the
// current week and month unless the test runs right as one begins.
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
async function message(conv: string, min: number, fields: Record<string, unknown>) {
  const cols = ["conversation_id", "business_id", "body", "created_at", ...Object.keys(fields)];
  const vals = [conv, ids.biz, "m", ago(min), ...Object.values(fields)];
  await t.q(`insert into messages (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
}
const IN = { direction: "in" };
const BOT = { direction: "out", is_bot: true };
const by = (user: string) => ({ direction: "out", sent_by: user });

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2]) {
    await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  }
  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`))[0].id as string;
  ids.storeA = (await one(`select id from stores where business_id = $1`, [ids.biz])).id;
  ids.storeB = (await rpc(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz]))[0].id as string;
  const token = (await rpc(OWNER, `select create_invitation($1, 'agent', $2::uuid[]) as t`, [ids.biz, [ids.storeA]]))[0].t;
  await rpc(AGENT_A, `select accept_invitation($1)`, [token]);

  for (const [key, store] of [["A1", ids.storeA], ["A2", ids.storeA], ["B", ids.storeB]] as const) {
    const channel = (await one(
      `insert into channels (business_id, store_id, type, status, external_id) values ($1, $2, 'whatsapp', 'connected', $3) returning id`,
      [ids.biz, store, `pn-${key}`],
    )).id;
    const contact = (await one(`insert into contacts (business_id, name) values ($1, $2) returning id`, [ids.biz, key])).id;
    ids[key] = (await one(
      `insert into conversations (business_id, contact_id, channel_id) values ($1, $2, $3) returning id`,
      [ids.biz, contact, channel],
    )).id;
  }

  // A1, no chekelin: waits from the first of two messages (4 min), then a
  // second message from the same person is not a new reply; next wait 2 min.
  await message(ids.A1, 30, IN);
  await message(ids.A1, 29, IN);
  await message(ids.A1, 26, by(AGENT_A));
  await message(ids.A1, 25, by(AGENT_A));
  await message(ids.A1, 20, IN);
  await message(ids.A1, 18, by(AGENT_A));
  // A2, chekelin answers then hands off; the wait starts at its last message
  // (6 min), not the customer's first one. Then chekelin answers, the
  // customer writes again and the Dueño replies 1 min later.
  await message(ids.A2, 40, IN);
  await message(ids.A2, 39, BOT);
  await message(ids.A2, 38, IN);
  await message(ids.A2, 37, BOT);
  await message(ids.A2, 31, by(OWNER));
  await message(ids.A2, 15, IN);
  await message(ids.A2, 14, BOT);
  await message(ids.A2, 10, IN);
  await message(ids.A2, 9, by(OWNER));
  // A phone reply ends the wait without counting for anyone.
  await message(ids.A2, 8, IN);
  await message(ids.A2, 5, { direction: "out", source: "phone" });
  // B: the Dueño, 10 min.
  await message(ids.B, 20, IN);
  await message(ids.B, 10, by(OWNER));
});

describe("first_response_times (migration 0041)", () => {
  it("counts only people's first replies, with the median wait in seconds", async () => {
    expect(await month(OWNER, [ids.storeA, ids.storeB])).toEqual({
      [AGENT_A]: [2, 180],
      [OWNER]: [3, 360],
    });
  });

  it("covers only the Tiendas asked for and the ones RLS allows", async () => {
    expect(await month(OWNER, [ids.storeB])).toEqual({ [OWNER]: [1, 600] });
    // The Agente asks for both but only sees Tienda A.
    expect(await month(AGENT_A, [ids.storeA, ids.storeB])).toEqual({
      [AGENT_A]: [2, 180],
      [OWNER]: [2, 210],
    });
  });

  it("returns the three periods", async () => {
    const rows = await rpc(OWNER, `select distinct period from first_response_times($1::uuid[])`, [[ids.storeB]]);
    expect(rows.map((r) => r.period).sort()).toEqual(["mes", "semana", "trimestre"]);
  });
});
