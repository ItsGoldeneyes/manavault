---
id: TASK-81.3
title: 'Scanner page: auto-scan, result bar and scanned list'
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-28 20:18'
updated_date: '2026-09-28 21:59'
labels: []
dependencies: []
parent_task_id: TASK-81
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The camera page is the core of the ManaBox-style workflow: point the camera at cards and have them logged hands-free.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Cards are identified continuously without tapping and outlined when detected
- [x] #2 The same printing is not logged twice in a row unless the user taps to add another
- [x] #3 Quick chips change finish (foil/etched), printing, language and add +1 for the last card
- [x] #4 The scanned list survives reloads and supports search, edit, delete and clear
- [x] #5 Add to opens the collection import dialog prefilled with the scanned cards
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Worker + recognizer core ported from the-gathering, centre-of-frame instead of click.
2. Pure scan-decision (presence, clear match, agreement, no consecutive duplicate) and default-printing modules with tests.
3. Camera page: viewfinder with guide and detected-card outline, result bar, chips, printing sheet, list sheet with search/edit/delete/clear, Add to collection via queueSharedImport.
4. /scan route, Phoenix route, Vite proxy, nav item, CSP wasm-unsafe-eval, native camera permissions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dedupe is per card (both faces of a DFC count as one) rather than per printing, so a printing change cannot sneak in a double log. Thresholds calibrated on 60 synthetic phone frames + negatives (upright vote separates cards >=0.65 from empty/paper <=0.17). Scanner opens straight into the camera (splash removed at the owner's request); camera errors get a retry panel. Fixed a pre-existing Vite dev proxy bug: URLs with a query string (e.g. /collection?importFile=false) 404'd because the proxy regex is matched against the full URL. Verified end to end in Chromium with a fake camera fed by real card images: auto-logging, duplicate suppression, +1, printing/finish/language chips, locked set, list edit/search/clear, and Add to collection -> import preview with 18/18 exact rows.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built the /scan camera page: continuous in-browser recognition with an outlined card, no back-to-back duplicate logs unless +1/tap, chips for finish, printing and language, a persistent list with search/edit/delete/clear, and Add to collection feeding the existing import preview. Verified with node/vitest unit and component tests and a Chromium fake-camera end-to-end run.
<!-- SECTION:FINAL_SUMMARY:END -->
