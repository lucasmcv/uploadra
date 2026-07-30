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
import { QUOTA_EXHAUSTED_MARKER } from "@/lib/gemini-quota-marker";

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
export function isDailyQuotaExhausted(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("PerDay");
}

// Gemini's daily request quota (RPD) resets at midnight Pacific time,
// regardless of caller location — computed via the current PT UTC offset
// (correctly handles the PST/PDT switch without hardcoding a fixed
// offset) rather than a hardcoded local-time string.
function nextMidnightPacific(now: Date): Date {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = dateFormatter.format(now).split("-").map(Number);

  const offsetFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  });
  const offsetPart = offsetFormatter.formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const offsetHours = parseInt(/GMT([+-]\d+)/.exec(offsetPart)?.[1] ?? "-8", 10);

  return new Date(Date.UTC(y, m - 1, d + 1, -offsetHours, 0, 0));
}

/** Human-readable, Argentina-time explanation of when the free-tier daily
 * quota resets, plus how to avoid hitting it again — surfaced anywhere a
 * fragment/segment ends up without a real generated question because of
 * this specific failure (see backfillMissingQuestions). */
export function quotaExhaustedMessage(now: Date = new Date()): string {
  const resetsAt = nextMidnightPacific(now);
  const time = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(resetsAt);
  const day = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
  }).format(resetsAt);
  return `${QUOTA_EXHAUSTED_MARKER} — se restauran automáticamente el ${day} a las ${time} hora Argentina. Si no querés esperar, podés usar tu propia clave de Gemini en Configuración (sin límite compartido) o consultarnos por un plan pago con más créditos.`;
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
