import { useCallback, useState, type RefObject } from "react";

export interface TimedSegment {
  startTime: number;
  endTime: number;
}

export function useSegmentSync<T extends TimedSegment>(
  segments: T[],
  videoRef: RefObject<HTMLVideoElement | null>
) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const time = video.currentTime;
    const index = segments.findIndex((s) => time >= s.startTime && time < s.endTime);
    setActiveIndex(index === -1 ? null : index);
  }, [segments, videoRef]);

  return { activeIndex, handleTimeUpdate };
}
