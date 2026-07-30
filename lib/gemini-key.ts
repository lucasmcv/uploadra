// Resolves which Gemini API key an AI call should run against: the calling
// user's own key if they've set one (see app/api/settings/gemini-key), or
// the platform's shared key otherwise. Lets a user opt out of the shared
// daily quota entirely by bringing their own — see lib/crypto.ts for how
// the stored key is encrypted at rest.

import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function getGeminiApiKeyForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiApiKeyEncrypted: true },
  });

  if (user?.geminiApiKeyEncrypted) {
    try {
      return decrypt(user.geminiApiKeyEncrypted);
    } catch (err) {
      console.error("[gemini-key] No se pudo desencriptar la clave del usuario, usando la de la plataforma:", err);
    }
  }

  return process.env.GEMINI_API_KEY ?? null;
}
