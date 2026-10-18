import { describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Hardening before launch (issue #35): migrations 0030 and 0032, and the
// one-time backfill of 0018.

async function rpc(t: TestDb, user: string, sql: string, params: unknown[] = []) {
  const r = await t.as(user, sql, params);
  if (!r.rows) throw new Error(r.error);
  return r.rows[0];
}

async function addUsers(t: TestDb, n: number) {
  for (let i = 1; i <= n; i++) {
    await t.q(`insert into auth.users (id, email) values ($1, $2)`, [userId(i), `u${i}@x.hn`]);
  }
}

async function invite(t: TestDb, owner: string, businessId: string, role: string, storeIds: string[]) {
  return (await rpc(t, owner, `select create_invitation($1, $2, $3::uuid[]) as t`, [businessId, role, storeIds])).t as string;
}

const storeOf = async (t: TestDb, businessId: string) =>
  (await t.q(`select id from stores where business_id = $1`, [businessId]))[0].id as string;

// Simulates the race of issue #35 item 2: right after `user`'s "one Negocio
// per person" check passed, another request (a second invitation accepted
// at the same moment) puts them in `otherBusiness`.
async function raceInto(t: TestDb, user: string, otherBusiness: string) {
  await t.db.exec(`
    create or replace function test_race() returns trigger language plpgsql as $$
    begin
      if pg_trigger_depth() = 1 and new.user_id = '${user}' and new.business_id <> '${otherBusiness}' then
        insert into members (business_id, user_id, role) values ('${otherBusiness}', new.user_id, 'agent');
      end if;
      return new;
    end $$;
    drop trigger if exists test_race on members;
    create trigger test_race before insert on members for each row execute function test_race();
  `);
}

describe("one Negocio per person (0030)", () => {
  const [OWNER_A, OWNER_B, PERSON] = [userId(1), userId(2), userId(3)];

  async function twoBusinesses() {
    const t = await createTestDb();
    await addUsers(t, 3);
    const bizA = (await rpc(t, OWNER_A, `select create_business('Luna') as id`)).id as string;
    const bizB = (await rpc(t, OWNER_B, `select create_business('Sol') as id`)).id as string;
    return { t, bizA, bizB };
  }

  it("the database refuses a second membership for the same person", async () => {
    const { t, bizB } = await twoBusinesses();
    await expect(t.q(`insert into members (business_id, user_id, role) values ($1, $2, 'agent')`, [bizB, OWNER_A])).rejects.toThrow(
      /members_one_business_per_user/,
    );
  });

  it("two invitations accepted at the same moment: the second one gets a clear message", async () => {
    const { t, bizA, bizB } = await twoBusinesses();
    const token = await invite(t, OWNER_A, bizA, "agent", [await storeOf(t, bizA)]);
    await raceInto(t, PERSON, bizB);

    const r = await t.as(PERSON, `select accept_invitation($1)`, [token]);
    expect(r.error).toBe("Tu cuenta ya pertenece a otro negocio en cheke.");
    // Not joined to Luna. (In this simulation the other request's row is
    // undone too, since it ran inside the same call.)
    expect(await t.q(`select business_id from members where user_id = $1 and business_id = $2`, [PERSON, bizA])).toEqual([]);
    expect(await t.q(`select accepted_at from invitations where token = $1`, [token])).toEqual([{ accepted_at: null }]);
  });

  it("creating a Negocio while joining another one at the same moment: a clear message, no empty Negocio left", async () => {
    const { t, bizB } = await twoBusinesses();
    await raceInto(t, PERSON, bizB);

    const r = await t.as(PERSON, `select create_business('Estrella')`);
    expect(r.error).toBe("Tu cuenta ya pertenece a un negocio.");
    expect(await t.q(`select id from businesses where name = 'Estrella'`)).toEqual([]);
  });

  it("invitations and new Negocios still work as before", async () => {
    const { t, bizA } = await twoBusinesses();
    const token = await invite(t, OWNER_A, bizA, "agent", [await storeOf(t, bizA)]);
    expect((await rpc(t, PERSON, `select accept_invitation($1) as id`, [token])).id).toBe(bizA);
    expect((await t.as(PERSON, `select create_business('Otra')`)).error).toBe("Tu cuenta ya pertenece a un negocio.");
  });

  it("refuses to run, with a clear message and without deleting anything, while someone is in two Negocios", async () => {
    const t = await createTestDb({ until: "0030" });
    await addUsers(t, 3);
    const bizA = (await rpc(t, OWNER_A, `select create_business('Luna') as id`)).id as string;
    const bizB = (await rpc(t, OWNER_B, `select create_business('Sol') as id`)).id as string;
    await t.q(`insert into members (business_id, user_id, role) values ($1, $2, 'agent')`, [bizB, OWNER_A]);

    await expect(t.applyMigration("0030_hardening.sql")).rejects.toThrow(/más de un negocio.*more than one business/s);
    expect(await t.q(`select count(*)::int as n from members where user_id = $1`, [OWNER_A])).toEqual([{ n: 2 }]);

    // Once the founder fixes it by hand, it runs (twice, too).
    await t.q(`delete from members where business_id = $1 and user_id = $2`, [bizB, OWNER_A]);
    await t.applyMigration("0030_hardening.sql");
    await t.applyMigration("0030_hardening.sql");
    void bizA;
  });
});

describe("security definer functions pin search_path (0030)", () => {
  it("is_member_of and business_members run with search_path = public", async () => {
    const t = await createTestDb();
    const rows = await t.q(
      `select proname, proconfig from pg_proc where proname in ('is_member_of', 'business_members') order by proname`,
    );
    expect(rows).toEqual([
      { proname: "business_members", proconfig: ["search_path=public"] },
      { proname: "is_member_of", proconfig: ["search_path=public"] },
    ]);
  });
});

describe("0018 store backfill is one-time (issue #35 item 5)", () => {
  it("re-running 0018 doesn't put back an Agente a Dueño took out of their only Tienda", async () => {
    const t = await createTestDb({ until: "0019" });
    await addUsers(t, 2);
    const [OWNER, AGENT] = [userId(1), userId(2)];
    const biz = (await rpc(t, OWNER, `select create_business('Luna') as id`)).id as string;
    const store = await storeOf(t, biz);
    await rpc(t, AGENT, `select accept_invitation($1)`, [await invite(t, OWNER, biz, "agent", [store])]);
    await t.q(`delete from store_members where user_id = $1`, [AGENT]);

    await t.applyMigration("0018_multi_store.sql");
    expect(await t.q(`select user_id from store_members where user_id = $1`, [AGENT])).toEqual([]);
  });
});

describe("businesses.invite_code is gone (0032)", () => {
  it("the column no longer exists", async () => {
    const t = await createTestDb();
    expect(
      await t.q(`select column_name from information_schema.columns where table_name = 'businesses' and column_name = 'invite_code'`),
    ).toEqual([]);
  });
});
