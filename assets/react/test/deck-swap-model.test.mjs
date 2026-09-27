import test from "node:test"
import assert from "node:assert/strict"

import {
  EMPTY_DECK_SWAP,
  deckSwapInput,
  deckSwapReducer,
  deckSwapSummary,
  diffLegalityIssues,
  releasedCopyCount,
  stageSearchedCardAction,
  swapCutCandidates,
} from "../src/pages/decks/deck-swap-model.ts"

function deckCard(id, name, zone, overrides = {}) {
  return {
    id,
    quantity: 1,
    zone,
    tag: null,
    card: { name },
    allocationStatus: { state: "missing", allocated: 0, proxyAllocated: 0 },
    ...overrides,
  }
}

const deckCards = [
  deckCard("c1", "Winota, Joiner of Forces", "commander"),
  deckCard("m1", "Pia Nalaar", "mainboard", { tag: "consider_cutting" }),
  deckCard("m2", "Sol Ring", "mainboard", {
    allocationStatus: { state: "allocated", allocated: 1, proxyAllocated: 0 },
  }),
  deckCard("m3", "Mountain", "mainboard", {
    quantity: 30,
    allocationStatus: { state: "basic_land", allocated: 30, proxyAllocated: 0 },
  }),
  deckCard("k1", "Grand Abolisher", "considering"),
]

function apply(...actions) {
  return actions.reduce(deckSwapReducer, EMPTY_DECK_SWAP)
}

test("toggling stages and unstages cuts and considering adds", () => {
  const staged = apply(
    { type: "toggle-cut", deckCardId: "m1" },
    { type: "toggle-considering-add", deckCardId: "k1" },
  )

  assert.deepEqual(staged.cuts, [{ deckCardId: "m1", destination: "remove", quantity: 1 }])
  assert.deepEqual(staged.adds, [{ source: "considering", deckCardId: "k1", quantity: 1 }])

  const unstaged = [
    { type: "toggle-cut", deckCardId: "m1" },
    { type: "toggle-considering-add", deckCardId: "k1" },
  ].reduce(deckSwapReducer, staged)
  assert.deepEqual(unstaged, EMPTY_DECK_SWAP)
})

test("setting a quantity to zero unstages the entry", () => {
  const swap = apply(
    { type: "toggle-cut", deckCardId: "m3" },
    { type: "set-cut-quantity", deckCardId: "m3", quantity: 3 },
  )
  assert.equal(swap.cuts[0].quantity, 3)

  assert.deepEqual(
    deckSwapReducer(swap, { type: "set-cut-quantity", deckCardId: "m3", quantity: 0 }).cuts,
    [],
  )
})

test("searching a name already on Considering moves that card instead of duplicating it", () => {
  const considering = deckCards.filter((entry) => entry.zone === "considering")

  assert.deepEqual(stageSearchedCardAction("grand abolisher", considering), {
    type: "toggle-considering-add",
    deckCardId: "k1",
  })
  assert.deepEqual(stageSearchedCardAction("Mother of Runes", considering), {
    type: "add-by-name",
    name: "Mother of Runes",
  })
})

test("adding the same searched name twice increments its quantity", () => {
  const swap = apply(
    { type: "add-by-name", name: "Plains" },
    { type: "add-by-name", name: "plains" },
  )

  assert.deepEqual(swap.adds, [{ source: "search", name: "Plains", quantity: 2 }])
})

test("deckSwapInput maps staged entries to the GraphQL shape", () => {
  const swap = apply(
    { type: "toggle-cut", deckCardId: "m1" },
    { type: "set-cut-destination", deckCardId: "m1", destination: "considering" },
    { type: "toggle-considering-add", deckCardId: "k1" },
    { type: "add-by-name", name: "Mother of Runes" },
  )

  assert.deepEqual(deckSwapInput(swap), {
    cuts: [{ deckCardId: "m1", quantity: 1, destination: "CONSIDERING" }],
    adds: [
      { deckCardId: "k1", quantity: 1 },
      { name: "Mother of Runes", quantity: 1 },
    ],
  })
})

test("summary derives counted totals and released physical copies", () => {
  const swap = apply(
    { type: "toggle-cut", deckCardId: "m2" },
    { type: "toggle-cut", deckCardId: "m3" },
    { type: "toggle-considering-add", deckCardId: "k1" },
  )

  assert.deepEqual(deckSwapSummary(swap, deckCards), {
    addQuantity: 1,
    currentCount: 33,
    cutQuantity: 2,
    releasedCopies: 1,
    resultCount: 32,
    stagedCount: 3,
  })
})

test("released copies ignore basic lands and proxies", () => {
  assert.equal(releasedCopyCount(deckCards[3], 5), 0)
  assert.equal(
    releasedCopyCount(
      deckCard("p", "Proxy", "mainboard", {
        quantity: 2,
        allocationStatus: { state: "allocated", allocated: 2, proxyAllocated: 1 },
      }),
      2,
    ),
    1,
  )
})

test("cut candidates put Consider Cutting cards first and honor the filter", () => {
  const { flagged, rest } = swapCutCandidates(deckCards)
  assert.deepEqual(
    flagged.map((entry) => entry.id),
    ["m1"],
  )
  assert.deepEqual(
    rest.map((entry) => entry.id),
    ["m3", "m2"],
  )

  assert.deepEqual(
    swapCutCandidates(deckCards, "sol").rest.map((entry) => entry.id),
    ["m2"],
  )
})

test("legality diff matches issues by code and card, not message", () => {
  const before = {
    status: "illegal",
    issues: [
      { code: "commander_deck_size", message: "this deck has 99.", cardName: null },
      {
        code: "commander_color_identity",
        message: "Fervent Charge off-color",
        cardName: "Fervent Charge",
      },
    ],
  }
  const after = {
    status: "illegal",
    issues: [
      { code: "commander_deck_size", message: "this deck has 101.", cardName: null },
      { code: "card_legality", message: "Dockside is banned", cardName: "Dockside Extortionist" },
    ],
  }

  const diff = diffLegalityIssues(before, after)
  assert.deepEqual(
    diff.introduced.map((issue) => issue.cardName),
    ["Dockside Extortionist"],
  )
  assert.deepEqual(
    diff.resolved.map((issue) => issue.cardName),
    ["Fervent Charge"],
  )
  assert.deepEqual(
    diff.persisting.map((issue) => issue.message),
    ["this deck has 101."],
  )
})
