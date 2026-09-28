import test from "node:test"
import assert from "node:assert/strict"

import { chooseFinish, choosePrinting, rankPrintings } from "../src/pages/scan/printing-choice.ts"

function printing(id, overrides = {}) {
  return {
    scryfallId: id,
    name: "Lightning Bolt",
    setCode: "m10",
    setName: "Magic 2010",
    collectorNumber: "1",
    lang: "en",
    rarity: "common",
    illustrationId: "art-a",
    ownedCount: 0,
    finishes: ["nonfoil", "foil"],
    promo: false,
    releasedAt: "2009-07-17",
    imageUrl: null,
    prices: { nonfoil: 100, foil: 300, etched: null },
    ...overrides,
  }
}

const prefs = { lockedSets: [], ignorePromos: true }

test("locked sets win over artwork, ownership and age", () => {
  const options = [
    printing("newest", { releasedAt: "2024-01-01" }),
    printing("owned", { ownedCount: 2 }),
    printing("locked", { setCode: "LEB", illustrationId: "art-b", releasedAt: "1993-10-01" }),
  ]
  assert.equal(
    choosePrinting(options, { illustrationId: "art-a" }, { ...prefs, lockedSets: ["leb", "2ed"] })
      .scryfallId,
    "locked",
  )
})

test("the scanned artwork beats owned and newer printings", () => {
  const options = [
    printing("other-art-new", { illustrationId: "art-b", releasedAt: "2024-01-01", ownedCount: 3 }),
    printing("same-art-old", { releasedAt: "2001-01-01" }),
  ]
  assert.equal(
    choosePrinting(options, { illustrationId: "art-a" }, prefs).scryfallId,
    "same-art-old",
  )
})

test("then owned, then English non-promo, then newest", () => {
  const options = [
    printing("new", { releasedAt: "2024-01-01" }),
    printing("owned", { releasedAt: "2010-01-01", ownedCount: 1 }),
  ]
  assert.equal(choosePrinting(options, { illustrationId: "art-a" }, prefs).scryfallId, "owned")

  const unowned = [
    printing("japanese", { lang: "ja", releasedAt: "2025-01-01" }),
    printing("old", { releasedAt: "2000-01-01" }),
    printing("new", { releasedAt: "2022-01-01" }),
  ]
  assert.deepEqual(
    rankPrintings(unowned, {}, prefs).map((option) => option.scryfallId),
    ["new", "old", "japanese"],
  )
})

test("ignore promos drops promos unless nothing else is left", () => {
  const options = [
    printing("promo", { promo: true, releasedAt: "2025-01-01", ownedCount: 4 }),
    printing("regular"),
  ]
  assert.equal(choosePrinting(options, {}, prefs).scryfallId, "regular")
  assert.equal(choosePrinting(options, {}, { ...prefs, ignorePromos: false }).scryfallId, "promo")
  assert.equal(
    choosePrinting([printing("only-promo", { promo: true })], {}, prefs).scryfallId,
    "only-promo",
  )
  assert.equal(choosePrinting([], {}, prefs), null)
})

test("finish follows prefer-foil when the printing has foil", () => {
  assert.equal(chooseFinish(["nonfoil", "foil"], true), "foil")
  assert.equal(chooseFinish(["nonfoil", "foil"], false), "nonfoil")
  assert.equal(chooseFinish(["nonfoil"], true), "nonfoil")
  assert.equal(chooseFinish(["foil"], false), "foil")
  assert.equal(chooseFinish(["etched"], true), "etched")
})
