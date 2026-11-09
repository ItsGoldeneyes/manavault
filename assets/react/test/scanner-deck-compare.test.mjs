import test from "node:test"
import assert from "node:assert/strict"

import { scanCompareList, summarizeScanDiff } from "../src/pages/scan/scan-deck-compare.ts"

test("compare text sums copies per card name, oldest scan first, and leaves tokens out", () => {
  // Newest first, as the scan list stores them; the same printing scanned twice is two entries.
  const entries = [
    { name: "Lightning Bolt", quantity: 1 },
    { name: "Goblin", quantity: 2, layout: "token" },
    { name: "Counterspell", quantity: 1, layout: "normal" },
    { name: "Lightning Bolt", quantity: 2 },
  ]
  assert.deepEqual(scanCompareList(entries), {
    text: "3 Lightning Bolt\n1 Counterspell",
    total: 4,
    tokens: 2,
  })
})

test("a list of only tokens leaves nothing to compare", () => {
  assert.deepEqual(scanCompareList([{ name: "Monarch", quantity: 1, layout: "emblem" }]), {
    text: "",
    total: 0,
    tokens: 1,
  })
})

test("a diff reads from the scan's side, counting an unknown name once", () => {
  // Scanned: 3 Lightning Bolt, 1 Giant Growth, 2 of an unknown name; deck: 4 Bolt, 2 Counterspell.
  // The unknown name comes back as an add (no oracle id), so it is extra, not subtracted twice.
  const diff = {
    adds: [
      { cardName: "Notacard", quantity: 2, oracleId: null, imageUrl: null },
      { cardName: "Giant Growth", quantity: 1, oracleId: "gg", imageUrl: null },
    ],
    cuts: [
      { cardName: "Counterspell", quantity: 2, oracleId: "cs", imageUrl: null, deckCardIds: [] },
    ],
    changes: [
      {
        cardName: "Lightning Bolt",
        fromQuantity: 4,
        toQuantity: 3,
        oracleId: "lb",
        deckCardIds: [],
      },
    ],
  }
  assert.deepEqual(summarizeScanDiff(diff, 6), {
    matched: 3,
    deckTotal: 6,
    missing: [
      { cardName: "Counterspell", quantity: 2 },
      { cardName: "Lightning Bolt", quantity: 1 },
    ],
    extra: [
      { cardName: "Giant Growth", quantity: 1 },
      { cardName: "Notacard", quantity: 2, unrecognized: true },
    ],
  })
})

test("extra copies of a deck card are extra, not matched", () => {
  const diff = {
    adds: [],
    cuts: [],
    changes: [
      { cardName: "Sol Ring", fromQuantity: 1, toQuantity: 3, oracleId: "sr", deckCardIds: [] },
    ],
  }
  assert.deepEqual(summarizeScanDiff(diff, 3), {
    matched: 1,
    deckTotal: 1,
    missing: [],
    extra: [{ cardName: "Sol Ring", quantity: 2 }],
  })
})
