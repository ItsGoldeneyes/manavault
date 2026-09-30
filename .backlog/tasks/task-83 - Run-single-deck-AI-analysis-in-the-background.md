---
id: TASK-83
title: Run single-deck AI analysis in the background
status: Done
assignee:
  - '@cfbender-pdq'
created_date: '2026-09-30 19:41'
updated_date: '2026-09-30 19:59'
labels: []
dependencies: []
type: bug
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A single-deck analysis saved successfully after a 137-second HTTP request while the app showed an error toast. Decouple the request from generation so proxy timeouts do not misreport completed work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Single-deck analysis queues durable work and returns without calling the AI provider in the HTTP request.
- [x] #2 The app shows pending progress across reloads, updates saved analysis on completion, and reports terminal job failures without claiming network errors are AI failures.
- [x] #3 Repeated requests reuse active work; refresh-all remains compatible; existing analysis remains visible while refreshing.
- [x] #4 Backend and frontend tests cover transitions and failures, and the changed interface is exercised through the supervised review portal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reuse DeckAnalysisWorker, add enqueue and latest-job status reads, and expose an authenticated top-level GraphQL job query with a nested deck result. Poll while pending and keep progress inline so navigation does not leave a stuck toast. Cover deduplication, retries, terminal states, reloads, completion and connection failures; verify through the portal.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Single saved-deck analysis now queues durable Oban work, with reload-safe progress, automatic result refresh, preserved previous analysis, retryable terminal failure, and separate connection-error handling. Bulk and individual refreshes deduplicate active jobs. Verified with 768 ExUnit tests, 250 Node tests, 157 React tests, format/lint/type/build checks, and portal checks for reload, disabled duplicate action, completion, connection recovery, and real worker failure/retry. Portal used a labeled temporary provider fixture; no paid AI calls. Implementation is local, uncommitted and unpushed.
<!-- SECTION:FINAL_SUMMARY:END -->
