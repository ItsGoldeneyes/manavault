---
id: TASK-81.7
title: Trusted card outlines for detector training
status: In Progress
assignee:
  - '@cfbender'
created_date: '2026-09-29 01:19'
updated_date: '2026-09-29 02:04'
labels:
  - scanner
  - ml
dependencies: []
parent_task_id: TASK-81
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The detector's outline sits offset from the card on the phone stand, but real scans cannot train it: every uploaded capture carries the detector's own outline (Oracle imports them as quad_source=detector), and training on those would teach the detector its own error. Only outlines a person drew or confirmed are ground truth. Design agreed in Amp thread T-01a0e9cd-6b55-70b8-9cb3-42f4b8820b6c: an opt-in outline check in the ManaVault scanner, a shift+click corner drawing in The Gathering's webcam table, and Oracle importing the uploaded quad_source so retrain uses them for detector training and held-out detector evaluation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With Check outlines on, each auto-logged scan pauses on the frame with draggable corners; confirming or saving uploads the outline as manual, skipping keeps it as detector
- [x] #2 The ManaVault and The Gathering corrections endpoints accept and export quad_source (detector or manual) and reject other values
- [x] #3 In The Gathering, shift+click places four corners around a card, and the identified card uploads with that outline as manual
- [x] #4 Oracle's corrections pull keeps an uploaded manual quad_source, rejects implausible manual outlines, and regenerates card.png when an outline changes
- [x] #5 A retrain with trusted outlines passes --real to detector training and scores the detector on held-out trusted outlines
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Oracle: corrections.import keeps quad_source in {detector, manual}; plausibility check for manual quads; tests. 2. ManaVault server: quad_source field + tests. 3. ManaVault scanner: checkOutlines setting, outline editor with loupe, session pause/resume, upload via relabel path. 4. The Gathering: server field, shift+click corner drawing on the board, upload with manual source. 5. Docs (docs/scanner.md, Oracle README).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pushed 2026-09-29 (ManaVault 5755c6e, Oracle f81be04, The Gathering fa1de12):
- Oracle f81be04: corrections pull keeps quad_source detector|manual; plausible_outline() downgrades slivers/duplicate corners; changed outlines re-warp card.png. d54e3e8 made train_detector skip the real held-out eval when no outline is trusted.
- ManaVault feat commit: Check outlines setting (needs Collect training data); outline-editor.tsx (drag nearest corner, loupe, arrow keys; Looks right / Save outline / Skip) pauses the scan loop; resends the capture with quad_source manual via the relabel path; server validates quad_source (manual requires a quad). Verified on the portal with the fake camera: the dialog opens after an auto-logged scan, drag + loupe work, and the saved row has quad_source manual.
- The Gathering fa1de12: Shift+click plus three clicks draws an outline; the worker skips the detector, orders the corners portrait, tries both upright readings; the picker always opens; the upload carries quad_source manual. 8811f64 adds VITE_PORT so both review portals run in one orb. Verified on the portal: scrambled corners identified Bouncer's Beatdown (0.96), the row stored quad_source manual in printed order, and Oracle imported it as trusted with an upright card.png.
- Shift+click no longer means 'choose without outlining'; Wrong card? still reopens the picker.
<!-- SECTION:NOTES:END -->
