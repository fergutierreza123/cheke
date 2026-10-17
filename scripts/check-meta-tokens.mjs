// Checks the token/error rules in src/lib/metaTokens.ts (issue #56): which
// Meta errors mean "Reconectar", how debug_token dates are read, and when the
// daily check warns. No network, no secrets.
//
// Usage (from the repo root, Node 22.18+ / 24):
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-meta-tokens.mjs

import assert from "node:assert/strict";
import {
  daysLeft,
  expiryAction,
  grantedPageIds,
  isMetaAuthError,
  metaTimestampToIso,
} from "../src/lib/metaTokens.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-17T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

check("190 / 102 / 131005 / 200 mean reconnect", () => {
  assert.equal(isMetaAuthError({ code: 190 }), true);
  assert.equal(isMetaAuthError({ code: 190, error_subcode: 463 }), true);
  assert.equal(isMetaAuthError({ code: 102 }), true);
  assert.equal(isMetaAuthError({ code: 131005 }), true);
  assert.equal(isMetaAuthError({ code: 200 }), true);
  assert.equal(isMetaAuthError({ code: 230 }), true);
});

check("normal refusals don't", () => {
  assert.equal(isMetaAuthError(undefined), false);
  assert.equal(isMetaAuthError(null), false);
  assert.equal(isMetaAuthError({}), false);
  assert.equal(isMetaAuthError({ code: 131047 }), false); // 24 h window
  assert.equal(isMetaAuthError({ code: 131042 }), false); // billing
  assert.equal(isMetaAuthError({ code: 10, error_subcode: 2018278 }), false); // outside window (Messenger)
  assert.equal(isMetaAuthError({ code: 200, error_subcode: 1545041 }), false); // another app owns the thread
  assert.equal(isMetaAuthError({ code: 551 }), false); // person unavailable
});

check("debug_token timestamps", () => {
  assert.equal(metaTimestampToIso(0), null);
  assert.equal(metaTimestampToIso(undefined), null);
  assert.equal(metaTimestampToIso("abc"), null);
  assert.equal(metaTimestampToIso(1797508800), "2026-12-17T12:00:00.000Z");
});

check("expiry: nothing known or far away", () => {
  const base = { token_expires_at: null, expiry_warned_at: null, reauth_required_at: null };
  assert.equal(expiryAction(base, now), null);
  assert.equal(expiryAction({ ...base, token_expires_at: iso(now + 30 * DAY) }, now), null);
});

check("expiry: warn once within 7 days", () => {
  const soon = { token_expires_at: iso(now + 5 * DAY), expiry_warned_at: null, reauth_required_at: null };
  assert.equal(expiryAction(soon, now), "warn");
  assert.equal(expiryAction({ ...soon, expiry_warned_at: iso(now - DAY) }, now), null);
  assert.equal(expiryAction({ ...soon, token_expires_at: iso(now + 7 * DAY) }, now), "warn");
});

check("expiry: past date marks reconnect, unless already marked", () => {
  const past = { token_expires_at: iso(now - DAY), expiry_warned_at: iso(now - 8 * DAY), reauth_required_at: null };
  assert.equal(expiryAction(past, now), "expired");
  assert.equal(expiryAction({ ...past, reauth_required_at: iso(now) }, now), null);
});

check("days left", () => {
  assert.equal(daysLeft(iso(now + 5 * DAY), now), 5);
  assert.equal(daysLeft(iso(now + 2 * 60 * 60 * 1000), now), 1);
});

check("granted Page ids from granular_scopes", () => {
  const scopes = [
    { scope: "pages_messaging", target_ids: ["111", "222"] },
    { scope: "pages_show_list", target_ids: ["222", "333"] },
    { scope: "instagram_basic", target_ids: ["999"] },
    { scope: "business_management" },
    { scope: "pages_messaging", target_ids: ["not-a-page", 5] },
  ];
  assert.deepEqual(grantedPageIds(scopes).sort(), ["111", "222", "333"]);
  assert.deepEqual(grantedPageIds(undefined), []);
});

console.log(`\n${passed} checks passed.`);
