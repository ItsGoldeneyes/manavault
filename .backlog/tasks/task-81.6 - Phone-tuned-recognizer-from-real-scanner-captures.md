---
id: TASK-81.6
title: Phone-tuned recognizer from real scanner captures
status: In Progress
assignee:
  - '@cfbender'
created_date: '2026-09-28 23:41'
updated_date: '2026-09-29 00:29'
labels: []
dependencies: []
parent_task_id: TASK-81
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Retrain the recognizer (and detector if needed) for phone scanning: a phone/stand scene profile in Oracle's synthetic data (card filling much of the frame, foil glare, sleeves) mixed with real ManaVault captures (train --real), then publish a scanner-bundle release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Oracle can render phone/stand-style synthetic scenes
- [ ] #2 A retrain on real ManaVault captures beats the current bundle on held-out phone captures, including foils
- [ ] #3 The improved bundle is published as a scanner-bundle release and installed by ManaVault servers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Phone scene profile for detector training in Oracle (done). 2. Per-app profiles so retrain uses phone scenes + ManaVault captures (done). 3. Owner collects ~200 real scans with Collect training data + Identify. 4. mise run manavault on the GPU box; publish when the held-out phone gate passes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Outline offset on phone photos is detector error, not the overlay (overlay matched exactly in browser tests; padded vs native frames both sub-pixel on synthetic portrait scenes, 0.5 vs 0.4 px). Real captures cannot train the detector (trusted_quad skips model-drawn quads), so Oracle got render_scene(profile='phone') (7c191fd, tests + visual sheet) and the ManaVault profile fine-tunes the detector on it (CARDID_SCENE_PROFILE=phone, CARDID_DETECTOR_EPOCHS=4).
<!-- SECTION:NOTES:END -->
