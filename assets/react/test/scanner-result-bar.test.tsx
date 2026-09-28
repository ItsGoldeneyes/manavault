import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { ScanResultBar } from "../src/pages/scan/scan-result-bar"
import type { ScanEntry } from "../src/pages/scan/scan-list"

afterEach(cleanup)

const entry: ScanEntry = {
  id: "e1",
  cardKey: "card",
  illustrationId: "art",
  name: "Lightning Bolt",
  scryfallId: "card",
  setCode: "m10",
  setName: "Magic 2010",
  collectorNumber: "146",
  rarity: "common",
  finish: "nonfoil",
  finishes: ["nonfoil", "foil"],
  language: "en",
  quantity: 2,
  prices: { nonfoil: 150, foil: 900, etched: null },
  imageUrl: null,
  resolved: true,
  scannedAt: 0,
}

function renderBar() {
  const handlers = {
    onAddCopy: vi.fn(),
    onFinish: vi.fn(),
    onPrinting: vi.fn(),
    onLanguage: vi.fn(),
  }
  render(<ScanResultBar entry={entry} {...handlers} />)
  return handlers
}

test("shows the latest scan with its price and quantity", () => {
  renderBar()
  expect(screen.getByText("Lightning Bolt")).toBeTruthy()
  expect(screen.getByText("$1.50")).toBeTruthy()
  expect(screen.getByText("×2")).toBeTruthy()
  // Only printed finishes are offered once the catalog answered.
  expect(screen.queryByRole("radio", { name: "Etched" })).toBeNull()
})

test("tapping the card or +1 logs another copy explicitly", async () => {
  const user = userEvent.setup()
  const handlers = renderBar()
  await user.click(screen.getByRole("button", { name: /tap to add another copy/ }))
  await user.click(screen.getByRole("button", { name: "Add another Lightning Bolt" }))
  expect(handlers.onAddCopy).toHaveBeenCalledTimes(2)
  expect(handlers.onAddCopy).toHaveBeenCalledWith("e1")
})

test("chips change finish, printing and language", async () => {
  const user = userEvent.setup()
  const handlers = renderBar()
  await user.click(screen.getByRole("radio", { name: "Foil" }))
  expect(handlers.onFinish).toHaveBeenCalledWith("e1", "foil")
  await user.click(screen.getByRole("button", { name: /Change printing/ }))
  expect(handlers.onPrinting).toHaveBeenCalledWith("e1")
  await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "ja")
  expect(handlers.onLanguage).toHaveBeenCalledWith("e1", "ja")
})

test("empty state explains how to scan", () => {
  render(
    <ScanResultBar
      entry={null}
      onAddCopy={vi.fn()}
      onFinish={vi.fn()}
      onPrinting={vi.fn()}
      onLanguage={vi.fn()}
    />,
  )
  expect(screen.getByText(/Scanned cards appear here/)).toBeTruthy()
})
