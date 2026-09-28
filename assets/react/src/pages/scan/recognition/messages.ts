import type { BundleConstants, Candidate, Quad } from "./pipeline"

/** Bundle files the browser downloads. `printings.json` stays on the server. */
export const BUNDLE_FILES = ["arts.json", "detector.onnx", "embed.onnx", "search.onnx"] as const

export type BundleFile = (typeof BUNDLE_FILES)[number]

/** `GET /api/scanner/bundle`: the installed bundle and where to fetch its files. */
export interface BundleInfo {
  version: string
  created: string
  gallery: { arts: number; dtype: string; embed_dim: number; frame_penalty: number; topk: number }
  constants: BundleConstants
  files: Record<BundleFile, string>
  /** Decoded byte size of each file, for download progress. */
  sizes: Partial<Record<BundleFile, number>>
}

export type WorkerRequest =
  | { type: "load"; bundle: BundleInfo }
  | {
      type: "identify"
      id: number
      /** RGBA pixels of the frame, transferred (not copied) to the worker. */
      rgba: ArrayBuffer
      width: number
      height: number
    }

export interface Identification {
  quad: Quad
  /** Share of detector views that agreed the card is upright, 0–1 (roughly). */
  upVote: number
  candidates: Candidate[]
  /** Milliseconds per stage. */
  timings: { detector: number; embed: number; search: number; total: number }
}

export type WorkerResponse =
  | { type: "progress"; loaded: number; total: number; cached: boolean }
  | { type: "ready"; version: string; arts: number; ms: number }
  | { type: "load_failed"; message: string }
  | { type: "identified"; id: number; result: Identification }
  | { type: "failed"; id: number; message: string }
