/**
 * Turns per-frame recognition results into scan events. Pure, so the thresholds and the
 * "never the same card twice in a row" rule are unit-tested.
 *
 * Thresholds were calibrated on synthetic phone frames with bundle
 * retrain-20260925T043526910942Z: cards scored top ≥ 0.68 with an upright vote ≈ 1, while
 * empty tables and blank paper had upright votes ≤ 0.17 (blank paper still scores 0.91 as
 * "Whiteout", so the upright vote is what rejects it).
 */
import type { Identification } from "./recognition/messages"
import type { Candidate } from "./recognition/pipeline"

export const SCAN_THRESHOLDS = {
  /** A card is in view when this share of detector rotations agree on "up". */
  minUpVote: 0.5,
  /** Smallest plausible card short side, in frame pixels (frames are 640 px squares). */
  minShortSide: 60,
  /** Below this, a candidate is never logged. */
  minScore: 0.6,
  /** One frame is enough when top-1 is this similar and leads the runner-up by `clearMargin`. */
  clearScore: 0.75,
  clearMargin: 0.08,
  /** Otherwise this many consecutive frames must agree. */
  agreeingFrames: 2,
} as const

export interface ScanTracker {
  /** Card key of the current run of agreeing frames. */
  streakKey: string | null
  streak: number
  /** Card key of the last logged scan; the same card is not logged again until another is. */
  lastLoggedKey: string | null
}

export const INITIAL_TRACKER: ScanTracker = { streakKey: null, streak: 0, lastLoggedKey: null }

export type FrameOutcome =
  /** No card in view. */
  | { type: "empty" }
  /** A card is in view but not yet confidently identified. */
  | { type: "tracking"; candidate: Candidate | null }
  /** Identified, but it is the card that was just logged. */
  | { type: "duplicate"; candidate: Candidate }
  /** Log this card. */
  | { type: "accept"; candidate: Candidate }

/** Gallery IDs name separate faces `<uuid>-<n>`; both faces are the same physical card. */
export function cardKey(galleryId: string) {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+$/i.exec(
    galleryId,
  )
  return match?.[1] ?? galleryId
}

export function cardInView(result: Identification) {
  return (
    result.upVote >= SCAN_THRESHOLDS.minUpVote &&
    quadShortSide(result) >= SCAN_THRESHOLDS.minShortSide
  )
}

export function evaluateFrame(
  tracker: ScanTracker,
  result: Identification,
): { tracker: ScanTracker; outcome: FrameOutcome } {
  if (!cardInView(result)) {
    return { tracker: { ...tracker, streakKey: null, streak: 0 }, outcome: { type: "empty" } }
  }

  const [first, second] = result.candidates
  if (!first || first.score < SCAN_THRESHOLDS.minScore) {
    return {
      tracker: { ...tracker, streakKey: null, streak: 0 },
      outcome: { type: "tracking", candidate: first ?? null },
    }
  }

  const key = cardKey(first.id)
  const streak = tracker.streakKey === key ? tracker.streak + 1 : 1
  const clear =
    first.score >= SCAN_THRESHOLDS.clearScore &&
    first.score - (second?.score ?? 0) >= SCAN_THRESHOLDS.clearMargin
  const next = { ...tracker, streakKey: key, streak }

  if (!clear && streak < SCAN_THRESHOLDS.agreeingFrames) {
    return { tracker: next, outcome: { type: "tracking", candidate: first } }
  }
  if (key === tracker.lastLoggedKey) {
    return { tracker: next, outcome: { type: "duplicate", candidate: first } }
  }
  return { tracker: { ...next, lastLoggedKey: key }, outcome: { type: "accept", candidate: first } }
}

/** After the last logged scan is deleted, the same card may be scanned again. */
export function forgetLastLogged(tracker: ScanTracker): ScanTracker {
  return { ...tracker, lastLoggedKey: null }
}

function quadShortSide({ quad }: Identification) {
  let short = Infinity
  for (let k = 0; k < 4; k += 1) {
    const a = quad[k]!
    const b = quad[(k + 1) % 4]!
    short = Math.min(short, Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  return short
}
