import test from "node:test"
import assert from "node:assert/strict"

import {
  addChip,
  answerChips,
  cutChip,
  stageAllActions,
  starterPrompts,
  swapContextNames,
} from "../src/pages/decks/deck-swap-chat-model.ts"
import { EMPTY_DECK_SWAP, deckSwapReducer } from "../src/pages/decks/deck-swap-model.ts"

const deckCards = [
  { id: "m1", zone: "mainboard", quantity: 1, card: { name: "Pia Nalaar" } },
  { id: "m2", zone: "mainboard", quantity: 1, card: { name: "Sol Ring" } },
  { id: "k1", zone: "considering", quantity: 1, card: { name: "Grand Abolisher" } },
]

test("cut chips toggle mainboard cards and flag cards that are not in the mainboard", () => {
  assert.deepEqual(cutChip("pia nalaar", deckCards, EMPTY_DECK_SWAP), {
    kind: "cut",
    name: "pia nalaar",
    toggle: { type: "toggle-cut", deckCardId: "m1" },
    staged: false,
  })
  assert.equal(cutChip("Grand Abolisher", deckCards, EMPTY_DECK_SWAP).toggle, null)

  const staged = deckSwapReducer(EMPTY_DECK_SWAP, { type: "toggle-cut", deckCardId: "m1" })
  assert.equal(cutChip("Pia Nalaar", deckCards, staged).staged, true)
})

test("add chips move Considering cards and add other names by search", () => {
  assert.deepEqual(addChip("Grand Abolisher", deckCards, EMPTY_DECK_SWAP).toggle, {
    type: "toggle-considering-add",
    deckCardId: "k1",
  })
  assert.deepEqual(addChip("Mother of Runes", deckCards, EMPTY_DECK_SWAP).toggle, {
    type: "add-by-name",
    name: "Mother of Runes",
  })
  assert.equal(addChip("Sol Ring", deckCards, EMPTY_DECK_SWAP).toggle, null)

  const staged = deckSwapReducer(EMPTY_DECK_SWAP, { type: "add-by-name", name: "Mother of Runes" })
  assert.deepEqual(addChip("Mother of Runes", deckCards, staged), {
    kind: "add",
    name: "Mother of Runes",
    staged: true,
    toggle: { type: "remove-add", key: "search:mother of runes" },
  })
})

test("stage all only returns actions for stageable, unstaged chips", () => {
  const swap = deckSwapReducer(EMPTY_DECK_SWAP, { type: "toggle-cut", deckCardId: "m1" })
  const chips = answerChips(
    {
      recommendedCuts: ["Pia Nalaar", "Sol Ring", "Not In Deck"],
      recommendedAdditions: ["Grand Abolisher"],
    },
    deckCards,
    swap,
  )

  assert.deepEqual(stageAllActions(chips), [
    { type: "toggle-cut", deckCardId: "m2" },
    { type: "toggle-considering-add", deckCardId: "k1" },
  ])
})

test("swap context and starter prompts follow the staged swap", () => {
  const byId = new Map(deckCards.map((deckCard) => [deckCard.id, deckCard]))
  const swap = [
    { type: "toggle-cut", deckCardId: "m1" },
    { type: "toggle-considering-add", deckCardId: "k1" },
    { type: "add-by-name", name: "Mother of Runes" },
  ].reduce(deckSwapReducer, EMPTY_DECK_SWAP)

  assert.deepEqual(swapContextNames(swap, byId), {
    cuts: ["Pia Nalaar"],
    adds: ["Grand Abolisher", "Mother of Runes"],
  })
  assert.deepEqual(starterPrompts(swap), [
    "Suggest replacements for my cuts",
    "What should I cut to make room for these adds?",
    "Is this swap an upgrade?",
  ])
  assert.deepEqual(starterPrompts(EMPTY_DECK_SWAP), [
    "What are the weakest cards in this deck?",
    "What upgrades fit this deck's plan?",
  ])
})
