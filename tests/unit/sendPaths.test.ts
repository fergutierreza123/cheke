import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sending on a Canal (src/lib/channelSend.ts, src/lib/mediaSend.ts): the 24 h /
// 7 day reply windows, cheke's own token with the Canal's token as fallback,
// and "Reconectar" when Meta refuses every token. Meta's Graph API is faked
// with `fetch`; the Canal health side effects (src/lib/channelHealth.ts,
// which writes to the database) are recorded.
const health = vi.hoisted(() => ({
  markChannelNeedsReconnect: vi.fn(async () => {}),
  regeneratePageToken: vi.fn(async () => null as { pageId: string; accessToken: string } | null),
}));
vi.mock("@/lib/channelHealth", () => health);

import { encryptSecret } from "@/lib/crypto";
import { RECONNECT_MESSAGE } from "@/lib/whatsapp";
import { reactOnChannel, sendOnChannel } from "@/lib/channelSend";
import { sendMediaOnChannel } from "@/lib/mediaSend";

const KEY = randomBytes(32).toString("base64");
const HOUR = 60 * 60 * 1000;

type Call = { url: string; token: string | null; body: unknown };
let calls: Call[] = [];

// Meta answers each call with the next queued response.
function fakeMeta(...responses: Array<{ status: number; body: unknown }>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      calls.push({ url: String(url), token: auth?.replace("Bearer ", "") ?? null, body });
      const next = responses.shift() ?? { status: 500, body: { error: { message: "unexpected call" } } };
      return new Response(JSON.stringify(next.body), { status: next.status });
    }),
  );
}

const expiredToken = { status: 401, body: { error: { code: 190, message: "Error validating access token" } } };

function whatsappChannel() {
  return { id: "ch-wa", type: "whatsapp" as const, external_id: "PN1", page_id: null, access_token_encrypted: encryptSecret("own-token") };
}
function instagramChannel() {
  return { id: "ch-ig", type: "instagram" as const, external_id: "IG1", page_id: "PAGE1", access_token_encrypted: encryptSecret("page-token") };
}
const contact = { phone: "99223843", fb_psid: "PSID1", ig_id: "IGSID1" };
const openWindow = () => new Date(Date.now() + HOUR).toISOString();
const voice = { kind: "voice" as const, ogg: Buffer.from("ogg"), m4aUrl: "https://files/x.m4a" };

beforeEach(() => {
  vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
  vi.stubEnv("META_SYSTEM_USER_TOKEN", "");
  health.markChannelNeedsReconnect.mockClear();
  health.regeneratePageToken.mockReset().mockResolvedValue(null);
});

describe("voice notes and documents: Reconectar", () => {
  it("WhatsApp: when Meta refuses the token, the Canal asks for «Reconectar»", async () => {
    fakeMeta(expiredToken);
    const result = await sendMediaOnChannel({ channel: whatsappChannel(), contact, windowExpiresAt: openWindow(), file: voice });
    expect(result.error).toBe(RECONNECT_MESSAGE);
    expect(health.markChannelNeedsReconnect).toHaveBeenCalledWith("ch-wa", "whatsapp_190");
  });

  it("Instagram: a refused Page token is renewed once and the file still goes out", async () => {
    health.regeneratePageToken.mockResolvedValue({ pageId: "PAGE1", accessToken: "fresh-token" });
    fakeMeta(expiredToken, { status: 200, body: { message_id: "mid.ok" } });
    const result = await sendMediaOnChannel({ channel: instagramChannel(), contact, windowExpiresAt: openWindow(), file: voice });
    expect(result).toEqual({ externalMessageId: "mid.ok" });
    expect(calls.map((c) => c.token)).toEqual(["page-token", "fresh-token"]);
    expect(health.markChannelNeedsReconnect).not.toHaveBeenCalled();
  });

  it("Instagram: when the renewed token is refused too, «Reconectar»", async () => {
    fakeMeta(expiredToken);
    const result = await sendMediaOnChannel({ channel: instagramChannel(), contact, windowExpiresAt: openWindow(), file: voice });
    expect(result.error).toBe(RECONNECT_MESSAGE);
    expect(health.markChannelNeedsReconnect).toHaveBeenCalledWith("ch-ig", "meta_190");
  });
});

describe("text replies: cheke's own token first, the Canal's as fallback", () => {
  it("WhatsApp: the system token goes first; if Meta refuses it, the Canal's own token sends", async () => {
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "system-token");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeMeta(expiredToken, { status: 200, body: { messages: [{ id: "wamid.ok" }] } });
    const result = await sendOnChannel({ channel: whatsappChannel(), contact, windowExpiresAt: openWindow(), text: "hola", author: "human" });
    expect(result).toEqual({ externalMessageId: "wamid.ok" });
    expect(calls.map((c) => c.token)).toEqual(["system-token", "own-token"]);
    expect(calls[1].body).toMatchObject({ to: "50499223843", type: "text", text: { body: "hola" } });
    expect(health.markChannelNeedsReconnect).not.toHaveBeenCalled();
  });

  it("WhatsApp: a normal refusal (not the token) is not retried and doesn't ask for «Reconectar»", async () => {
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "system-token");
    fakeMeta({ status: 400, body: { error: { code: 131047, message: "Re-engagement message" } } });
    const result = await sendOnChannel({ channel: whatsappChannel(), contact, windowExpiresAt: openWindow(), text: "hola", author: "bot" });
    expect(result).toMatchObject({ error: "Re-engagement message", errorCode: 131047 });
    expect(calls).toHaveLength(1);
    expect(health.markChannelNeedsReconnect).not.toHaveBeenCalled();
  });

  it("WhatsApp: every token refused → «Reconectar»", async () => {
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "system-token");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeMeta(expiredToken, expiredToken);
    const result = await sendOnChannel({ channel: whatsappChannel(), contact, windowExpiresAt: openWindow(), text: "hola", author: "human" });
    expect(result.error).toBe(RECONNECT_MESSAGE);
    expect(health.markChannelNeedsReconnect).toHaveBeenCalledWith("ch-wa", "whatsapp_190");
  });

  it("Instagram: a quoted reply goes with reply_to", async () => {
    fakeMeta({ status: 200, body: { message_id: "mid.ok" } });
    const result = await sendOnChannel({
      channel: instagramChannel(),
      contact,
      windowExpiresAt: openWindow(),
      text: "sí hay",
      author: "human",
      replyToExternalId: "mid.customer",
    });
    expect(result).toEqual({ externalMessageId: "mid.ok" });
    expect(calls[0].url).toContain("/PAGE1/messages");
    expect(calls[0].body).toEqual({
      recipient: { id: "IGSID1" },
      messaging_type: "RESPONSE",
      message: { text: "sí hay", reply_to: { mid: "mid.customer" } },
    });
  });
});

describe("reactions", () => {
  it("WhatsApp: a reaction sends the emoji on that message; a refused token asks for «Reconectar»", async () => {
    fakeMeta({ status: 200, body: { messages: [{ id: "wamid.r" }] } }, expiredToken);
    const react = () =>
      reactOnChannel({ channel: whatsappChannel(), contact, windowExpiresAt: openWindow(), externalMessageId: "wamid.customer", emoji: "❤️" });
    expect(await react()).toEqual({});
    expect(calls[0].body).toMatchObject({ type: "reaction", reaction: { message_id: "wamid.customer", emoji: "❤️" } });
    expect((await react()).error).toBe(RECONNECT_MESSAGE);
    expect(health.markChannelNeedsReconnect).toHaveBeenCalledWith("ch-wa", "whatsapp_190");
  });
});

describe("reply windows", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * HOUR + 24 * HOUR).toISOString(); // last inbound `days` ago

  it("WhatsApp after 24 h: no text, voice note or document goes out (only templates)", async () => {
    fakeMeta();
    const closed = daysAgo(2);
    expect((await sendOnChannel({ channel: whatsappChannel(), contact, windowExpiresAt: closed, text: "hola", author: "human" })).error).toMatch(/24 horas|plantilla/i);
    expect((await sendMediaOnChannel({ channel: whatsappChannel(), contact, windowExpiresAt: closed, file: voice })).error).toMatch(/24 horas|plantilla/i);
    expect(calls).toHaveLength(0);
  });

  it("Instagram 24 h – 7 days: a person still answers with the HUMAN_AGENT tag; chekelin doesn't", async () => {
    fakeMeta({ status: 200, body: { message_id: "m1" } }, { status: 200, body: { message_id: "m2" } });
    const late = daysAgo(3);
    expect((await sendOnChannel({ channel: instagramChannel(), contact, windowExpiresAt: late, text: "hola", author: "bot" })).error).toMatch(/chekelin/);
    expect(calls).toHaveLength(0);
    await sendOnChannel({ channel: instagramChannel(), contact, windowExpiresAt: late, text: "hola", author: "human" });
    await sendMediaOnChannel({ channel: instagramChannel(), contact, windowExpiresAt: late, file: voice });
    for (const call of calls) expect(call.body).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
    expect(calls).toHaveLength(2);
  });

  it("Instagram after 7 days: nothing goes out", async () => {
    fakeMeta();
    const result = await sendMediaOnChannel({ channel: instagramChannel(), contact, windowExpiresAt: daysAgo(8), file: voice });
    expect(result.error).toMatch(/7 días/);
    expect(calls).toHaveLength(0);
  });
});
