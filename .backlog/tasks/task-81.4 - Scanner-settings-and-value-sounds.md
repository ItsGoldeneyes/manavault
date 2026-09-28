---
id: TASK-81.4
title: Scanner settings and value sounds
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-28 20:18'
updated_date: '2026-09-28 21:59'
labels: []
dependencies: []
parent_task_id: TASK-81
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scanner behaviour needs per-user tuning, and value sounds help spot good pulls while scanning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings: lock to one or more sets, ignore promos, prefer foil, play sounds, display total value
- [x] #2 A ding plays at or above a configurable threshold (default $1) and a bigger ding at a second threshold (default $10)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ScanSettings in localStorage with normalization (locked sets, ignore promos, prefer foil, sounds, thresholds, total).
2. Settings sheet reusing SetCombobox.
3. WebAudio synthesized click/ding/big ding; unlock on first tap.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sound choice verified in Chromium by wrapping AudioContext.createOscillator: with thresholds $0.10/$0.30 a $0.17 scan played the ding partials (1568/2349 Hz) and a $0.38 scan the big ding (1047-3136 Hz); defaults ($1/$10) played the click. Locked set lrw applied to new Cloudthresher scans.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added scanner settings (multiple locked sets, ignore promos, prefer foil, sounds with configurable ding/big-ding thresholds defaulting to $1/$10, total value) and synthesized WebAudio sounds. Verified with node tests for settings/sound selection and Chromium runs checking the set lock and emitted tones.
<!-- SECTION:FINAL_SUMMARY:END -->
