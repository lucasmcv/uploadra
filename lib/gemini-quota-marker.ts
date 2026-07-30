// Split out from lib/gemini-retry.ts specifically so client components
// (e.g. VideoQAView) can detect the quota-exhausted fallback text without
// importing the whole retry module, which pulls in @google/genai (a
// server-only package that shouldn't end up in a browser bundle).

// Stable marker every quotaExhaustedMessage() starts with.
export const QUOTA_EXHAUSTED_MARKER = "Se agotaron los créditos gratuitos de Gemini por hoy";

/** True if `text` (e.g. a segment's fallback question) is the
 * quota-exhausted message — as opposed to a real generated question, or
 * the other, non-quota-related fallback text. */
export function isQuotaExhaustedText(text: string): boolean {
  return text.includes(QUOTA_EXHAUSTED_MARKER);
}
