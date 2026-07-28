-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'upload',
ADD COLUMN     "youtubeVideoId" TEXT,
ALTER COLUMN "originalFilename" DROP NOT NULL,
ALTER COLUMN "storageKey" DROP NOT NULL,
ALTER COLUMN "mimeType" DROP NOT NULL;
