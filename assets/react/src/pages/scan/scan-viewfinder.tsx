import { useEffect, useState, type RefObject } from "react"
import { cn } from "../../lib/utils"
import type { Quad } from "./recognition/pipeline"
import { FRAME_SIZE, frameSquare } from "./use-camera"
import type { ScanView } from "./use-scan-session"

/** Card guide: a portrait card whose long side covers this share of the frame square. */
const GUIDE_FILL = 0.74
const CARD_ASPECT = 88 / 63

/**
 * Full-bleed camera preview. The SVG uses the video's own pixel space with `slice`, which
 * crops exactly like `object-fit: cover`, so frame-space quads line up with the picture.
 */
export function ScanViewfinder({
  videoRef,
  view,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  view: ScanView
}) {
  const size = useVideoSize(videoRef)

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        playsInline
        aria-label="Camera preview"
      />
      {size ? <Overlay {...size} view={view} /> : null}
    </div>
  )
}

function Overlay({
  width,
  height,
  viewWidth,
  viewHeight,
  view,
}: {
  width: number
  height: number
  viewWidth: number
  viewHeight: number
  view: ScanView
}) {
  const square = frameSquare(width, height, viewWidth, viewHeight)
  const guideHeight = square.side * GUIDE_FILL
  const guideWidth = guideHeight / CARD_ASPECT
  const gx = width / 2 - guideWidth / 2
  const gy = height / 2 - guideHeight / 2
  const corner = guideWidth * 0.16
  const radius = guideWidth * 0.045
  const toVideo = (quad: Quad) =>
    quad
      .map(([x, y]) => {
        const scale = square.side / FRAME_SIZE
        return `${square.x + x * scale},${square.y + y * scale}`
      })
      .join(" ")
  const stroke = Math.max(3, square.side * 0.006)
  const tone =
    view.outcome === "accept"
      ? "text-success"
      : view.outcome === "duplicate"
        ? "text-base-content"
        : "text-warning"

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <mask id="scan-guide-cutout">
          <rect width={width} height={height} fill="white" />
          <rect x={gx} y={gy} width={guideWidth} height={guideHeight} rx={radius} fill="black" />
        </mask>
      </defs>
      <rect width={width} height={height} fill="rgb(0 0 0 / 0.38)" mask="url(#scan-guide-cutout)" />
      <path
        className="text-white/85"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        d={[
          `M ${gx} ${gy + corner} V ${gy + radius} Q ${gx} ${gy} ${gx + radius} ${gy} H ${gx + corner}`,
          `M ${gx + guideWidth - corner} ${gy} H ${gx + guideWidth - radius} Q ${gx + guideWidth} ${gy} ${gx + guideWidth} ${gy + radius} V ${gy + corner}`,
          `M ${gx + guideWidth} ${gy + guideHeight - corner} V ${gy + guideHeight - radius} Q ${gx + guideWidth} ${gy + guideHeight} ${gx + guideWidth - radius} ${gy + guideHeight} H ${gx + guideWidth - corner}`,
          `M ${gx + corner} ${gy + guideHeight} H ${gx + radius} Q ${gx} ${gy + guideHeight} ${gx} ${gy + guideHeight - radius} V ${gy + guideHeight - corner}`,
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
  const [size, setSize] = useState<{
    width: number
    height: number
    viewWidth: number
    viewHeight: number
  } | null>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () =>
      setSize(
        video.videoWidth
          ? {
              width: video.videoWidth,
              height: video.videoHeight,
              viewWidth: video.clientWidth,
              viewHeight: video.clientHeight,
            }
          : null,
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(video)
    video.addEventListener("loadedmetadata", update)
    video.addEventListener("resize", update)
    video.addEventListener("emptied", update)
    return () => {
      observer.disconnect()
      video.removeEventListener("loadedmetadata", update)
      video.removeEventListener("resize", update)
      video.removeEventListener("emptied", update)
    }
  }, [videoRef])
  return size
}
