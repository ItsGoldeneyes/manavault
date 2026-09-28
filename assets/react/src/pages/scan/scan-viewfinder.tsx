import { useEffect, useState, type PointerEvent, type RefObject } from "react"
import { cn } from "../../lib/utils"
import type { Quad } from "./recognition/pipeline"
import { frameGeometry } from "./use-camera"
import type { ScanView } from "./scan-view"

/**
 * Camera preview, uncropped (`object-fit: contain`): the whole camera image is what gets
 * scanned, so the brackets frame the full picture. The SVG uses the video's pixel space with
 * `meet`, which letterboxes exactly like `contain`, so detected quads line up with the card.
 */
/** Transparent poster: without one, Android WebView shows a large play icon before playback. */
const BLANK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

export function ScanViewfinder({
  videoRef,
  view,
  onFocusAt,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  view: ScanView
  /** Tap to focus: the tapped point of the camera image, 0–1 from the top left. */
  onFocusAt?: (x: number, y: number) => void
}) {
  const size = useVideoSize(videoRef)
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLVideoElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    if (!onFocusAt || box.width === 0 || box.height === 0) return
    onFocusAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height)
    setFocus({ x: event.clientX, y: event.clientY, key: event.timeStamp })
  }

  useEffect(() => {
    if (!focus) return
    const timeout = window.setTimeout(() => setFocus(null), 900)
    return () => window.clearTimeout(timeout)
  }, [focus])

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* Sized to the camera image itself (no letterbox area): Android WebView paints a video's
          letterbox bars above overlapping page content, which hid the chip row. */}
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 m-auto h-auto max-h-full w-auto max-w-full",
          !size && "invisible",
        )}
        style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
        poster={BLANK_POSTER}
        onPointerDown={handlePointerDown}
        autoPlay
        muted
        playsInline
        aria-label="Camera preview"
      />
      {size ? <Overlay {...size} view={view} /> : null}
      {focus ? (
        <span
          key={focus.key}
          aria-hidden="true"
          className="scan-focus-ring pointer-events-none fixed h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90"
          style={{ left: focus.x, top: focus.y }}
        />
      ) : null}
    </div>
  )
}

function Overlay({ width, height, view }: { width: number; height: number; view: ScanView }) {
  const { scale, offsetX, offsetY } = frameGeometry(width, height)
  const short = Math.min(width, height)
  const inset = short * 0.03
  const corner = short * 0.12
  const stroke = Math.max(3, short * 0.006)
  const toVideo = (quad: Quad) =>
    quad.map(([x, y]) => `${(x - offsetX) / scale},${(y - offsetY) / scale}`).join(" ")
  const tone =
    view.outcome === "accept"
      ? "text-success"
      : view.outcome === "duplicate"
        ? "text-base-content"
        : view.outcome === "outside-lock"
          ? "text-error"
          : "text-warning"
  const [l, t, r, b] = [inset, inset, width - inset, height - inset]

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        className="text-white/70"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        d={[
          `M ${l} ${t + corner} V ${t} H ${l + corner}`,
          `M ${r - corner} ${t} H ${r} V ${t + corner}`,
          `M ${r} ${b - corner} V ${b} H ${r - corner}`,
          `M ${l + corner} ${b} H ${l} V ${b - corner}`,
        ].join(" ")}
      />
      {view.quad ? (
        <polygon
          key={view.outcome === "accept" ? `logged-${view.logged}` : "tracking"}
          className={cn(tone, view.outcome === "accept" && "scan-quad-logged")}
          points={toVideo(view.quad)}
          fill="currentColor"
          fillOpacity={view.outcome === "accept" ? 0.18 : 0.06}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  )
}

function useVideoSize(videoRef: RefObject<HTMLVideoElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () =>
      setSize(video.videoWidth ? { width: video.videoWidth, height: video.videoHeight } : null)
    update()
    video.addEventListener("loadedmetadata", update)
    video.addEventListener("resize", update)
    video.addEventListener("emptied", update)
    return () => {
      video.removeEventListener("loadedmetadata", update)
      video.removeEventListener("resize", update)
      video.removeEventListener("emptied", update)
    }
  }, [videoRef])
  return size
}
