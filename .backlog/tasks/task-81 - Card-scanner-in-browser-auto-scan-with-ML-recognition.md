---
id: TASK-81
title: 'Card scanner: in-browser auto-scan with ML recognition'
status: In Progress
assignee:
  - '@cfbender'
created_date: '2026-09-28 20:18'
updated_date: '2026-09-28 21:59'
labels: []
dependencies: []
references:
  - 'https://github.com/cfbender/the-gathering/tree/main/ml'
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring the card scanner back (deleted in 6f75f86 after the OCR/hash approach proved too slow). Rebuild it on the-gathering's cardid ML stack (MobileNetV3 art embedder + CornerNet detector, ONNX in onnxruntime-web WASM) so it runs client-side in the PWA, website and Capacitor app, modeled on ManaBox's scanner UX. Design agreed in Amp thread T-01a0e99e-b77f-7058-a0c1-d4e30a529e71.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scanning runs automatically on a live camera feed in the PWA, website and Capacitor app
- [ ] #2 Identification from a stable card to a logged result takes under one second on a modern phone
- [x] #3 Scanned cards feed the existing collection import workflow
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Server, OTA updates, scanner page, settings and sounds are done and verified in the website with a fake camera (median 267 ms per identification in headless Chromium, single-thread WASM). Still unverified: a real phone (PWA and Capacitor builds; camera permissions were added to AndroidManifest and Info.plist) and the <1 s target on phone hardware.
<!-- SECTION:NOTES:END -->
