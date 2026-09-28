/**
 * "Collect training data": logged scans upload the frame the recognizer saw with its label to
 * the ManaVault server (`POST /api/scanner/corrections`), where Oracle's importer pulls them.
 * Changing an entry's printing or finish relabels its capture; the last label wins.
 */
import { currentCsrfToken } from "../../lib/csrf"
import type { Identification } from "./recognition/messages"
import type { Candidate } from "./recognition/pipeline"
import type { Finish } from "./printing-choice"

/** What an entry keeps to relabel its capture later: everything but the label and image. */
export interface TrainingCapture {
  captureId: string
  /** "-1" when the scan recognized a card's second printed face. */
  face: "" | "-1"
  top1: string
  click: [number, number]
  quad: [number, number][]
  upVote: number
  similarity: number
  margin: number
  bundleVersion: string
}

export interface TrainingSample {
  capture_id: string
  /** A printing of the card in view; `null` marks the capture skipped. */
  label: string | null
  top1: string
  click: [number, number]
  quad: [number, number][]
  up_vote: number
  similarity: number
  margin: number
  finish: Finish
  bundle_version: string
  image?: string
}

const FACE_SUFFIX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-1)?$/i

export function trainingCapture(
  captureId: string,
  candidate: Candidate,
  result: Identification,
  frameSize: number,
  bundleVersion: string,
): TrainingCapture {
  const runnerUp = result.candidates.find((other) => other.id !== candidate.id)
  return {
    captureId,
    face: FACE_SUFFIX.exec(candidate.id)?.[2] === "-1" ? "-1" : "",
    top1: result.candidates[0]?.id ?? candidate.id,
    click: [frameSize / 2, frameSize / 2],
    quad: result.quad.map(([x, y]) => [round(x), round(y)]),
    upVote: clamp(round(result.upVote), 0, 2),
    similarity: clamp(round(candidate.score), -2, 2),
    margin: clamp(round(candidate.score - (runnerUp?.score ?? 0)), 0, 4),
    bundleVersion,
  }
}

/**
 * The capture labelled as `scryfallId` (a printing of the card in view, keeping the scanned
 * face) with `finish`; a `null` ID marks it skipped.
 */
export function trainingSample(
  capture: TrainingCapture,
  scryfallId: string | null,
  finish: Finish,
  image?: string,
): TrainingSample {
  const base = scryfallId === null ? null : (FACE_SUFFIX.exec(scryfallId)?.[1] ?? scryfallId)
  return {
    capture_id: capture.captureId,
    label: base === null ? null : base + capture.face,
    top1: capture.top1,
    click: capture.click,
    quad: capture.quad,
    up_vote: capture.upVote,
    similarity: capture.similarity,
    margin: capture.margin,
    finish,
    bundle_version: capture.bundleVersion,
    ...(image ? { image } : {}),
  }
}

/** Fire-and-forget: collection must never get in the way of scanning. */
export async function uploadTrainingSample(sample: TrainingSample): Promise<boolean> {
  try {
    const token = currentCsrfToken()
    const response = await fetch("/api/scanner/corrections", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(token ? { "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(sample),
    })
    return response.ok
  } catch {
    return false
  }
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}
