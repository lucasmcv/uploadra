-- Per-user Gemini API key (BYOK) — lets a user's AI-powered features run
-- against their own key/quota instead of the platform's shared one.
ALTER TABLE "users" ADD COLUMN "geminiApiKeyEncrypted" TEXT;
