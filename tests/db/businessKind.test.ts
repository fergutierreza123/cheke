import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Migration 0049: Tipo de negocio and Horario de atención (store_chekelin_info)
// and a Servicio's duration (products).
//
// Negocio "Luna": Tiendas A and B. U1 Dueño · U2 Gerente in A · U3 Agente in A.
const OWNER = userId(1);
const MANAGER_A = userId(2);
const AGENT_A = userId(3);

let t: TestDb;
const ids: Record<string, string> = {};

async function rpc(user: string, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  if (!r.rows) throw new Error(r.error);
  return r.rows[0];
}

const WEEK = JSON.stringify([null, ...Array(5).fill({ open: "09:00", close: "17:00" }), { open: "08:00", close: "12:00" }]);

// Upserts the Tienda's tipo and horario as `user`, like saveChekelinInfo.
function save(user: string, store: "A" | "B", kind = "services", hours: string | null = WEEK) {
  return t.as(
    user,
    `insert into store_chekelin_info (store_id, business_id, business_kind, opening_hours) values ($1, $2, $3, $4::jsonb)
     on conflict (store_id) do update set business_kind = excluded.business_kind, opening_hours = excluded.opening_hours
     returning business_kind`,
    [ids[`store${store}`], ids.biz, kind, hours],
  );
}

beforeAll(async () => {
  t = await createTestDb();
  for (const i of [1, 2, 3]) await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`)).id as string;
  ids.storeA = (await t.q(`select id from stores where business_id = $1`, [ids.biz]))[0].id as string;
  ids.storeB = (await rpc(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz])).id as string;
  for (const [user, role] of [
    [MANAGER_A, "manager"],
    [AGENT_A, "agent"],
  ] as const) {
    const token = (await rpc(OWNER, `select create_invitation($1, $2, $3::uuid[]) as t`, [ids.biz, role, [ids.storeA]])).t;
    await rpc(user, `select accept_invitation($1)`, [token]);
  }
});

describe("Tipo de negocio and Horario de atención", () => {
  it("existing Tiendas stay 'products' with no horario", async () => {
    await t.q(`insert into store_chekelin_info (store_id, business_id) values ($1, $2)`, [ids.storeB, ids.biz]);
    const [row] = await t.q(`select business_kind, opening_hours from store_chekelin_info where store_id = $1`, [ids.storeB]);
    expect(row).toEqual({ business_kind: "products", opening_hours: null });
  });

  it("the Tienda's Gerente changes them; the Dueño too", async () => {
    expect((await save(MANAGER_A, "A")).rows?.[0]).toEqual({ business_kind: "services" });
    expect((await save(OWNER, "B", "products")).rows?.[0]).toEqual({ business_kind: "products" });
  });

  it("an Agente can't change them, and a Gerente can't in another Tienda", async () => {
    expect((await save(AGENT_A, "A", "products", null)).error).toBeDefined();
    const update = await t.as(AGENT_A, `update store_chekelin_info set business_kind = 'products', opening_hours = null where store_id = $1 returning store_id`, [ids.storeA]);
    expect(update.rows ?? []).toEqual([]);
    expect((await save(MANAGER_A, "B")).error).toBeDefined();
    const [row] = await t.q(`select business_kind from store_chekelin_info where store_id = $1`, [ids.storeA]);
    expect(row.business_kind).toBe("services");
  });

  it("the Agente still reads them (chekelin and the screens need them)", async () => {
    const r = await t.as(AGENT_A, `select business_kind from store_chekelin_info where store_id = $1`, [ids.storeA]);
    expect(r.rows).toEqual([{ business_kind: "services" }]);
  });

  it("refuses an unknown tipo and a broken horario", async () => {
    expect((await save(OWNER, "A", "mixto")).error).toBeDefined();
    expect((await save(OWNER, "A", "services", JSON.stringify([{ open: "17:00", close: "09:00" }]))).error).toBeDefined();
    const sixDays = JSON.stringify(Array(6).fill(null));
    expect((await save(OWNER, "A", "services", sixDays)).error).toBeDefined();
    const late = JSON.parse(WEEK);
    late[1] = { open: "17:00", close: "09:00" };
    expect((await save(OWNER, "A", "services", JSON.stringify(late))).error).toBeDefined();
  });

  it("a Servicio's duration is minutes, or nothing for a product", async () => {
    const insert = (min: number | null) =>
      t.as(
        AGENT_A,
        `insert into products (business_id, store_id, retailer_id, name, price_hnl, duration_min) values ($1, $2, gen_random_uuid()::text, 'Corte', 150, $3) returning duration_min`,
        [ids.biz, ids.storeA, min],
      );
    expect((await insert(45)).rows?.[0]).toEqual({ duration_min: 45 });
    expect((await insert(null)).rows?.[0]).toEqual({ duration_min: null });
    expect((await insert(0)).error).toBeDefined();
  });
});
