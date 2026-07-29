// Shared retry helper for Gemini API calls. Gemini's rate/spend limits are
// shared across the whole platform (one Google Cloud project), not per
// user — so a burst of activity from other users (or from processing a
// long video's many segments) can 429 a request that has nothing to do
// with quota the calling user personally used. Gemini's own 429 response
// tells us exactly how long to wait ("retryDelay"), so retrying patiently
// turns that into "this takes a bit longer" instead of silently falling
// back to generic output. 503 ("model currently experiencing high
// demand") is retried the same way, just without a server-provided delay.

import { GoogleGenAI } from "@google/genai";

const MAX_RETRY_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_SECONDS = 30;

function isRetryableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('"code":429') ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes('"code":503') ||
    message.includes("UNAVAILABLE")
  );
}

// A 429 whose quotaId contains "PerDay" is the free tier's daily request
// cap — once that's exhausted, no amount of waiting within this request's
// lifetime brings it back (it only resets on Google's clock, hours away),
// so retrying is pure wasted time. Anything else 429 (a short per-minute
// burst) or 503 (transient "model busy") is worth waiting out.
function isDailyQuotaExhausted(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("PerDay");
}

function parseRetryDelaySeconds(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err);
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message);
  return match ? parseFloat(match[1]) : DEFAULT_RETRY_DELAY_SECONDS;
}

export async function generateContentWithRetry(
  client: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
): ReturnType<GoogleGenAI["models"]["generateContent"]> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await client.models.generateContent(params);
    } catch (err) {
      if (!isRetryableError(err) || isDailyQuotaExhausted(err) || attempt === MAX_RETRY_ATTEMPTS) throw err;
      const delaySeconds = parseRetryDelaySeconds(err);
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }
  throw new Error("unreachable");
}
