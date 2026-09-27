---
id: TASK-80
title: Add AI chat for cuts and adds in Swap cards
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-27 02:17'
updated_date: '2026-09-27 02:33'
labels: []
dependencies: []
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Swap cards lets users stage cuts and adds, but deciding what to swap still means leaving the workbench for the one-off Ask AI dialog, whose recommendations cannot be staged directly. A light, session-scoped chat inside the workbench lets users ask follow-up questions about the staged swap and stage AI-suggested cuts and adds with one tap, while the existing legality preview checks the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Swap cards right column toggles between Bring in and Ask AI; mobile has an AI tab
- [x] #2 Each chat turn sends the deck, the staged cuts and adds, and recent prior turns of the same session thread
- [x] #3 Assistant replies show a short answer plus cut and add chips; tapping a chip stages it and Stage all stages every chip
- [x] #4 Suggested adds already on the Considering board stage as moves from Considering
- [x] #5 Starter prompts adapt to what is staged
- [x] #6 Chat turns are persisted with a thread id and hidden from the Ask AI history dialog
- [x] #7 Without a configured AI provider the chat shows a link to Settings
- [x] #8 Backend and frontend tests cover threaded prompts, history filtering, and chip staging
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration adds thread_id and swap_context to deck_question_answers; list_deck_question_answers excludes thread turns and list_deck_question_thread returns one thread oldest first.
2. AnswerDeckQuestion.enqueue accepts thread_id/swap_context opts; answering builds a turn with the last 6 completed thread turns; provider callback takes the turn; OpenRouter sends swap chat instructions, prior turns as user/assistant messages, and the staged swap in the latest prompt. Catalog checks and correction retry unchanged.
3. GraphQL: askDeckQuestion threadId/swapContext args, deckQuestionAnswers threadId filter.
4. Frontend: deck-swap-chat(-model/-documents), Bring in / Ask AI toggle in the add column, AI mobile tab; chips map to swap reducer actions.
5. Tests and browser verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: thread id is generated client-side per workbench session (not crypto.randomUUID, which needs a secure context); sends are blocked while a turn is pending so each turn sees complete history; chips for adds already in the mainboard or cuts not in the mainboard render disabled; DeckMarkdown gained an optional className for compact chat text; mobile footer shows a short Illegal label (fixes wrapping that also affected Swap cards).

Validation: mix test 726 passed, credo strict clean, compile warnings-as-errors, typecheck, lint, fmt check, test:react (node 213, vitest 133). Browser via portal with temporary fake AI settings: setup/empty state, starter prompt creates a threaded pending turn with swap_context, DB-completed answer rendered chips, chip taps staged a cut and a Considering add into the ledger, failed turn shows provider error, 390px AI tab. Fake settings and test turns removed afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a session-scoped AI chat to Swap cards: threaded deck questions carry the staged swap and recent turns, reuse the Ask AI validation pipeline, stay out of Ask AI history, and render recommended cuts/adds as one-tap staging chips. Verified with new ExUnit and frontend tests, full suites, and browser checks on desktop and narrow layouts.
<!-- SECTION:FINAL_SUMMARY:END -->
