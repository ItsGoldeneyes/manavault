---
id: TASK-81.7
title: Trusted card outlines for detector training
status: In Progress
assignee:
  - '@cfbender'
created_date: '2026-09-29 01:19'
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
- [ ] #1 With Check outlines on, each auto-logged scan pauses on the frame with draggable corners; confirming or saving uploads the outline as manual, skipping keeps it as detector
- [ ] #2 The ManaVault and The Gathering corrections endpoints accept and export quad_source (detector or manual) and reject other values
- [ ] #3 In The Gathering, shift+click places four corners around a card, and the identified card uploads with that outline as manual
- [ ] #4 Oracle's corrections pull keeps an uploaded manual quad_source, rejects implausible manual outlines, and regenerates card.png when an outline changes
- [ ] #5 A retrain with trusted outlines passes --real to detector training and scores the detector on held-out trusted outlines
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Oracle: corrections.import keeps quad_source in {detector, manual}; plausibility check for manual quads; tests. 2. ManaVault server: quad_source field + tests. 3. ManaVault scanner: checkOutlines setting, outline editor with loupe, session pause/resume, upload via relabel path. 4. The Gathering: server field, shift+click corner drawing on the board, upload with manual source. 5. Docs (docs/scanner.md, Oracle README).
<!-- SECTION:PLAN:END -->
