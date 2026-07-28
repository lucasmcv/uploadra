"use client";

import { useEffect, useRef } from "react";
import type { MinimalPlayer } from "@/lib/types";

interface YTPlayerInstance {
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        config: {
          videoId: string;
          playerVars?: Record<string, number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_PLAYING = 1;
const YT_PAUSED = 2;

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

/**
 * Embeds YouTube's official IFrame Player — never downloads/re-hosts the
 * video. There's no native 'timeupdate' event from this API, so we poll
 * getCurrentTime() while playing and call onTimeUpdate ourselves, close
 * enough (~250ms) for the pause-at-segment-boundary logic that consumes it.
 */
export function YouTubePlayer({
  videoId,
  onReady,
  onTimeUpdate,
  onPlay,
  onPause,
}: {
  videoId: string;
  onReady?: (player: MinimalPlayer) => void;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The setup effect below only runs once per videoId (see deps) — it must
  // never close over onReady/onTimeUpdate/onPlay/onPause directly, or it'll
  // keep calling whatever those props were on first mount forever, ignoring
  // every prop update after (e.g. toggling "sin pausas" or answers changing).
  // These refs are updated every render so the effect's closures always
  // read the latest version via .current.
  const onReadyRef = useRef(onReady);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);

  useEffect(() => {
    onReadyRef.current = onReady;
    onTimeUpdateRef.current = onTimeUpdate;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
  });

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayerInstance | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;

      player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            if (!player) return;
            const activePlayer = player;
            const minimalPlayer: MinimalPlayer = {
              get currentTime() {
                return activePlayer.getCurrentTime();
              },
              set currentTime(seconds: number) {
                activePlayer.seekTo(seconds, true);
              },
              get paused() {
                return activePlayer.getPlayerState() !== YT_PLAYING;
              },
              play: () => activePlayer.playVideo(),
              pause: () => activePlayer.pauseVideo(),
            };
            onReadyRef.current?.(minimalPlayer);
          },
          onStateChange: (event) => {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (event.data === YT_PLAYING) {
              onPlayRef.current?.();
              pollRef.current = setInterval(() => onTimeUpdateRef.current?.(), 250);
            } else if (event.data === YT_PAUSED) {
              onPauseRef.current?.();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      player?.destroy();
    };
  }, [videoId]);

  return <div ref={containerRef} className="w-full aspect-video rounded bg-black" />;
}
