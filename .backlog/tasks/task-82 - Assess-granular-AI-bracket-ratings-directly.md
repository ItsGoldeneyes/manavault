---
id: TASK-82
title: Assess granular AI bracket ratings directly
status: In Progress
assignee:
  - '@cfbender'
created_date: '2026-09-30 05:06'
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
- [ ] #1 New analyses assess and persist an explicit bracket rating including optional minus or plus, independent of comparing the old numbers.
- [ ] #2 Deck badges, saved list analyses, and share previews display the rating; legacy analyses retain the agreed higher-bracket-minus fallback.
- [ ] #3 Official WotC guidance remains in the body and interaction guidance avoids treating ordinary symmetrical tradeoffs as inherent weaknesses.
- [ ] #4 Migrations, full tests, generated GraphQL types, and portal verification cover the changed contract.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add one nullable commander_bracket_rating field to decks and analysis history. Require an explicit bracket_rating in new AI responses, validate and render it, and propagate it through persistence and GraphQL. Use explicit ratings in all labels, with a legacy-only higher-bracket-minus fallback. Verify independent suffixes, migration compatibility, full checks, and desktop/narrow portal rendering; then ship under the existing authorization.
<!-- SECTION:PLAN:END -->
