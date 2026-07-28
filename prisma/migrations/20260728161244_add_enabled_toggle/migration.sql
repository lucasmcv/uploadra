-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;
