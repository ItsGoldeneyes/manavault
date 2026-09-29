---
id: TASK-81.5
title: Scanner training data collection
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-28 23:41'
updated_date: '2026-09-29 00:13'
labels: []
dependencies: []
parent_task_id: TASK-81
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Collect labelled real phone scans (foils, the owner's scanner stand) so the recognizer can be retrained on real data: the scanner uploads frames and labels to the ManaVault server, and Oracle imports them with its existing corrections pull.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An opt-in scanner setting uploads each logged scan's recognizer frame, quad, card and scores to the server
- [x] #2 Changing printing or finish, or choosing Wrong card?, relabels the capture; deleting a scan marks it skipped
- [x] #3 The server exports captures in Oracle's corrections format behind a bearer token
- [x] #4 Oracle's corrections pull imports ManaVault captures with their source
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scanner.Corrections store + POST/GET routes + ScannerExportAuth, reserve 'corrections' in bundle pruning. 2. collectTraining setting, frame JPEG capture, relabel/skip flows, Wrong card search. 3. Oracle corrections_endpoint + keep source + nightly SOURCES. 4. Docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified in Chromium with a fake camera: scans uploaded 640 px frames (~66 KB) into data/scanner/corrections with source manavault-scanner; a finish change relabelled nonfoil->foil, Wrong card? relabelled Cloudthresher->Lightning Bolt, a deletion wrote a skip row; GET /api/scanner/corrections exported the rows. ExUnit: corrections controller (store, relabel without image, skip, validation, token export) and bundle pruning keeps corrections. Oracle: corrections_endpoint + source tests; 128 Oracle tests pass.

Added Identify (manual labelling of frames the scanner missed; uploads frame + detector quad + recognizer guess) and Oracle's CARDID_SOURCES filter so ManaVault's model line trains/evaluates on manavault-scanner captures only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added opt-in scanner training capture: uploads, relabels, skips and Wrong card? in ManaVault, a token-protected export in Oracle's corrections format, and Oracle support for pulling ManaVault captures. Verified end to end in Chromium plus ExUnit, vitest and Oracle unit tests.
<!-- SECTION:FINAL_SUMMARY:END -->
