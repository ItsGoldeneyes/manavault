import test from "node:test"
import assert from "node:assert/strict"

import { inImage, previewRect as rawPreviewRect } from "../src/pages/scan/preview-framing.ts"

// Scaling leaves floating-point noise such as 1919.9999999999998; compare to a micro-pixel.
const round = (rect) =>
  Object.fromEntries(Object.entries(rect).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]))
const previewRect = (...args) => round(rawPreviewRect(...args))

// A portrait 1080×1920 camera image on a 400×1000 screen: filling the screen crops the sides.
const image = { width: 1080, height: 1920 }
const screen = { width: 400, height: 1000 }

test("without zoom the preview covers the screen, cropping the sides evenly", () => {
  assert.deepEqual(previewRect(image, screen, { zoom: 1, panX: 0.5, panY: 0.5 }), {
    x: 156,
    y: 0,
    width: 768,
    height: 1920,
  })
})

test("zoom shows less of the image and pan picks the point at the middle of the screen", () => {
  const rect = previewRect(image, screen, { zoom: 2, panX: 0.5, panY: 0.65 })
  assert.equal(rect.width, 384)
  assert.equal(rect.height, 960)
  assert.equal(rect.x + rect.width / 2, 540)
  assert.equal(rect.y + rect.height / 2, 0.65 * 1920)
})

test("pan stops at the image's edges instead of showing empty space", () => {
  const top = previewRect(image, screen, { zoom: 1.5, panX: 0, panY: 0 })
  assert.equal(top.x, 0)
  assert.equal(top.y, 0)
  const bottom = previewRect(image, screen, { zoom: 1.5, panX: 1, panY: 1 })
  assert.equal(bottom.x + bottom.width, 1080)
  assert.equal(bottom.y + bottom.height, 1920)
  // Without zoom there is no image above or below to pan to.
  assert.equal(previewRect(image, screen, { zoom: 1, panX: 0.5, panY: 1 }).y, 0)
})

test("a screen box maps into camera image pixels through the preview crop", () => {
  const visible = { x: 156, y: 0, width: 768, height: 1920 }
  const container = { x: 0, y: 0, width: 400, height: 1000 }
  assert.deepEqual(inImage({ x: 0, y: 50, width: 400, height: 900 }, visible, container), {
    x: 156,
    y: 96,
    width: 768,
    height: 1728,
  })
})
