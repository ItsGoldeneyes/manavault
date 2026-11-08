---
id: TASK-100
title: Support OpenAI-compatible local model servers for AI analysis
status: In Progress
assignee: []
created_date: '2026-11-08T03:20:00Z'
updated_date: '2026-11-08T03:49:00Z'
labels:
  - ai
  - backend
  - frontend
dependencies: []
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deck analysis and deck questions only work through OpenRouter, so the owner cannot use local or self-hosted models (LM Studio and LM Studio Bionic's Local Model API, Ollama, vLLM). Those servers expose an OpenAI-compatible /v1 API.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI settings offer an 'OpenAI-compatible' provider with a base URL, an optional API key, and a model ID
- [x] #2 Saving validates the base URL and that the model is listed by the server's /models endpoint
- [x] #3 Deck analysis and deck questions run against the configured base URL with tool calling
- [x] #4 Switching provider without a new key does not send the saved OpenRouter key to the local server
- [x] #5 AI card tags (OpenRouter Decisions) are skipped for the local provider without errors
- [x] #6 OpenRouter behaviour is unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration adds ai_settings.base_url; settings accept provider openai_compatible with a base URL, optional key, and model.

2. Validate on save with GET base_url/models; skip OpenRouter-only checks for key, decision model, and reasoning effort.

3. Reuse the OpenRouter completion loop through an Endpoint that targets base_url/chat/completions and drops OpenRouter extensions.

4. Settings UI: provider option, base URL, optional key; hide OpenRouter-only fields; expose AiSettings.configured.

5. Tests for settings, completions, errors, and the form; docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Backend: manavault-core settings/ai.rs adds the OPENAI_COMPATIBLE provider, base_url, openai_compatible::validate_settings, labeled_response_error, and GraphQL baseUrl and configured. manavault-ai openrouter.rs adds an Endpoint: base URL, bearer only when a key is set, no session_id, plugins, reasoning, cache_control or OpenRouter headers, a 20 minute timeout, and provider-labelled errors; a leading think block is stripped before JSON decoding. Dispatch is in mod.rs, analyze_deck.rs and answer_deck_question.rs. Migration 20261108032045_add_base_url_to_ai_settings. schema.sql and .sqlx were updated by hand for the two changed ai_settings queries. db tests' migration counts bumped to 87 and 53.

Behaviour: switching provider without a new key clears the saved key; reasoning effort is rejected for openai_compatible; AI tags from OpenRouter Decisions are skipped; aiModelReasoning returns null for non-OpenRouter providers. Frontend: ai-settings-section.tsx and settings/data.ts; deck-swap-chat uses aiSettings.configured; gql types regenerated.

Verified locally on Windows: cargo test for manavault-core, 94 tests, and manavault-ai, 71 tests; clippy -D warnings and fmt on both crates; frontend lint and typecheck; React AI settings and swap chat tests. Not run locally: the full mise run precommit, because manavault-system and manavault-server use unix-only APIs and do not build on Windows. CI should confirm, including the hand-edited schema.sql and .sqlx files. One React test, the deck-detail-overlays date check, fails locally independently of this change.

Remaining: an end-to-end check against a real OpenAI-compatible server - save settings, analyze a deck, and ask a question that triggers tool calls - then finalize the task.
<!-- SECTION:NOTES:END -->
