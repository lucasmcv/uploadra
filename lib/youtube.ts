/**
 * Extracts the 11-char YouTube video ID from any common URL shape:
 * youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
 * youtube.com/embed/ID — with or without extra query params.
 * Returns null if the URL doesn't look like a YouTube video link.
 */
export function extractYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const isYouTubeHost = host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com";
  if (!isYouTubeHost) return null;

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return isValidVideoId(id) ? id : null;
  }

  const watchId = parsed.searchParams.get("v");
  if (watchId && isValidVideoId(watchId)) return watchId;

  const pathMatch = /^\/(shorts|embed|live)\/([^/]+)/.exec(parsed.pathname);
  if (pathMatch && isValidVideoId(pathMatch[2])) return pathMatch[2];

  return null;
}

function isValidVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}
