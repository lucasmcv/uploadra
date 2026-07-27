"use client";

import { useRef } from "react";
import { VideoPlayer } from "./VideoPlayer";
import { SegmentOverlay } from "./SegmentOverlay";
import { useSegmentSync } from "@/hooks/useSegmentSync";

export interface ReviewSegment {
  id: string;
  orderIndex: number;
  startTime: number;
  endTime: number;
  transcriptText: string;
  question: string | null;
  options: string[] | null;
  correctOptionIndex: number | null;
  answer: { answerText: string | null; selectedOptionIndex: number | null; skipped: boolean } | null;
}

export function ReviewPlayer({
  videoSrc,
  segments,
}: {
  videoSrc: string;
  segments: ReviewSegment[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { activeIndex, handleTimeUpdate } = useSegmentSync(segments, videoRef);

  const activeSegment = activeIndex !== null ? segments[activeIndex] : null;

  return (
    <div className="relative max-w-2xl">
      <VideoPlayer ref={videoRef} src={videoSrc} controls onTimeUpdate={handleTimeUpdate} />
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
