import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, userId, type TestDb } from "./harness";

// Before PR #91 the iPhone app saved Apple's (APNs) token, 64 hex digits.
// Firebase can't use it: it answers "invalid-argument", which src/lib/push.ts
// can't safely treat as a dead token, so those rows stayed forever and every
// alert tried them again. Migration 0047 removes them; FCM tokens (they
// contain ":") and Android tokens stay.
let t: TestDb;
const APNS = "a".repeat(32) + "0123456789abcdef0123456789ABCDEF";
const FCM = "fGx1:APA91bH-example_token";

beforeAll(async () => {
  t = await createTestDb({ until: "0047" });
  await t.q(`insert into auth.users (id, email) values ($1, 'u@x.hn')`, [userId(1)]);
  const biz = (await t.q(`insert into businesses (name) values ('Luna') returning id`))[0].id;
  for (const [token, platform] of [[APNS, "ios"], [FCM, "ios"], ["b".repeat(64), "android"]]) {
    await t.q(`insert into device_tokens (user_id, business_id, token, platform) values ($1, $2, $3, $4)`, [userId(1), biz, token, platform]);
  }
});

describe("migration 0047: old iPhone (APNs) tokens", () => {
  it("removes them, keeps FCM and Android tokens, and can run twice", async () => {
    await t.applyMigration("0047_drop_apns_device_tokens.sql");
    await t.applyMigration("0047_drop_apns_device_tokens.sql");
    const rows = await t.q(`select token from device_tokens order by token`);
    expect(rows.map((r) => r.token)).toEqual(["b".repeat(64), FCM]);
  });
});
