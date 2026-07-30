// Small AES-256-GCM helper for encrypting secrets we must store at rest
// (currently: per-user Gemini API keys — see lib/gemini-key.ts). Not a
// general-purpose crypto module; keep it scoped to this one need.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY no está configurada.");
  // Hashed rather than used raw so ENCRYPTION_KEY can be any string length
  // (matches the ${VAR:?...} pattern used for other secrets in this repo)
  // while AES-256 always gets exactly the 32 bytes it requires.
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
