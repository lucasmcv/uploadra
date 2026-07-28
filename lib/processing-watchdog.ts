// If the worker crashes (e.g. OOM-killed) mid-job, it never calls back and
// the row is orphaned in an in-progress status forever with no error. This
// gives polling routes a way to notice and surface a real "failed" state
// instead of leaving the UI stuck on a spinner indefinitely.

const STALE_MINUTES: Record<string, number> = {
  uploading: 5,
  transcribing: 20,
  processing: 10,
};

const STALE_MESSAGE =
  "El proceso se interrumpió inesperadamente (probablemente el worker se quedó sin memoria). Volvé a intentarlo.";

export function getStaleFailureMessage(status: string, updatedAt: Date): string | null {
  const thresholdMinutes = STALE_MINUTES[status];
  if (!thresholdMinutes) return null;
  const ageMs = Date.now() - updatedAt.getTime();
  if (ageMs <= thresholdMinutes * 60_000) return null;
  return STALE_MESSAGE;
}
