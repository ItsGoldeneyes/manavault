import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { OutlineEditor, type OutlineCheck } from "../src/pages/scan/outline-editor"
import type { Quad } from "../src/pages/scan/recognition/pipeline"
import { trainingSample, withCheckedOutline } from "../src/pages/scan/scan-training"

afterEach(cleanup)

const quad: Quad = [
  [200, 150],
  [440, 150],
  [440, 480],
  [200, 480],
]
const check: OutlineCheck = {
  entryId: "e1",
  name: "Funeral Room",
  image: "data:image/jpeg;base64,AAAA",
  quad,
}

function renderEditor() {
  const onSave = vi.fn()
  const onSkip = vi.fn()
  render(<OutlineEditor check={check} onSave={onSave} onSkip={onSkip} />)
  return { onSave, onSkip, user: userEvent.setup() }
}

test("confirming an untouched outline saves it as it was", async () => {
  const { onSave, user } = renderEditor()
  expect(screen.getByRole("dialog", { name: "Check outline" })).toBeTruthy()
  expect(screen.getByText("Funeral Room")).toBeTruthy()
  await user.click(screen.getByRole("button", { name: "Looks right" }))
  expect(onSave).toHaveBeenCalledWith(quad)
})

test("arrow keys nudge a corner; the moved outline is saved or reset", async () => {
  const { onSave, user } = renderEditor()
  screen.getByRole("button", { name: /Corner 3 of 4/ }).focus()
  await user.keyboard("{Shift>}{ArrowRight}{/Shift}{ArrowDown}")
  await user.click(screen.getByRole("button", { name: "Reset" }))
  expect(screen.queryByRole("button", { name: "Save outline" })).toBeNull()

  screen.getByRole("button", { name: /Corner 3 of 4/ }).focus()
  await user.keyboard("{Shift>}{ArrowRight}{/Shift}{ArrowDown}")
  await user.click(screen.getByRole("button", { name: "Save outline" }))
  expect(onSave).toHaveBeenCalledWith([quad[0], quad[1], [448, 481], quad[3]])
})

test("skipping keeps the detector's outline", async () => {
  const { onSave, onSkip, user } = renderEditor()
  await user.click(screen.getByRole("button", { name: "Skip" }))
  expect(onSkip).toHaveBeenCalled()
  expect(onSave).not.toHaveBeenCalled()
})

test("a checked outline is resent as manual ground truth", () => {
  const capture = {
    captureId: "cap",
    face: "" as const,
    click: [320, 320] as [number, number],
    quad: quad.map(([x, y]) => [x, y] as [number, number]),
    bundleVersion: "v1",
  }
  expect(trainingSample(capture, "id", "nonfoil")).not.toHaveProperty("quad_source", "manual")
  const checked = withCheckedOutline(capture, [quad[0], quad[1], [448.1234, 481], quad[3]])
  const sent = trainingSample(checked, "id", "nonfoil")
  expect(sent.quad_source).toBe("manual")
  expect(sent.quad?.[2]).toEqual([448.123, 481])
  expect(sent).not.toHaveProperty("image")
})
