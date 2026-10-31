import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, migrationFiles, userId, type TestDb } from "./harness";

// Row Level Security between Negocios, Tiendas and roles.
//
// Negocio "Luna" (biz):   Tiendas A and B.
//   U1 Dueño · U2 Agente in A · U5 Gerente in B · U6 Agente in A and B
// Negocio "Otra" (biz2):  one Tienda. U3 Dueño.
// U4 is signed in but belongs to no Negocio.
const OWNER = userId(1);
const AGENT_A = userId(2);
const OTHER_OWNER = userId(3);
const NOBODY = userId(4);
const MANAGER_B = userId(5);
const AGENT_AB = userId(6);

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

// The ids of `table` this person can read.
async function visible(user: string | null, table: string, where = "true"): Promise<string[]> {
  const r = await t.as(user, `select id::text from ${table} where ${where} order by 1`);
  if (!r.rows) throw new Error(r.error);
  return r.rows.map((row) => row.id as string);
}

const sorted = (...xs: string[]) => [...xs].sort();

beforeAll(async () => {
  t = await createTestDb();
  for (let i = 1; i <= 6; i++) {
    await t.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"full_name":"Persona"}')`, [
      userId(i),
      `u${i}@x.hn`,
    ]);
  }

  ids.biz = (await rpc(OWNER, `select create_business('Luna') as id`)).id as string;
  ids.storeA = (await one(`select id from stores where business_id = $1`, [ids.biz])).id;
  ids.storeB = (await rpc(OWNER, `insert into stores (business_id, name) values ($1, 'Mall') returning id`, [ids.biz])).id as string;
  ids.biz2 = (await rpc(OTHER_OWNER, `select create_business('Otra') as id`)).id as string;
  ids.store2 = (await one(`select id from stores where business_id = $1`, [ids.biz2])).id;

  const invite = async (role: string, stores: string[], who: string, by = OWNER) => {
    const token = (await rpc(by, `select create_invitation($1, $2, $3::uuid[]) as t`, [ids.biz, role, stores])).t;
    await rpc(who, `select accept_invitation($1)`, [token]);
  };
  await invite("agent", [ids.storeA], AGENT_A);
  await invite("manager", [ids.storeB], MANAGER_B);
  await invite("agent", [ids.storeA, ids.storeB], AGENT_AB);

  // Data written by the service role (webhooks), one set per Tienda.
  for (const [key, biz, store] of [
    ["A", ids.biz, ids.storeA],
    ["B", ids.biz, ids.storeB],
    ["2", ids.biz2, ids.store2],
  ] as const) {
    ids[`ch${key}`] = (await one(
      `insert into channels (business_id, store_id, type, status, external_id) values ($1, $2, 'whatsapp', 'connected', $3) returning id`,
      [biz, store, `pn-${key}`],
    )).id;
    ids[`contact${key}`] = (await one(`insert into contacts (business_id, name) values ($1, $2) returning id`, [biz, `C${key}`])).id;
    ids[`conv${key}`] = (await one(
      `insert into conversations (business_id, contact_id, channel_id) values ($1, $2, $3) returning id`,
      [biz, ids[`contact${key}`], ids[`ch${key}`]],
    )).id;
    ids[`msg${key}`] = (await one(
      `insert into messages (conversation_id, business_id, direction, body) values ($1, $2, 'in', 'hola') returning id`,
      [ids[`conv${key}`], biz],
    )).id;
    ids[`product${key}`] = (await one(
      `insert into products (business_id, store_id, retailer_id, name, price_hnl) values ($1, $2, $3, 'Blusa', 300) returning id`,
      [biz, store, `r-${key}`],
    )).id;
    ids[`order${key}`] = (await one(
      `insert into orders (business_id, conversation_id, contact_id, items, total_hnl, status) values ($1, $2, $3, '[]', 300, 'awaiting_payment') returning id`,
      [biz, ids[`conv${key}`], ids[`contact${key}`]],
    )).id;
    ids[`note${key}`] = (await one(
      `insert into conversation_notes (business_id, store_id, conversation_id, summary) values ($1, $2, $3, 'quiere blusa') returning id`,
      [biz, store, ids[`conv${key}`]],
    )).id;
    await t.q(`insert into store_chekelin_info (store_id, business_id, payment_methods) values ($1, $1, 'BAC')`, [store]);
  }
  for (const [key, biz] of [["1", ids.biz], ["2", ids.biz2]] as const) {
    ids[`template${key}`] = (await one(
      `insert into templates (business_id, name, category, body) values ($1, 'T', 'precios', 'x') returning id`,
      [biz],
    )).id;
    ids[`reply${key}`] = (await one(`insert into quick_replies (business_id, shortcut, body) values ($1, 'horario', '8 a 5') returning id`, [biz])).id;
    ids[`suggestion${key}`] = (await one(
      `insert into template_suggestions (business_id, question, name, category, body) values ($1, '¿precio?', 'P', 'precios', 'x') returning id`,
      [biz],
    )).id;
  }
});

describe("migrations", () => {
  it("apply in order from 0001, every one of them", () => {
    const files = migrationFiles();
    expect(files[0]).toMatch(/^0001_/);
    expect(files.length).toBeGreaterThanOrEqual(22);
  });

  // Each migration says "safe to run more than once". Re-running an older
  // one after a newer one changed the same function can fail (0020 after
  // 0021 redefines business_members), so only the newest ones are re-run.
  it("the newest migrations can run a second time", async () => {
    for (const f of migrationFiles().filter((f) => f >= "0021")) await t.applyMigration(f);
  });
});

describe("Negocio isolation", () => {
  it("each Dueño sees only their own Negocio's rows", async () => {
    for (const table of ["conversations", "messages", "products", "orders", "channels", "conversation_notes"]) {
      const key = table === "conversations" ? "conv" : table === "messages" ? "msg" : table.replace(/s$/, "").replace("conversation_note", "note").replace("channel", "ch");
      expect(await visible(OWNER, table), table).toEqual(sorted(ids[`${key}A`], ids[`${key}B`]));
      expect(await visible(OTHER_OWNER, table), table).toEqual([ids[`${key}2`]]);
    }
    expect(await visible(OWNER, "contacts")).toEqual(sorted(ids.contactA, ids.contactB));
    expect(await visible(OTHER_OWNER, "templates")).toEqual([ids.template2]);
    expect(await visible(OTHER_OWNER, "quick_replies")).toEqual([ids.reply2]);
    expect(await visible(OWNER, "businesses")).toEqual([ids.biz]);
  });

  it("someone with no Negocio sees nothing", async () => {
    for (const table of ["businesses", "stores", "members", "contacts", "conversations", "messages", "products", "orders", "channels", "templates", "quick_replies", "invitations"]) {
      const r = await t.as(NOBODY, `select count(*)::int as n from ${table}`);
      expect(r.rows?.[0].n, table).toBe(0);
    }
  });

  it("can't write into another Negocio", async () => {
    expect((await t.as(OTHER_OWNER, `insert into contacts (business_id, name) values ($1, 'x')`, [ids.biz])).error).toBeDefined();
    expect((await t.as(OTHER_OWNER, `insert into products (business_id, store_id, retailer_id, name) values ($1, $2, 'z', 'x')`, [ids.biz, ids.storeA])).error).toBeDefined();
    expect((await t.as(OTHER_OWNER, `insert into quick_replies (business_id, shortcut, body) values ($1, 'x', 'y')`, [ids.biz])).error).toBeDefined();
    const upd = await t.as(OTHER_OWNER, `update conversations set stage = 'perdido' where id = $1 returning id`, [ids.convA]);
    expect(upd.rows).toEqual([]);
    const del = await t.as(OTHER_OWNER, `delete from contacts where id = $1 returning id`, [ids.contactA]);
    expect(del.rows).toEqual([]);
  });

  it("a Tienda of one Negocio can't be used for another's rows", async () => {
    const r = await t.as(OTHER_OWNER, `insert into products (business_id, store_id, retailer_id, name) values ($1, $2, 'z', 'x')`, [ids.biz2, ids.storeA]);
    expect(r.error).toMatch(/no pertenece a este negocio|row-level security/);
  });

  it("a message always takes its conversation's Negocio, whatever the app sends", async () => {
    const r = await t.as(OWNER, `insert into messages (conversation_id, business_id, direction, body) values ($1, $2, 'out', 'x') returning business_id, store_id`, [ids.convA, ids.biz2]);
    expect(r.rows?.[0]).toEqual({ business_id: ids.biz, store_id: ids.storeA });
  });

  it("a quoted reply only keeps a quote from its own conversation", async () => {
    const reply = (user: string | null, quoted: string) =>
      t.as(user, `insert into messages (conversation_id, business_id, direction, body, reply_to_id) values ($1, $2, 'out', 'x', $3) returning reply_to_id`, [ids.convA, ids.biz, quoted]);
    expect((await reply(OWNER, ids.msgA)).rows?.[0].reply_to_id).toBe(ids.msgA);
    // Same Negocio, other conversation; another Negocio; and via the webhook's service role.
    expect((await reply(OWNER, ids.msgB)).rows?.[0].reply_to_id).toBeNull();
    expect((await reply(OWNER, ids.msg2)).rows?.[0].reply_to_id).toBeNull();
    expect((await reply(null, ids.msg2)).rows?.[0].reply_to_id).toBeNull();
    const moved = await t.as(OWNER, `update messages set reply_to_id = $1 where id = $2 returning reply_to_id`, [ids.msgB, ids.msgA]);
    expect(moved.rows?.[0].reply_to_id).toBeNull();
  });

  it("nobody can change their Negocio's plan or join another Negocio by hand", async () => {
    expect((await t.as(OWNER, `update businesses set plan = 'pro' where id = $1 returning id`, [ids.biz])).rows).toEqual([]);
    expect((await t.as(NOBODY, `insert into members (business_id, user_id, role) values ($1, $2, 'owner')`, [ids.biz, NOBODY])).error).toBeDefined();
    const move = await t.as(OTHER_OWNER, `update members set business_id = $1 where user_id = $2`, [ids.biz, OTHER_OWNER]);
    expect(move.error).toBeDefined();
  });
});

describe("Tiendas and roles", () => {
  it("an Agente sees only their Tienda's conversations, messages, products and orders", async () => {
    expect(await visible(AGENT_A, "conversations")).toEqual([ids.convA]);
    expect(await visible(AGENT_A, "messages", "direction = 'in'")).toEqual([ids.msgA]);
    expect(await visible(AGENT_A, "products")).toEqual([ids.productA]);
    expect(await visible(AGENT_A, "orders")).toEqual([ids.orderA]);
    expect(await visible(AGENT_A, "channels")).toEqual([ids.chA]);
    expect(await visible(AGENT_A, "conversation_notes")).toEqual([ids.noteA]);
    expect(await visible(AGENT_AB, "conversations")).toEqual(sorted(ids.convA, ids.convB));
  });

  it("contacts, templates and quick replies stay shared by the whole Negocio", async () => {
    expect(await visible(AGENT_A, "contacts")).toEqual(sorted(ids.contactA, ids.contactB));
    expect(await visible(AGENT_A, "templates")).toEqual([ids.template1]);
    expect(await visible(AGENT_A, "quick_replies")).toEqual([ids.reply1]);
  });

  it("an Agente can't move a conversation into a Tienda they don't work in", async () => {
    const r = await t.as(AGENT_A, `update conversations set channel_id = $1 where id = $2`, [ids.chB, ids.convA]);
    expect(r.error).toMatch(/row-level security/);
  });

  it("a Gerente sees only their Tienda", async () => {
    expect(await visible(MANAGER_B, "conversations")).toEqual([ids.convB]);
    expect(await visible(MANAGER_B, "products")).toEqual([ids.productB]);
  });

  it("only Dueños and the Tienda's Gerentes change channels and Lo que chekelin sabe", async () => {
    const setInfo = (user: string, store: string) =>
      t.as(user, `update store_chekelin_info set faq = 'x' where store_id = $1 returning store_id`, [store]);
    expect((await setInfo(OWNER, ids.storeA)).rows).toHaveLength(1);
    expect((await setInfo(MANAGER_B, ids.storeB)).rows).toHaveLength(1);
    expect((await setInfo(MANAGER_B, ids.storeA)).rows).toEqual([]);
    expect((await setInfo(AGENT_A, ids.storeA)).rows).toEqual([]);
    const disconnect = (user: string, ch: string) =>
      t.as(user, `update channels set status = 'disconnected' where id = $1 returning id`, [ch]);
    expect((await disconnect(AGENT_A, ids.chA)).rows).toEqual([]);
    expect((await disconnect(MANAGER_B, ids.chA)).rows).toEqual([]);
    expect((await disconnect(MANAGER_B, ids.chB)).rows).toHaveLength(1);
  });

  it("Agentes can't edit Plantillas; Gerentes can", async () => {
    expect((await t.as(AGENT_A, `insert into templates (business_id, name, category, body) values ($1, 'x', 'precios', 'y')`, [ids.biz])).error).toBeDefined();
    expect((await t.as(AGENT_A, `update templates set body = 'z' where id = $1 returning id`, [ids.template1])).rows).toEqual([]);
    expect((await t.as(AGENT_A, `delete from templates where id = $1 returning id`, [ids.template1])).rows).toEqual([]);
    expect((await t.as(MANAGER_B, `update templates set body = 'z' where id = $1 returning id`, [ids.template1])).rows).toHaveLength(1);
  });

  it("Agentes can't edit quick replies or see Sugerencias; Gerentes can", async () => {
    expect((await t.as(AGENT_A, `insert into quick_replies (business_id, shortcut, body) values ($1, 'x', 'y')`, [ids.biz])).error).toBeDefined();
    expect((await t.as(AGENT_A, `update quick_replies set body = 'z' where id = $1 returning id`, [ids.reply1])).rows).toEqual([]);
    expect(await visible(AGENT_A, "template_suggestions")).toEqual([]);
    expect(await visible(MANAGER_B, "template_suggestions")).toEqual([ids.suggestion1]);
    expect((await t.as(MANAGER_B, `insert into quick_replies (business_id, shortcut, body) values ($1, 'gerente', 'y') returning id`, [ids.biz])).rows).toHaveLength(1);
  });

  it("only Dueños create, rename or archive Tiendas", async () => {
    expect((await t.as(MANAGER_B, `insert into stores (business_id, name) values ($1, 'Nueva')`, [ids.biz])).error).toBeDefined();
    expect((await t.as(MANAGER_B, `update stores set name = 'x' where id = $1 returning id`, [ids.storeB])).rows).toEqual([]);
    expect((await t.as(OTHER_OWNER, `update stores set name = 'x' where id = $1 returning id`, [ids.storeA])).rows).toEqual([]);
  });

  it("only Dueños change roles; a Negocio always keeps a Dueño", async () => {
    expect((await t.as(MANAGER_B, `update members set role = 'owner' where user_id = $1 returning user_id`, [MANAGER_B])).rows).toEqual([]);
    expect((await t.as(AGENT_A, `delete from members where user_id = $1 returning user_id`, [MANAGER_B])).rows).toEqual([]);
    const lastOwner = await t.as(OWNER, `update members set role = 'agent' where user_id = $1`, [OWNER]);
    expect(lastOwner.error).toMatch(/al menos un dueño/);
  });

  it("a Gerente assigns only Agentes, only in their own Tienda", async () => {
    expect((await t.as(MANAGER_B, `insert into store_members (store_id, user_id) values ($1, $2)`, [ids.storeB, AGENT_A])).error).toBeUndefined();
    expect((await t.as(MANAGER_B, `insert into store_members (store_id, user_id) values ($1, $2)`, [ids.storeA, AGENT_AB])).error).toBeDefined();
    expect((await t.as(MANAGER_B, `delete from store_members where store_id = $1 and user_id = $2 returning user_id`, [ids.storeB, MANAGER_B])).rows).toEqual([]);
    // Back as it was.
    await t.q(`delete from store_members where store_id = $1 and user_id = $2`, [ids.storeB, AGENT_A]);
  });

  it("a Dueño can't put someone into another Negocio's Tienda", async () => {
    const r = await t.as(OTHER_OWNER, `insert into store_members (store_id, user_id) values ($1, $2)`, [ids.storeA, OTHER_OWNER]);
    expect(r.error).toBeDefined();
  });

  it("Agentes can't invite; Gerentes only invite Agentes to their own Tienda", async () => {
    expect((await t.as(AGENT_A, `select create_invitation($1, 'agent', array[$2]::uuid[])`, [ids.biz, ids.storeA])).error).toMatch(/Solo los dueños y gerentes/);
    expect((await t.as(MANAGER_B, `select create_invitation($1, 'manager', array[$2]::uuid[])`, [ids.biz, ids.storeB])).error).toMatch(/solo puede invitar agentes/);
    expect((await t.as(MANAGER_B, `select create_invitation($1, 'agent', array[$2]::uuid[])`, [ids.biz, ids.storeA])).error).toMatch(/Elige al menos una tienda|No puedes invitar/);
    expect((await t.as(MANAGER_B, `select create_invitation($1, 'agent', array[$2]::uuid[]) as t`, [ids.biz, ids.storeB])).rows).toHaveLength(1);
  });

  it("someone already in a Negocio can't accept another Negocio's invitation", async () => {
    const token = (await rpc(OTHER_OWNER, `select create_invitation($1, 'agent', array[$2]::uuid[]) as t`, [ids.biz2, ids.store2])).t;
    expect((await t.as(AGENT_A, `select accept_invitation($1)`, [token])).error).toMatch(/otro negocio/);
  });

  it("an archived Tienda disappears for its Agentes and stays readable for Dueños", async () => {
    await t.q(`update stores set archived_at = now() where id = $1`, [ids.storeB]);
    try {
      expect(await visible(AGENT_AB, "conversations")).toEqual([ids.convA]);
      expect(await visible(MANAGER_B, "conversations")).toEqual([]);
      expect(await visible(OWNER, "conversations")).toEqual(sorted(ids.convA, ids.convB));
      // The Gerente no longer manages it either.
      expect((await t.as(MANAGER_B, `update channels set status = 'connected' where id = $1 returning id`, [ids.chB])).rows).toEqual([]);
    } finally {
      await t.q(`update stores set archived_at = null where id = $1`, [ids.storeB]);
    }
  });

  it("received photos and voice notes (message-media) follow the same Tienda rules", async () => {
    for (const [biz, store, file] of [
      [ids.biz, ids.storeA, "a.ogg"],
      [ids.biz, ids.storeB, "b.jpg"],
      [ids.biz2, ids.store2, "c.pdf"],
    ]) {
      await t.q(`insert into storage.objects (bucket_id, name) values ('message-media', $1)`, [`${biz}/${store}/${file}`]);
    }
    const files = async (user: string) =>
      ((await t.as(user, `select name from storage.objects where bucket_id = 'message-media'`)).rows ?? [])
        .map((r) => String(r.name).split("/").pop())
        .sort();
    expect(await files(OWNER)).toEqual(["a.ogg", "b.jpg"]);
    expect(await files(AGENT_A)).toEqual(["a.ogg"]);
    expect(await files(OTHER_OWNER)).toEqual(["c.pdf"]);
    expect(await files(NOBODY)).toEqual([]);
    const upload = await t.as(AGENT_A, `insert into storage.objects (bucket_id, name) values ('message-media', $1)`, [`${ids.biz}/${ids.storeA}/z.jpg`]);
    expect(upload.error).toBeDefined();
  });

  it("the service role (webhooks, cron) sees every Negocio", async () => {
    expect(await visible(null, "conversations")).toEqual(sorted(ids.convA, ids.convB, ids.conv2));
  });
});

describe("Comentarios (post_comments, migration 0027)", () => {
  beforeAll(async () => {
    for (const [key, biz, store] of [
      ["A", ids.biz, ids.storeA],
      ["B", ids.biz, ids.storeB],
      ["2", ids.biz2, ids.store2],
    ] as const) {
      ids[`comment${key}`] = (await one(
        `insert into post_comments (business_id, store_id, channel_id, platform, external_comment_id, body, private_status, private_sent_at)
         values ($1, $2, $3, 'instagram', $4, '¿precio?', 'sent', now()) returning id`,
        [biz, store, ids[`ch${key}`], `ig-comment-${key}`],
      )).id;
    }
  });

  it("each person sees only the comments of their own Tiendas", async () => {
    expect(await visible(OWNER, "post_comments")).toEqual(sorted(ids.commentA, ids.commentB));
    expect(await visible(AGENT_A, "post_comments")).toEqual([ids.commentA]);
    expect(await visible(MANAGER_B, "post_comments")).toEqual([ids.commentB]);
    expect(await visible(OTHER_OWNER, "post_comments")).toEqual([ids.comment2]);
    expect(await visible(NOBODY, "post_comments")).toEqual([]);
    expect(await visible(null, "post_comments")).toEqual(sorted(ids.commentA, ids.commentB, ids.comment2));
  });

  it("only the server writes them: nobody signed in can add, change or delete one", async () => {
    const add = await t.as(OWNER, `insert into post_comments (business_id, store_id, channel_id, platform, external_comment_id) values ($1, $2, $3, 'facebook', 'fake')`, [ids.biz, ids.storeA, ids.chA]);
    expect(add.error).toBeDefined();
    expect((await t.as(OWNER, `update post_comments set private_status = 'queued' where id = $1 returning id`, [ids.commentA])).rows ?? []).toEqual([]);
    expect((await t.as(OWNER, `delete from post_comments where id = $1 returning id`, [ids.commentA])).rows ?? []).toEqual([]);
  });

  it("a redelivered comment can't be saved twice", async () => {
    const again = await t.as(null, `insert into post_comments (business_id, store_id, channel_id, platform, external_comment_id) values ($1, $2, $3, 'instagram', 'ig-comment-A')`, [ids.biz, ids.storeA, ids.chA]);
    expect(again.error).toMatch(/duplicate|unique/);
  });

  it("the hourly private-reply count is for the server only", async () => {
    expect((await t.as(OWNER, `select comment_private_replies_sent_last_hour($1) as n`, [ids.chA])).error).toBeDefined();
    expect((await t.as(null, `select comment_private_replies_sent_last_hour($1) as n`, [ids.chA])).rows?.[0].n).toBe(1);
  });
});

describe("Canal token health (migration 0029)", () => {
  it("an Agente or another Negocio can't clear «Reconectar» or swap a Canal's tokens", async () => {
    await t.q(`update channels set reauth_required_at = now() where id = $1`, [ids.chA]);
    try {
      const r = await t.as(AGENT_A, `update channels set reauth_required_at = null, credential_token_encrypted = 'x' where id = $1 returning id`, [ids.chA]);
      expect(r.rows ?? []).toEqual([]);
      expect((await t.as(OTHER_OWNER, `update channels set reauth_required_at = null where id = $1 returning id`, [ids.chA])).rows ?? []).toEqual([]);
    } finally {
      await t.q(`update channels set reauth_required_at = null where id = $1`, [ids.chA]);
    }
  });
});
