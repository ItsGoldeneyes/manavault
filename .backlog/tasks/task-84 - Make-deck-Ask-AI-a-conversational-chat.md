---
id: TASK-84
title: Make deck Ask AI a conversational chat
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-09-30 20:32'
updated_date: '2026-09-30 20:44'
labels: []
dependencies: []
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ask AI should support follow-up questions with the same chat interaction as Swap cards instead of a separate form and collapsed answers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ask AI uses the swap chat transcript and composer pattern, preserving saved answers and recommendation actions.
- [x] #2 Follow-up requests include recent completed deck answers and exclude swap chats and other decks.
- [x] #3 Automated checks and desktop/narrow browser verification pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Share the existing chat presentation between Swap cards and Ask AI; retain persisted deck question history in chronological order. Include the last six completed deck answers in provider context. Test send guards, follow-ups, history isolation, and existing recommendation actions; verify the supervised review portal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified mix test: 769 passed; aube run test:react: 250 node tests and 159 Vitest tests passed; typecheck, lint, formatting, and diff checks passed. Final targeted chat tests: 11 passed. Browser exercised portal empty state, provider configuration failure with draft preserved, persisted conversation, pending send guard, polling completion, and desktop/390px layouts. At 390px dialog height=844, log bottom=composer top=740, no page overflow; horizontal prompt scrolling verified. Sample replies are labeled Review fixture because no live AI provider is configured. Review service left active. Changes remain uncommitted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ask AI now shares the Swap cards chat presentation, retains saved answers and recommendation actions, and includes the last six completed deck answers in follow-ups while excluding swap threads and other decks. Verified full backend/frontend suites, static checks, and inspected desktop/narrow portal screenshots.
<!-- SECTION:FINAL_SUMMARY:END -->
