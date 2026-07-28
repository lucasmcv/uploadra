-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "isCorrect" BOOLEAN;

-- AlterTable
ALTER TABLE "doc_answers" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "isCorrect" BOOLEAN;
