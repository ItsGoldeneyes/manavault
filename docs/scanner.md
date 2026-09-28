# Card scanner

The scanner (`/scan`) identifies cards entirely in the browser. Phoenix serves the model bundle
and resolves recognized artwork to catalog printings; it runs no inference. User-facing behavior is
in [features.md](features.md#card-scanner).

## Models and releases

Models are trained and exported in [cfbender/oracle](https://github.com/cfbender/oracle), which
also serves The Gathering. A ManaVault model is a GitHub release in this repository tagged
`scanner-bundle-<version>`, published but never marked latest (the Android shell treats the
latest release as the newest app version). When a new set is released, rebuild the gallery on the
training box and publish; no retraining is needed:

```sh
cd oracle
mise run update-gallery
mise run export -- --checkpoint models/recogniser.pt --detector models/detector.pt
mise run publish -- data/bundles/<version> --to github:cfbender/manavault
```

Servers install the newest published release within six hours (or on restart); browsers switch
the next time the scanner opens. To roll back, unpublish or delete the newest release.

## Bundles (server)

ManaVault serves browser card-recognition models from `DATA_DIR/scanner`. Each version is a
directory containing `manifest.json`, `arts.json`, the three ONNX models, `SHA256SUMS`, and
optionally `printings.json`. `current` and `previous` are relative symlinks to version directories.
The server creates `arts.json.gz` during installation (or lazily for an older bundle) and serves it
when the client accepts gzip; the compressed filename is not a directly fetchable bundle file.

`GET /api/scanner/bundle` describes the current version: versioned file URLs, decoded byte sizes,
gallery metadata and the pipeline constants (`Cache-Control: private, no-cache`). Files are served
from `GET /api/scanner/bundles/:version/:name` as immutable. Both require the signed-in session.
`printings.json` (about 125 MB) is verified during installation but never sent to browsers.

Scanner matches resolve through `scannerPrintings(scryfallId: ID!, illustrationId: ID)`. The server
removes a numeric face suffix that follows a complete UUID (`<uuid>-1`), falls back to the
illustration ID when needed, and returns the catalog printings for the matched card with
same-illustration printings first, including `ownedCount`, `promo` and
`priceCents(finish:)` (the selected price source with finish fallback). The Scryfall import stores
`illustration_id` and `promo` on `scryfall_printings`; a catalog resync fills them for existing
data.

`SCANNER_BUNDLE_SOURCE` controls automatic updates. The default, `github`, selects the newest
published `scanner-bundle-*` release from `cfbender/manavault`; draft releases are ignored and no
published release is not an error. Set it to an HTTP(S) URL ending in `manifest.json` to use a
plain bundle directory, or to `off`, `disabled`, or an empty value to disable updates. The server
checks at startup and every six hours, verifies manifest sizes and SHA-256 hashes, and atomically
switches `current`.

For a manual installation, copy a complete bundle directory to `DATA_DIR/scanner/<version>` and
atomically point the relative `current` symlink at `<version>`, or call
`Manavault.Scanner.Bundle.install(manifest, directory)` from a remote console, which verifies and
activates it. Version names may contain letters, digits, dots, underscores, and hyphens, and may
not be `current` or `previous`.

## Browser pipeline

Code lives in `assets/react/src/pages/scan/`.

- `recognition/use-recognizer.ts` fetches `/api/scanner/bundle` each time the scanner opens, so a
  new model is picked up without a redeploy, and starts `recognition/recognizer.worker.ts`.
- The worker loads files through `recognition/bundle-cache.ts`: Cache Storage named
  `manavault-scanner-<version>`, one download per version, older versions deleted. The
  onnxruntime-web WASM binary is cached alongside. The PWA service worker only prunes its own
  `manavault-pwa-*` caches.
- Inference is onnxruntime-web 1.30 on single-threaded WASM, which needs no cross-origin isolation
  and so works in the website, PWA and Capacitor WebViews. The CSP allows `'wasm-unsafe-eval'`.
- Each frame is the centre square of the visible video (92% of its short side), resampled to
  640 px. `recognition/recognizer.ts` runs the detector twice (coarse, then refined around the
  card), embeds the card's art-frame crops and searches the gallery (top 5).
- `scan-decision.ts` decides when to log. A card is in view when the detector's upright vote is at
  least 0.5 and its short side at least 60 px. A match is logged on one frame at a score of 0.75
  or more with a 0.08 lead over the runner-up, otherwise after two agreeing frames scoring at least
  0.6. The same card (both faces count as one) is not logged again until a different card is.
- `printing-choice.ts` picks the default printing and finish; `scan-list.ts` builds the import
  CSV (`name,set_code,collector_number,quantity,finish,language,scryfall_id`), which is handed to
  the collection import through `queueSharedImport` in `lib/native-shared-import.ts`.

The thresholds were calibrated with bundle `retrain-20260925T043526910942Z` on synthetic phone
frames (real card scans composited with rotation, perspective, blur and noise): 60 of 60 cards
identified correctly with a median of 267 ms per frame on single-threaded WASM, while empty tables
and blank paper had upright votes of 0.17 or less.

## Testing without a phone

Chromium can use a video file as the camera, which exercises the whole pipeline:

```sh
ffmpeg -loop 1 -t 5 -i card-scene.png -vf "fps=8,format=yuv420p" /tmp/fake-camera.y4m
chromium --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --use-file-for-fake-video-capture=/tmp/fake-camera.y4m http://localhost:4000/scan
```

The camera needs a secure context: HTTPS, or `localhost` during development.
