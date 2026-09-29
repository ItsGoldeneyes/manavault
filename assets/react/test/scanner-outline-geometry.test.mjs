import test from "node:test"
import assert from "node:assert/strict"

import {
  centredOutline,
  moveCorner,
  nearestCorner,
  outlineMoved,
  outlineViewBox,
  screenToFrame,
} from "../src/pages/scan/outline-geometry.ts"

const quad = [
  [200, 150],
  [440, 150],
  [440, 480],
  [200, 480],
]

test("the view frames the outline with room to drag corners outward", () => {
  const box = outlineViewBox(quad, 640)
  assert.equal(box.width, box.height)
  assert.ok(box.x <= 200 && box.x + box.width >= 440)
  assert.ok(box.y <= 150 && box.y + box.height >= 480)
  // A small card near an edge stays inside the frame, and the view never gets tiny.
  const small = outlineViewBox(
    [
      [600, 600],
      [630, 600],
      [630, 635],
      [600, 635],
    ],
    640,
  )
  assert.equal(small.width, 160)
  assert.equal(small.x + small.width, 640)
  assert.equal(small.y + small.height, 640)
})

test("dragging picks up the nearest corner in reach and keeps it in the frame", () => {
  assert.equal(nearestCorner(quad, [430, 470], 30), 2)
  assert.equal(nearestCorner(quad, [320, 320], 30), null)
  const moved = moveCorner(quad, 1, [700, -20], 640)
  assert.deepEqual(moved[1], [640, 0])
  assert.deepEqual(moved[0], quad[0])
  assert.equal(outlineMoved(quad, moved), true)
  assert.equal(outlineMoved(quad, moveCorner(quad, 0, [200.2, 150.3], 640)), false)
})

test("pointer positions map through a letterboxed SVG into frame pixels", () => {
  const box = { x: 100, y: 100, width: 400, height: 400 }
  // 800 x 400 on screen: 1 frame pixel = 1 CSS pixel, centred with 200 px bars left and right.
  const rect = { left: 0, top: 50, width: 800, height: 400 }
  assert.deepEqual(screenToFrame(200, 50, rect, box), [100, 100])
  assert.deepEqual(screenToFrame(600, 450, rect, box), [500, 500])
})

test("a frame without a detected card starts from a card-shaped outline", () => {
  const [[left, top], [right], [, bottom]] = centredOutline(640)
  assert.ok(Math.abs((right - left) / (bottom - top) - 63 / 88) < 1e-9)
  assert.ok(Math.abs(left + right - 640) < 1e-9 && Math.abs(top + bottom - 640) < 1e-9)
})
