export type Size = { width: number; height: number }
/** A rectangle in the camera image's pixel space. */
export type Rect = { x: number; y: number; width: number; height: number }

/**
 * How the camera preview fills the screen. The preview always covers the screen; `zoom`
 * enlarges it beyond that, and `panX`/`panY` (0–1 of the camera image) pick the point shown at
 * the middle of the screen, as far as the image's edges allow. Only the preview changes: the
 * recognizer always scans the whole camera image.
 */
export interface PreviewFraming {
  zoom: number
  panX: number
  panY: number
}

/** The part of the camera `image` the preview shows in a `box` of the given size. */
export function previewRect(image: Size, box: Size, framing: PreviewFraming): Rect {
  const scale = Math.max(box.width / image.width, box.height / image.height) * framing.zoom
  const width = Math.min(image.width, box.width / scale)
  const height = Math.min(image.height, box.height / scale)
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)
  return {
    x: clamp(framing.panX * image.width - width / 2, image.width - width),
    y: clamp(framing.panY * image.height - height / 2, image.height - height),
    width,
    height,
  }
}

/** A `box` on screen (relative to the preview's `container`) in camera image pixels. */
export function inImage(box: Rect, visible: Rect, container: Rect): Rect {
  const scale = visible.width / container.width
  return {
    x: visible.x + box.x * scale,
    y: visible.y + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  }
}
