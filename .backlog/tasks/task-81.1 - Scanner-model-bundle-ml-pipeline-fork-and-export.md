---
id: TASK-81.1
title: 'Scanner model bundle: ml pipeline fork and export'
status: In Progress
assignee: []
created_date: '2026-09-28 20:18'
updated_date: '2026-09-28 22:05'
labels: []
dependencies: []
parent_task_id: TASK-81
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
manavault needs its own recognition bundle, separate from the-gathering's, so it can be tuned for close-up phone scans. Start from the-gathering's committed recogniser/detector weights.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ml/ in manavault can build a gallery and export a bundle (manifest, arts, detector, embed, search ONNX graphs)
- [x] #2 An initial bundle exported from the-gathering's production weights is published as a GitHub release asset
- [ ] #3 ml/README documents gallery refresh, export and publish
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ml/ forked from the-gathering with starting weights. Initial bundle retrain-20260925T043526910942Z is uploaded to a DRAFT GitHub release (not published; publishing needs the owner's approval, and the updater ignores drafts). Export/gallery build not re-run in this orb (no GPU/gallery); phone fine-tuning runs on the owner's machine via thread T-01a0e9b2-236a-768b-9223-753b7c7ff188.

Published release scanner-bundle-retrain-20260925T043526910942Z (not marked latest, so the Android app update check still sees v1.3.0). Verified BundleUpdateWorker.check_for_update() against the public release: {:ok, :installed} in 5 s into a fresh bundle dir, then {:ok, :current}.
<!-- SECTION:NOTES:END -->
