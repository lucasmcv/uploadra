"use client";

import { useRef } from "react";
import { VideoPlayer } from "./VideoPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import { SegmentOverlay } from "./SegmentOverlay";
import { useSegmentSync } from "@/hooks/useSegmentSync";
import type { MinimalPlayer } from "@/lib/types";

export interface ReviewSegment {
  id: string;
  orderIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
  answer: {
    answerText: string | null;
    selectedOptionIndex: number | null;
    skipped: boolean;
  } | null;
}

export function ReviewPlayer({
  videoSrc,
  youtubeVideoId,
  segments,
}: {
  videoSrc?: string;
  youtubeVideoId?: string;
  segments: ReviewSegment[];
}) {
  const videoRef = useRef<MinimalPlayer | null>(null);
  const { activeIndex, handleTimeUpdate } = useSegmentSync(segments, videoRef);

  const activeSegment = activeIndex !== null ? segments[activeIndex] : null;

  return (
    <div className="relative max-w-2xl">
      {youtubeVideoId ? (
        <YouTubePlayer
          videoId={youtubeVideoId}
          onReady={(player) => {
            videoRef.current = player;
          }}
          onTimeUpdate={handleTimeUpdate}
        />
      ) : (
        <VideoPlayer
          ref={(el) => {
            videoRef.current = el;
          }}
          src={videoSrc!}
          controls
          onTimeUpdate={handleTimeUpdate}
        />
      )}
      {activeSegment && (
        <SegmentOverlay
          position="bottom"
          question={activeSegment.question}
          transcriptText={activeSegment.transcriptText}
          options={activeSegment.options}
          correctOptionIndex={activeSegment.correctOptionIndex}
          answerText={activeSegment.answer?.answerText ?? null}
          selectedOptionIndex={activeSegment.answer?.selectedOptionIndex ?? null}
          skipped={activeSegment.answer?.skipped ?? false}
        />
      )}
    </div>
  );
}
