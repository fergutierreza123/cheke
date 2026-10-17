import { createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { credentialsForChannel, samePhone, toWhatsAppNumber, verifyWebhookSignature } from "@/lib/whatsapp";
import { isCronRequest } from "@/lib/cron";

const KEY = randomBytes(32).toString("base64");

afterEach(() => vi.unstubAllEnvs());

describe("encryptSecret / decryptSecret", () => {
  it("round-trips and never repeats a ciphertext", () => {
    vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
    const a = encryptSecret("EAAG-token-ñ");
    const b = encryptSecret("EAAG-token-ñ");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toContain("EAAG");
    expect(decryptSecret(a)).toBe("EAAG-token-ñ");
  });

  it("rejects tampered data and other formats", () => {
    vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
    const [v, iv, tag, data] = encryptSecret("secret").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
    expect(() => decryptSecret("plain-token")).toThrow("Formato de secreto no reconocido.");
  });

  it("fails with a wrong or missing key", () => {
    vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
    const sealed = encryptSecret("secret");
    vi.stubEnv("CHANNEL_TOKEN_KEY", randomBytes(32).toString("base64"));
    expect(() => decryptSecret(sealed)).toThrow();
    vi.stubEnv("CHANNEL_TOKEN_KEY", "");
    expect(() => encryptSecret("x")).toThrow("Falta CHANNEL_TOKEN_KEY");
    vi.stubEnv("CHANNEL_TOKEN_KEY", Buffer.from("short").toString("base64"));
    expect(() => encryptSecret("x")).toThrow("32 bytes");
  });
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ entry: [{ id: "1" }] });
  const sign = (secret: string, raw: string) => "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");

  it("accepts Meta's signature of the raw body", () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "app-secret");
    expect(verifyWebhookSignature(body, sign("app-secret", body))).toBe(true);
  });

  it("refuses wrong secrets, changed bodies, bad headers and a missing secret", () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "app-secret");
    expect(verifyWebhookSignature(body, sign("other", body))).toBe(false);
    expect(verifyWebhookSignature(body + " ", sign("app-secret", body))).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc")).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz")).toBe(false);
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect(verifyWebhookSignature(body, sign("", body))).toBe(false);
  });
});

describe("phone numbers for WhatsApp", () => {
  it("adds 504 to local Honduran numbers", () => {
    expect(toWhatsAppNumber("9922-3843")).toBe("50499223843");
    expect(toWhatsAppNumber("+504 9922 3843")).toBe("50499223843");
    expect(toWhatsAppNumber("+1 (555) 123-4567")).toBe("15551234567");
  });

  it("matches the same person however it was typed", () => {
    expect(samePhone("+504 9922-3843", "99223843")).toBe(true);
    expect(samePhone("99223843", "99223844")).toBe(false);
    expect(samePhone(null, "1")).toBe(false);
    expect(samePhone("abc", "def")).toBe(false);
  });
});

describe("credentialsForChannel", () => {
  it("decrypts the channel's own token", () => {
    vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
    const creds = credentialsForChannel({ external_id: "PN1", access_token_encrypted: encryptSecret("tok") });
    expect(creds).toEqual({ phoneNumberId: "PN1", accessToken: "tok" });
  });

  it("never lends cheke's test number token to another business's channel", () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "TEST");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "shared");
    expect(credentialsForChannel({ external_id: "OTHER", access_token_encrypted: null })).toBeNull();
    expect(credentialsForChannel(null)).toBeNull();
  });

  it("returns null when the token can't be decrypted", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("CHANNEL_TOKEN_KEY", KEY);
    expect(credentialsForChannel({ external_id: "PN1", access_token_encrypted: "v1:bad:bad:bad" })).toBeNull();
  });
});

describe("isCronRequest", () => {
  it("needs the exact bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronRequest("Bearer s3cret")).toBe(true);
    expect(isCronRequest("Bearer s3cre")).toBe(false);
    expect(isCronRequest("s3cret")).toBe(false);
    expect(isCronRequest(null)).toBe(false);
  });

  it("refuses everything when the secret isn't set", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronRequest("Bearer ")).toBe(false);
  });
});
