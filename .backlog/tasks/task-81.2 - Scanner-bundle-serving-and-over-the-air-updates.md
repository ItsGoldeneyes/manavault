---
id: TASK-81.2
title: Scanner bundle serving and over-the-air updates
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-28 20:18'
updated_date: '2026-09-28 21:59'
labels: []
dependencies: []
parent_task_id: TASK-81
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
New models must reach users without redeploying the server, like ManaBox checking for a newer model on startup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Phoenix serves the current bundle manifest and immutable versioned files from the data directory
- [x] #2 Phoenix periodically checks a configurable remote manifest and installs newer bundles after checksum verification, without restart
- [x] #3 The browser checks the manifest when the scanner starts and downloads a newer bundle, caching files per version
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bundle module (verify/install/activate/prune, gzip arts sidecar), controller + JSON, authenticated read-only routes.
2. BundleUpdateWorker on Oban cron (startup + 6h) with SCANNER_BUNDLE_SOURCE (github/direct manifest/off).
3. Browser: fetch /api/scanner/bundle on scanner start; Cache Storage per version with pruning; exclude printings.json.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Recovered from the OOM'd orb and finished: arts.json served gzipped (4.1 MB vs 17.7 MB) via a sidecar; manifest response includes decoded sizes for progress; printings.json never advertised. No published scanner release is now {:ok, :no_release} instead of a retried failure. PWA service worker only prunes manavault-pwa-* caches so scanner caches survive app updates. Browser cache verified in Chromium: caches.keys() -> manavault-scanner-retrain-20260925T043526910942Z holding the wasm runtime, 3 ONNX graphs and arts.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Phoenix serves the current scanner bundle and immutable versioned files, checks GitHub releases (or a manifest URL) at startup and every 6 h and installs verified bundles without restart; the browser checks the manifest on scanner start and caches files per version in Cache Storage. Verified with scanner bundle/controller/worker ExUnit tests, bundle-cache node tests, and a Chromium run inspecting Cache Storage.
<!-- SECTION:FINAL_SUMMARY:END -->
