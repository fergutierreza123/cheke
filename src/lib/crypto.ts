import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Encrypts secrets (each business's WhatsApp access token) before they're
// stored in the database, so a database leak alone doesn't expose them.
// AES-256-GCM with a key that lives only in the server's environment
// (CHANNEL_TOKEN_KEY — 32 random bytes, base64). Server-only.
//
// Stored format: v1:<iv>:<auth tag>:<ciphertext>, each part base64.

function getKey(): Buffer {
  const raw = process.env.CHANNEL_TOKEN_KEY;
  if (!raw) throw new Error("Falta CHANNEL_TOKEN_KEY en el servidor.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CHANNEL_TOKEN_KEY debe ser de 32 bytes en base64.");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de secreto no reconocido.");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
