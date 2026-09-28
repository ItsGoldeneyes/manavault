import { expect, test } from "vitest"

import { trainingCapture, trainingSample } from "../src/pages/scan/scan-training"

const FRONT = "54772e15-d99d-4eec-ba8d-b9202a7e318b"
const OTHER = "db6358cf-fcb9-42af-9755-dd1f39bfc8ff"

function result(first: string, second = OTHER) {
  return {
    quad: [
      [10.12345, 20],
      [300, 20],
      [300, 440],
      [10, 440],
    ] as [number, number][],
    upVote: 1.04,
    candidates: [
      { id: first, name: "A", set: "snc", frame: "modern", index: 0, score: 0.912345 },
      { id: second, name: "B", set: "snc", frame: "modern", index: 1, score: 0.6 },
    ],
    timings: { detector: 0, embed: 0, search: 0, total: 0 },
  }
}

test("a capture keeps the geometry and scores Oracle's importer reads", () => {
  const scan = result(FRONT)
  const capture = trainingCapture("cap", scan.candidates[0]!, scan, 640, "v1")
  expect(capture).toMatchObject({
    captureId: "cap",
    face: "",
    top1: FRONT,
    click: [320, 320],
    upVote: 1.04,
    similarity: 0.912,
    margin: 0.312,
    bundleVersion: "v1",
  })
  expect(capture.quad[0]).toEqual([10.123, 20])
})

test("labels keep the scanned face, relabels omit the image, null skips", () => {
  const scan = result(`${FRONT}-1`)
  const capture = trainingCapture("cap", scan.candidates[0]!, scan, 640, "v1")
  expect(capture.face).toBe("-1")

  const first = trainingSample(capture, `${FRONT}-1`, "foil", "data:image/jpeg;base64,AAAA")
  expect(first.label).toBe(`${FRONT}-1`)
  expect(first.image).toBeDefined()

  // Another printing of the same card, chosen later, keeps the back-face suffix.
  const relabel = trainingSample(capture, OTHER, "nonfoil")
  expect(relabel.label).toBe(`${OTHER}-1`)
  expect(relabel).not.toHaveProperty("image")
  expect(relabel.finish).toBe("nonfoil")

  expect(trainingSample(capture, null, "foil").label).toBeNull()
})
