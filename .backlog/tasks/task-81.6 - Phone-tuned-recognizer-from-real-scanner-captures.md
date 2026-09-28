---
id: TASK-81.6
title: Phone-tuned recognizer from real scanner captures
status: To Do
assignee: []
created_date: '2026-09-28 23:41'
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
- [ ] #1 Oracle can render phone/stand-style synthetic scenes
- [ ] #2 A retrain on real ManaVault captures beats the current bundle on held-out phone captures, including foils
- [ ] #3 The improved bundle is published as a scanner-bundle release and installed by ManaVault servers
<!-- AC:END -->
