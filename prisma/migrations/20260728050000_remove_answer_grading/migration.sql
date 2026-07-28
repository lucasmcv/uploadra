-- Remove LLM-based answer grading: for video/audio the user self-checks
-- by hearing the segment play right after answering, and for text
-- documents the correct fragment is now shown directly instead of an
-- AI verdict — see app/api/segments/[id]/answer/route.ts and
-- app/api/document-fragments/[id]/answer/route.ts.
ALTER TABLE "answers" DROP COLUMN "isCorrect";
ALTER TABLE "answers" DROP COLUMN "feedback";
ALTER TABLE "doc_answers" DROP COLUMN "isCorrect";
ALTER TABLE "doc_answers" DROP COLUMN "feedback";
