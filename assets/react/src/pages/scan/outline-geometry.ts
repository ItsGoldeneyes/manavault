import type { Quad } from "./recognition/pipeline"

type Point = [number, number]

/** The part of the square frame shown while checking an outline, in frame pixels. */
export interface ViewBox {
  x: number
  y: number
  width: number
  height: number
}

/** A card-shaped outline in the middle of the frame, for a frame where no card was found. */
export function centredOutline(frameSize: number): Quad {
  const height = frameSize * 0.6
  const width = (height * 63) / 88
  const [left, top] = [(frameSize - width) / 2, (frameSize - height) / 2]
  return [
    [left, top],
    [left + width, top],
    [left + width, top + height],
    [left, top + height],
  ]
}

/**
 * The outline with room around it, so corners can be dragged outward and the card edges are
 * big enough to place them on. Fixed while editing, so the picture never moves under a finger.
 */
export function outlineViewBox(quad: Quad, frameSize: number): ViewBox {
  const xs = quad.map(([x]) => x)
  const ys = quad.map(([, y]) => y)
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ]
  const side = Math.min(frameSize, Math.max(160, Math.max(maxX - minX, maxY - minY) * 1.5))
  const clampStart = (centre: number) => Math.min(frameSize - side, Math.max(0, centre - side / 2))
  return {
    x: clampStart((minX + maxX) / 2),
    y: clampStart((minY + maxY) / 2),
    width: side,
    height: side,
  }
}

/** The corner nearest `point`, if one is within `reach` (frame pixels). */
export function nearestCorner(quad: Quad, point: Point, reach: number): number | null {
  let best: number | null = null
  let bestDistance = reach
  quad.forEach(([x, y], index) => {
    const distance = Math.hypot(x - point[0], y - point[1])
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/** The outline with one corner moved to `point`, kept inside the frame. */
export function moveCorner(quad: Quad, index: number, point: Point, frameSize: number): Quad {
  const clamp = (value: number) => Math.min(frameSize, Math.max(0, value))
  return quad.map((corner, k) =>
    k === index ? [clamp(point[0]), clamp(point[1])] : corner,
  ) as Quad
}

/** Whether any corner moved by at least half a frame pixel. */
export function outlineMoved(before: Quad, after: Quad): boolean {
  return before.some(
    ([x, y], k) => Math.abs(x - after[k]![0]) >= 0.5 || Math.abs(y - after[k]![1]) >= 0.5,
  )
}

/**
 * Maps a pointer position to frame pixels through an SVG that shows `box` with
 * `preserveAspectRatio="xMidYMid meet"` inside `rect` (its on-screen box).
 */
export function screenToFrame(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  box: ViewBox,
): Point {
  const scale = Math.min(rect.width / box.width, rect.height / box.height) || 1
  const left = rect.left + (rect.width - box.width * scale) / 2
  const top = rect.top + (rect.height - box.height * scale) / 2
  return [box.x + (clientX - left) / scale, box.y + (clientY - top) / scale]
}
