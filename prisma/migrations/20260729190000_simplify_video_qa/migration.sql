-- Simplify the video flow: no more dictation practice/answer-checking for
-- video/audio (that stays only for text documents). A pasted transcript
-- (from YouTube's panel, TurboScribe, etc.) is split into segments, each
-- with a generated question that links straight to its timestamp instead
-- of collecting a typed answer. Also drops the now-unused Whisper-worker
-- fields (originalFilename, durationSeconds, whisperModel) now that
-- transcription is never run server-side.
DROP TABLE "answers";

ALTER TABLE "videos" DROP COLUMN "originalFilename";
ALTER TABLE "videos" DROP COLUMN "durationSeconds";
ALTER TABLE "videos" DROP COLUMN "whisperModel";
ALTER TABLE "videos" DROP COLUMN "questionMode";
ALTER TABLE "videos" ALTER COLUMN "sourceType" SET DEFAULT 'youtube';
ALTER TABLE "videos" ALTER COLUMN "status" SET DEFAULT 'ready';

ALTER TABLE "segments" DROP COLUMN "options";
ALTER TABLE "segments" DROP COLUMN "correctOptionIndex";
