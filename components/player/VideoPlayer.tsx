"use client";

import { forwardRef } from "react";

interface VideoPlayerProps {
  src: string;
  controls?: boolean;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(function VideoPlayer(
  { src, controls = false, onTimeUpdate, onPlay, onPause },
  ref
) {
  return (
    <video
      ref={ref}
      src={src}
      controls={controls}
      onTimeUpdate={onTimeUpdate}
      onPlay={onPlay}
      onPause={onPause}
      className="w-full rounded bg-black"
    />
  );
});
