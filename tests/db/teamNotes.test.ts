import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Migration 0040: Notas del equipo (conversation_notes kind 'team').
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
// A team note on `conv` as `user`, claiming `author`.
function note(user: string, conv: "A" | "B" | "2", { author = user, kind = "team", summary = "ya le cobré" } = {}) {
  const [biz, store] = conv === "2" ? [ids.biz2, ids.store2] : [ids.biz, ids[`store${conv}`]];
  return t.as(
    user,
    `insert into conversation_notes (business_id, store_id, conversation_id, kind, summary, author_id) values ($1, $2, $3, $4, $5, $6) returning id`,
    [biz, store, ids[`conv${conv}`], kind, summary, author],
  );
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
});

describe("team notes", () => {
  it("anyone in the Tienda writes one as themselves, and the Tienda sees it", async () => {
    const r = await note(AGENT_A, "A");
    expect(r.error).toBeUndefined();
    const id = r.rows![0].id;
    const seen = async (user: string) =>
      (await t.as(user, `select id from conversation_notes where id = $1`, [id])).rows?.length;
    expect(await seen(OWNER)).toBe(1);
    expect(await seen(AGENT_A)).toBe(1);
    expect(await seen(OTHER_OWNER)).toBe(0);
    expect((await note(OWNER, "B")).error).toBeUndefined();
  });

  it("can't be written in someone else's name", async () => {
    expect((await note(AGENT_A, "A", { author: OWNER })).error).toBeDefined();
  });

  it("can't be written on a chat the person can't see", async () => {
    expect((await note(AGENT_A, "B")).error).toBeDefined();
    expect((await note(OTHER_OWNER, "A", { author: OTHER_OWNER })).error).toBeDefined();
  });

  it("can't point at a conversation of another Tienda", async () => {
    const r = await t.as(
      OWNER,
      `insert into conversation_notes (business_id, store_id, conversation_id, kind, summary, author_id) values ($1, $2, $3, 'team', 'x', $4)`,
      [ids.biz, ids.storeA, ids.convB, OWNER],
    );
    expect(r.error).toBeDefined();
  });

  it("people only write team notes, never empty ones; chekelin's kinds stay server-only", async () => {
    expect((await note(AGENT_A, "A", { kind: "handoff" })).error).toBeDefined();
    expect((await note(AGENT_A, "A", { summary: "   " })).error).toBeDefined();
    expect((await note(AGENT_A, "A", { summary: "x".repeat(2001) })).error).toBeDefined();
  });

  it("nobody edits or deletes a note", async () => {
    const id = (await note(AGENT_A, "A")).rows![0].id;
    expect((await t.as(AGENT_A, `update conversation_notes set summary = 'y' where id = $1 returning id`, [id])).rows ?? []).toEqual([]);
    expect((await t.as(OWNER, `delete from conversation_notes where id = $1 returning id`, [id])).rows ?? []).toEqual([]);
  });
});
