---
id: TASK-85
title: Start fresh deck AI chats while retaining previous conversations
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-09-30 21:12'
updated_date: '2026-09-30 21:20'
labels: []
dependencies: []
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users need to reset AI context without deleting saved answers, and reopen prior chats. Each new message must continue using the current decklist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New chat clears the active transcript and context without deleting previous conversations; saved chats can be reopened.
- [x] #2 Backend history is isolated by deck and conversation, including legacy saved answers, while each message uses current deck data.
- [x] #3 Tests, local migration, and desktop/narrow portal verification pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add a nullable conversation ID to saved deck answers while preserving existing swap thread behavior. Group saved answers into a chat selector and start a fresh ID on New chat. Verify context isolation, unchanged saved replies after deck edits, resume behavior, and browser states.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added nullable conversation_id; legacy nil IDs remain the original chat. New chat assigns a fresh ID without deleting answers; saved chat selector resumes older chats. Backend history query filters deck/conversation/swap thread, completed status and prior IDs before limiting to six turns. Migration applied to local orb DB. Tests prove queued follow-up sees deck name and land-count edits made before processing; archived replies remain unchanged. Full mix test: 770 passed. test:react: 250 Node tests and 161 Vitest tests passed. Typecheck, lint, formatting and git diff checks pass. Portal browser verified empty New chat, latest-chat reopen, restoring legacy conversation, correct outgoing conversation ID, desktop and 390px selector/composer. Sample replies labeled Review fixture; no live provider configured. Portal left active; changes remain local and uncommitted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added non-destructive New chat and Saved chats controls with isolated AI context and preserved legacy history. Verified current-decklist behavior, migration, full test suites, static checks, and inspected desktop/narrow screenshots.
<!-- SECTION:FINAL_SUMMARY:END -->
