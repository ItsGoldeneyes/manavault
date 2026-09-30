---
id: TASK-82
title: Assess granular AI bracket ratings directly
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-30 05:06'
updated_date: '2026-09-30 05:13'
labels: []
dependencies: []
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user wants lower, typical, and upper placement within Commander brackets, not a badge comparing official WotC bracket and pace. Official details remain in the analysis body. Earlier suffix mappings were rejected; legacy 2/pace 3 and 4/pace 3 should display 3- and 4- respectively.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New analyses assess and persist an explicit bracket rating including optional minus or plus, independent of comparing the old numbers.
- [x] #2 Deck badges, saved list analyses, and share previews display the rating; legacy analyses retain the agreed higher-bracket-minus fallback.
- [x] #3 Official WotC guidance remains in the body and interaction guidance avoids treating ordinary symmetrical tradeoffs as inherent weaknesses.
- [x] #4 Migrations, full tests, generated GraphQL types, and portal verification cover the changed contract.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add one nullable commander_bracket_rating field to decks and analysis history. Require an explicit bracket_rating in new AI responses, validate and render it, and propagate it through persistence and GraphQL. Use explicit ratings in all labels, with a legacy-only higher-bracket-minus fallback. Verify independent suffixes, migration compatibility, full checks, and desktop/narrow portal rendering; then ship under the existing authorization.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added independently assessed Commander ratings (lower/typical/upper placement), nullable storage for decks and analysis history, GraphQL propagation, and shared label rendering. Legacy records use the higher saved bracket with minus when values differ. Official WotC details and pace remain in the body; interaction prompt evaluates net multiplayer value. Verified migration on local dev data; 762 ExUnit, 250 Node, and 151 React tests pass, plus Credo, formatter, lint, typecheck, and production build. Portal verified gallery, saved history, and expanded narrow layout using labeled fixtures with identical official/play values and distinct ratings. No live provider call. Existing warnings-as-errors template deprecation and Mint audit advisories were reproduced on untouched origin/main before exclusion.
<!-- SECTION:FINAL_SUMMARY:END -->
