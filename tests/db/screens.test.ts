import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// QA round 2: Row Level Security of the tables behind Contactos, Catálogo,
// chekeo, Equipo (invitations), Plantillas' Sugerencias, Lo que chekelin
// sabe and phone alerts, between Tiendas, roles and Negocios.
//
// Negocio "Luna": Tiendas A and B.
//   OWNER Dueño · AGENT_A Agente in A · MANAGER_B Gerente in B
// Negocio "Otra": OTHER Dueño.
const OWNER = userId(11);
const AGENT_A = userId(12);
const MANAGER_B = userId(13);
const OTHER = userId(14);

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
async function rows(user: string, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  return r.rows ?? [];
}

beforeAll(async () => {
  t = await createTestDb();
  for (const u of [OWNER, AGENT_A, MANAGER_B, OTHER]) {
    await t.q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u.slice(-2)}@x.hn`]);
  }
  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`)).id as string;
  ids.storeA = (await one(`select id from stores where business_id = $1`, [ids.biz])).id;
  ids.storeB = (await rpc(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz])).id as string;
  ids.biz2 = (await rpc(OTHER, `select create_business('Otra') as id`)).id as string;
  ids.store2 = (await one(`select id from stores where business_id = $1`, [ids.biz2])).id;

  const join = async (role: string, store: string, who: string) => {
    const token = (await rpc(OWNER, `select create_invitation($1, $2, array[$3]::uuid[]) as t`, [ids.biz, role, store])).t;
    await rpc(who, `select accept_invitation($1)`, [token]);
  };
  await join("agent", ids.storeA, AGENT_A);
  await join("manager", ids.storeB, MANAGER_B);

  // A customer who writes to Tienda B only.
  ids.chB = (await one(`insert into channels (business_id, store_id, type, status) values ($1, $2, 'whatsapp', 'connected') returning id`, [ids.biz, ids.storeB])).id;
  ids.contact = (await one(`insert into contacts (business_id, name) values ($1, 'Marielos') returning id`, [ids.biz])).id;
  ids.convB = (await one(`insert into conversations (business_id, contact_id, channel_id) values ($1, $2, $3) returning id`, [ids.biz, ids.contact, ids.chB])).id;
  await t.q(`insert into messages (conversation_id, business_id, direction, body) values ($1, $2, 'in', 'hola')`, [ids.convB, ids.biz]);
  ids.productB = (await one(`insert into products (business_id, store_id, retailer_id, name, price_hnl) values ($1, $2, 'r1', 'Blusa', 300) returning id`, [ids.biz, ids.storeB])).id;
  ids.suggestion = (await one(`insert into template_suggestions (business_id, question, name, category, body) values ($1, '¿precio?', 'P', 'precios', 'x') returning id`, [ids.biz])).id;
  await t.q(`insert into store_chekelin_info (store_id, business_id, payment_methods) values ($1, $1, 'BAC')`, [ids.storeA]);
  await t.q(`insert into device_tokens (user_id, business_id, token, platform) values ($1, $2, 'tok-owner', 'ios')`, [OWNER, ids.biz]);
});

describe("Contactos", () => {
  it("an Agente can't delete a contact (it would erase another Tienda's chats with it)", async () => {
    const del = await rows(AGENT_A, `delete from contacts where id = $1 returning id`, [ids.contact]);
    expect(del).toEqual([]);
    expect(await t.q(`select id from conversations where id = $1`, [ids.convB])).toHaveLength(1);
  });

  it("nor can a Gerente; only a Dueño", async () => {
    expect(await rows(MANAGER_B, `delete from contacts where id = $1 returning id`, [ids.contact])).toEqual([]);
    const spare = (await one(`insert into contacts (business_id, name) values ($1, 'Duplicado') returning id`, [ids.biz])).id;
    expect(await rows(OWNER, `delete from contacts where id = $1 returning id`, [spare])).toHaveLength(1);
  });

  it("everyone in the Negocio still adds and edits contacts", async () => {
    expect(await rows(AGENT_A, `insert into contacts (business_id, name) values ($1, 'Nuevo') returning id`, [ids.biz])).toHaveLength(1);
    expect(await rows(AGENT_A, `update contacts set notes = 'llamar' where id = $1 returning id`, [ids.contact])).toHaveLength(1);
  });
});

describe("Catálogo and chekeo stay inside the person's Tiendas", () => {
  it("an Agente of A can't edit, delete or price anything of Tienda B", async () => {
    expect(await rows(AGENT_A, `update products set price_hnl = 1 where id = $1 returning id`, [ids.productB])).toEqual([]);
    expect(await rows(AGENT_A, `delete from products where id = $1 returning id`, [ids.productB])).toEqual([]);
    expect(await rows(AGENT_A, `update conversations set stage = 'ganado', value_hnl = 5 where id = $1 returning id`, [ids.convB])).toEqual([]);
  });

  it("a Gerente of B can't add a product to Tienda A", async () => {
    const r = await t.as(MANAGER_B, `insert into products (business_id, store_id, retailer_id, name) values ($1, $2, 'x', 'x')`, [ids.biz, ids.storeA]);
    expect(r.error).toMatch(/row-level security/);
  });
});

describe("Equipo: invitations", () => {
  beforeAll(async () => {
    ids.ownerInvite = (await rpc(OWNER, `select create_invitation($1, 'owner', '{}'::uuid[]) as t`, [ids.biz])).t as string;
    ids.managerInvite = (await rpc(MANAGER_B, `select create_invitation($1, 'agent', array[$2]::uuid[]) as t`, [ids.biz, ids.storeB])).t as string;
  });
  const tokens = async (user: string) => (await rows(user, `select token from invitations order by token`)).map((r) => r.token);

  it("an Agente sees no invitation links (a Dueño link would make anyone a Dueño)", async () => {
    expect(await tokens(AGENT_A)).toEqual([]);
  });

  it("a Gerente sees only the links they made; the Dueño sees all", async () => {
    expect(await tokens(MANAGER_B)).toEqual([ids.managerInvite]);
    expect(await tokens(OWNER)).toEqual(expect.arrayContaining([ids.ownerInvite, ids.managerInvite]));
    expect(await tokens(OTHER)).toEqual([]);
  });

  it("a Gerente can't cancel the Dueño's link, and nobody can cancel a used one", async () => {
    expect(await rows(MANAGER_B, `delete from invitations where token = $1 returning id`, [ids.ownerInvite])).toEqual([]);
    const used = (await t.q(`select token from invitations where accepted_at is not null limit 1`))[0].token;
    expect(await rows(OWNER, `delete from invitations where token = $1 returning id`, [used])).toEqual([]);
  });
});

describe("another Negocio sees none of this Negocio's set-up", () => {
  it("Tiendas, team, Tienda assignments, Lo que chekelin sabe and Sugerencias", async () => {
    for (const table of ["stores", "members", "store_members", "store_chekelin_info", "template_suggestions"]) {
      const own = await rows(OTHER, `select business_id from ${table}`);
      expect(own.every((r) => r.business_id === ids.biz2), table).toBe(true);
    }
  });
});

describe("Plantillas: Sugerencias de chekelin", () => {
  it("an Agente can't approve one, even knowing its id", async () => {
    expect(await rows(AGENT_A, `update template_suggestions set status = 'approved' where id = $1 returning id`, [ids.suggestion])).toEqual([]);
  });
});

describe("Notificaciones: phone alert tokens", () => {
  it("nobody reads or deletes another person's phone, not even a Dueño's teammates", async () => {
    expect(await rows(AGENT_A, `select token from device_tokens`)).toEqual([]);
    expect(await rows(AGENT_A, `delete from device_tokens where token = 'tok-owner' returning id`)).toEqual([]);
    expect(await rows(OWNER, `select token from device_tokens`)).toEqual([{ token: "tok-owner" }]);
  });

  it("a phone can't be registered for someone else", async () => {
    const r = await t.as(AGENT_A, `insert into device_tokens (user_id, business_id, token, platform) values ($1, $2, 'tok-x', 'android')`, [OWNER, ids.biz]);
    expect(r.error).toMatch(/row-level security/);
  });
});
