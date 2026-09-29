import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { cn } from "../../lib/utils"
import {
  moveCorner,
  nearestCorner,
  outlineMoved,
  outlineViewBox,
  screenToFrame,
  type ViewBox,
} from "./outline-geometry"
import type { Quad } from "./recognition/pipeline"
import { FRAME_SIZE } from "./use-camera"

/** A logged scan waiting for the user to confirm or fix the card outline. */
export interface OutlineCheck {
  entryId: string
  name: string
  /** JPEG data URL of the square frame the recognizer saw. */
  image: string
  quad: Quad
}

/** On-screen sizes, in CSS pixels. */
const HANDLE_PX = 13
const REACH_PX = 56
const LOUPE_PX = 132
const LOUPE_ZOOM = 3
const KEY_STEP = 1
const KEY_STEP_LARGE = 8

/**
 * "Check outlines": the frozen frame with the detector's outline and four draggable corners.
 * Touching anywhere picks up the nearest corner, a loupe shows the edge under the finger, and
 * arrow keys nudge a focused corner. Confirming, moved or not, makes the outline ground truth.
 */
export function OutlineEditor({
  check,
  onSave,
  onSkip,
}: {
  check: OutlineCheck | null
  onSave: (quad: Quad) => void
  onSkip: () => void
}) {
  return (
    <Dialog open={check !== null} onOpenChange={(open) => !open && onSkip()}>
      {check ? (
        <OutlineEditorContent key={check.entryId} check={check} onSave={onSave} onSkip={onSkip} />
      ) : null}
    </Dialog>
  )
}

function OutlineEditorContent({
  check,
  onSave,
  onSkip,
}: {
  check: OutlineCheck
  onSave: (quad: Quad) => void
  onSkip: () => void
}) {
  const [quad, setQuad] = useState<Quad>(check.quad)
  const [drag, setDrag] = useState<{ index: number; offset: [number, number] } | null>(null)
  const box = useMemo(() => outlineViewBox(check.quad, FRAME_SIZE), [check.quad])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pxPerUnit = useRenderedScale(svgRef, box)
  const moved = outlineMoved(check.quad, quad)
  const points = quad.map(([x, y]) => `${x},${y}`).join(" ")

  function toFrame(event: PointerEvent<SVGSVGElement>) {
    return screenToFrame(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      box,
    )
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    const point = toFrame(event)
    const index = nearestCorner(quad, point, REACH_PX / pxPerUnit)
    if (index === null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const [x, y] = quad[index]!
    setDrag({ index, offset: [x - point[0], y - point[1]] })
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag) return
    const [x, y] = toFrame(event)
    setQuad((current) =>
      moveCorner(current, drag.index, [x + drag.offset[0], y + drag.offset[1]], FRAME_SIZE),
    )
  }

  function handleKeyDown(index: number, event: KeyboardEvent<SVGCircleElement>) {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    setQuad((current) => {
      const [x, y] = current[index]!
      return moveCorner(current, index, [x + move[0], y + move[1]], FRAME_SIZE)
    })
  }

  const dragged = drag ? quad[drag.index]! : null

  return (
    <DialogContent
      className="scan-sheet sm:h-[min(48rem,calc(100dvh_-_var(--safe-top)_-_var(--safe-bottom)_-_4rem))] sm:max-w-xl"
      labelledBy="scan-outline-title"
      describedBy="scan-outline-help"
    >
      <DialogHeader>
        <div className="min-w-0">
          <DialogTitle id="scan-outline-title">Check outline</DialogTitle>
          <p id="scan-outline-help" className="mt-1 text-sm text-base-content/70">
            <span className="font-bold text-base-content">{check.name}</span>: drag the corners onto
            the card's edges.
          </p>
        </div>
      </DialogHeader>

      <div className="relative min-h-0 flex-1 bg-black">
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
          viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
          role="group"
          aria-label="Card outline"
        >
          <image
            href={check.image}
            x={0}
            y={0}
            width={FRAME_SIZE}
            height={FRAME_SIZE}
            preserveAspectRatio="none"
          />
          <OutlineShape points={points} />
          {quad.map(([x, y], index) => (
            <circle
              // Four fixed corners in the detector's printed order: the index is their identity.
              key={index}
              cx={x}
              cy={y}
              r={HANDLE_PX / pxPerUnit}
              tabIndex={0}
              role="button"
              aria-label={`Corner ${index + 1} of 4. Arrow keys move it.`}
              className={cn(
                "cursor-grab fill-white/25 stroke-white outline-none focus-visible:fill-primary/60",
                drag?.index === index && "fill-primary/60",
              )}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              onKeyDown={(event) => handleKeyDown(index, event)}
            />
          ))}
        </svg>
        {dragged ? (
          <Loupe
            image={check.image}
            points={points}
            centre={dragged}
            side={LOUPE_PX / (pxPerUnit * LOUPE_ZOOM)}
            // Opposite the finger, so it never sits under it.
            placement={dragged[0] < box.x + box.width / 2 ? "right" : "left"}
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-base-300 px-5 py-4 pb-[calc(var(--safe-bottom)_+_1rem)] sm:pb-4">
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        {moved ? (
          <Button type="button" variant="outline" onClick={() => setQuad(check.quad)}>
            Reset
          </Button>
        ) : null}
        <Button type="button" className="ml-auto" onClick={() => onSave(quad)} autoFocus>
          {moved ? "Save outline" : "Looks right"}
        </Button>
      </div>
    </DialogContent>
  )
}

function OutlineShape({ points }: { points: string }) {
  return (
    <polygon
      points={points}
      className="fill-primary/10 stroke-primary"
      strokeWidth={2}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  )
}

/** A magnified view of the dragged corner with a crosshair, for placing it precisely. */
function Loupe({
  image,
  points,
  centre,
  side,
  placement,
}: {
  image: string
  points: string
  centre: [number, number]
  side: number
  placement: "left" | "right"
}) {
  const [x, y] = centre
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-3 rounded-full border-2 border-white bg-black shadow-xl",
        placement === "left" ? "left-3" : "right-3",
      )}
      style={{ width: LOUPE_PX, height: LOUPE_PX }}
      viewBox={`${x - side / 2} ${y - side / 2} ${side} ${side}`}
    >
      <image
        href={image}
        x={0}
        y={0}
        width={FRAME_SIZE}
        height={FRAME_SIZE}
        preserveAspectRatio="none"
      />
      <OutlineShape points={points} />
      <path
        d={`M ${x - side / 2} ${y} H ${x + side / 2} M ${x} ${y - side / 2} V ${y + side / 2}`}
        className="stroke-white/80"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** CSS pixels per frame pixel of the rendered SVG, so handles keep a finger-sized radius. */
function useRenderedScale(ref: { current: SVGSVGElement | null }, box: ViewBox) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const update = () => {
      const rect = svg.getBoundingClientRect()
      const next = Math.min(rect.width / box.width, rect.height / box.height)
      if (next > 0) setScale(next)
    }
    update()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [ref, box])
  return scale
}
