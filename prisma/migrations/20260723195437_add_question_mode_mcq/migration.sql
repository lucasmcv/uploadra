-- AlterTable
ALTER TABLE "answers" ADD COLUMN "selectedOptionIndex" INTEGER;

-- AlterTable
ALTER TABLE "segments" ADD COLUMN "correctOptionIndex" INTEGER;
ALTER TABLE "segments" ADD COLUMN "options" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_videos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationSeconds" REAL,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "errorMessage" TEXT,
    "whisperModel" TEXT,
    "questionMode" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "videos_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_videos" ("createdAt", "durationSeconds", "errorMessage", "id", "mimeType", "originalFilename", "ownerId", "status", "storageKey", "title", "updatedAt", "whisperModel") SELECT "createdAt", "durationSeconds", "errorMessage", "id", "mimeType", "originalFilename", "ownerId", "status", "storageKey", "title", "updatedAt", "whisperModel" FROM "videos";
DROP TABLE "videos";
ALTER TABLE "new_videos" RENAME TO "videos";
CREATE INDEX "videos_ownerId_idx" ON "videos"("ownerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
