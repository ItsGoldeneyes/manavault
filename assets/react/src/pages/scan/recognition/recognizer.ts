/**
 * Runs the three bundle graphs on one frame. Ported from the-gathering's
 * `recognizer.worker.ts`: the frame centre replaces the click, so the first detector window is
 * the `scene` px square in the middle of the camera frame.
 *
 * The ORT namespace is a parameter so the worker (`onnxruntime-web/wasm`) and a Node
 * calibration script (`onnxruntime-web`) share this code.
 */
import type * as Ort from "onnxruntime-web"
import type { Identification } from "./messages"
import {
  fromWindow,
  refineSide,
  resampleWindow,
  upVote,
  type BundleConstants,
  type Candidate,
  type GalleryArt,
  type Point,
  type Quad,
  type RgbaImage,
} from "./pipeline.ts"

type OrtModule = Pick<typeof Ort, "InferenceSession" | "Tensor">

export interface Recognizer {
  identify: (image: RgbaImage) => Promise<Identification>
}

export async function createRecognizer(
  ort: OrtModule,
  graphs: { detector: Uint8Array; embed: Uint8Array; search: Uint8Array },
  constants: BundleConstants,
  arts: GalleryArt[],
): Promise<Recognizer> {
  const options: Ort.InferenceSession.SessionOptions = {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  }
  // Sequential creation keeps peak memory lower on phones than three parallel compiles.
  const detector = await ort.InferenceSession.create(graphs.detector, options)
  const embed = await ort.InferenceSession.create(graphs.embed, options)
  const search = await ort.InferenceSession.create(graphs.search, options)

  async function detect(image: RgbaImage, cx: number, cy: number, side: number) {
    const size = constants.det_input
    const { window, scale } = resampleWindow(image, cx, cy, side, size)
    const out = await detector.run({
      window: new ort.Tensor("uint8", new Uint8Array(window.buffer), [size, size, 4]),
    })
    const quad = out.quad?.data as Float32Array
    const up = out.up?.data as Float32Array
    const centre = out.centre?.data as Float32Array
    const short = out.short?.data as Float32Array
    const corners = [0, 1, 2, 3].map((k) =>
      fromWindow([quad[k * 2] ?? 0, quad[k * 2 + 1] ?? 0], cx, cy, scale, size),
    ) as Quad
    return {
      quad: corners,
      up: [up[0] ?? 0, up[1] ?? 0] as [number, number],
      centre: fromWindow([centre[0] ?? 0, centre[1] ?? 0], cx, cy, scale, size) as Point,
      short: (short[0] ?? 0) / scale,
    }
  }

  async function identify(image: RgbaImage): Promise<Identification> {
    const started = performance.now()
    const coarse = await detect(image, image.width / 2, image.height / 2, constants.scene)
    const fine = await detect(
      image,
      coarse.centre[0],
      coarse.centre[1],
      refineSide(coarse.short, constants),
    )
    const detected = performance.now()

    const embeddings = await embed.run({
      scene: new ort.Tensor("uint8", new Uint8Array(image.data.buffer), [
        image.height,
        image.width,
        4,
      ]),
      quad: new ort.Tensor("float32", Float32Array.from(fine.quad.flat()), [4, 2]),
    })
    const embedded = performance.now()
    const vectors = Object.values(embeddings)[0]
    if (!vectors) throw new Error("embed graph returned nothing")
    const ranked = await search.run({ embeddings: vectors })
    const finished = performance.now()

    const indices = ranked.indices?.data as BigInt64Array | Int32Array
    const scores = ranked.scores?.data as Float32Array
    const candidates: Candidate[] = []
    for (let k = 0; k < indices.length; k += 1) {
      const index = Number(indices[k])
      const art = arts[index]
      if (art) candidates.push({ ...art, index, score: scores[k] ?? 0 })
    }
    return {
      quad: fine.quad,
      upVote: upVote(fine.up, constants),
      candidates,
      timings: {
        detector: detected - started,
        embed: embedded - detected,
        search: finished - embedded,
        total: finished - started,
      },
    }
  }

  // The first run of each graph pays for kernel setup; do it before the first real frame.
  const size = constants.scene
  await identify({
    data: new Uint8ClampedArray(size * size * 4).fill(255),
    width: size,
    height: size,
  })

  return { identify }
}
