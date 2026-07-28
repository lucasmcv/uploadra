"use client";

import { useRef, useState } from "react";
import { VideoPlayer } from "./VideoPlayer";
import { YouTubePlayer } from "./YouTubePlayer";
import { PracticeOverlay } from "./PracticeOverlay";
import { SegmentProgressList } from "./SegmentProgressList";
import { usePracticePlayback, type AnswerState, type PracticeSegment } from "@/hooks/usePracticePlayback";
import type { MinimalPlayer } from "@/lib/types";

export function PracticePlayer({
  videoSrc,
  youtubeVideoId,
  segments,
  initialAnswers,
}: {
  videoSrc?: string;
  youtubeVideoId?: string;
  segments: PracticeSegment[];
  initialAnswers: Record<string, AnswerState>;
}) {
  const videoRef = useRef<MinimalPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const {
    answers,
    activeIndex,
    handleTimeUpdate,
    jumpToSegment,
    submitOpenAnswer,
    editAnswer,
    selectOption,
    skipSegment,
    isFinished,
  } = usePracticePlayback(segments, initialAnswers, videoRef);

  const activeSegment = activeIndex !== null ? segments[activeIndex] : null;

  function togglePlay() {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) player.play();
    else player.pause();
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-1">
        <div className="relative">
          {youtubeVideoId ? (
            <YouTubePlayer
              videoId={youtubeVideoId}
              onReady={(player) => {
                videoRef.current = player;
              }}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          ) : (
            <VideoPlayer
              ref={(el) => {
                videoRef.current = el;
              }}
              src={videoSrc!}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          )}
          {activeSegment && (
            <PracticeOverlay
              key={activeSegment.id}
              position="bottom"
              segment={activeSegment}
              answer={answers[activeSegment.id]}
              onSubmitOpen={(text) => submitOpenAnswer(activeSegment.id, text)}
              onSelectOption={(index) => selectOption(activeSegment.id, index)}
              onSkip={() => skipSegment(activeSegment.id)}
              onEditAnswer={(text) => editAnswer(activeSegment.id, text)}
            />
          )}
        </div>
        <button
          type="button"
          onClick={togglePlay}
          className="mt-3 bg-black text-white rounded px-4 py-2"
        >
          {isPlaying ? "Pausar" : "Reproducir"}
        </button>
        {isFinished && (
          <p className="mt-4 text-green-700 font-medium">
            Terminaste todos los segmentos. Podés repasar tus respuestas.
          </p>
        )}
      </div>
      <div className="w-full md:w-64">
        <h2 className="text-sm font-semibold mb-2">Segmentos</h2>
        <SegmentProgressList segments={segments} answers={answers} onJump={jumpToSegment} />
      </div>
    </div>
  );
}
