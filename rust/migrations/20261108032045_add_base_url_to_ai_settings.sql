-- add_base_url_to_ai_settings
--
-- The /v1 base URL of an OpenAI-compatible server (LM Studio, Ollama, vLLM)
-- used by the `openai_compatible` provider. NULL for OpenRouter.

ALTER TABLE "ai_settings" ADD COLUMN "base_url" TEXT;
