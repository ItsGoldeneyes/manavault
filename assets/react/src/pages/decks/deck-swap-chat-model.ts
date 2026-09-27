import type { DeckCardEntry } from "./deck-types"
import { swapAddKey, type DeckSwap, type DeckSwapAction } from "./deck-swap-model.ts"

// Maps AI-suggested card names onto the Swap cards staging model. Chips are
// derived from the current decklist and staged swap on every render, so a
// chip always reflects whether its card is staged right now.

export type SwapChip = {
  kind: "cut" | "add"
  name: string
  // null when the card cannot be staged, e.g. a cut that is not in the mainboard.
  toggle: DeckSwapAction | null
  staged: boolean
}

function nameKey(name: string) {
  return name.trim().toLocaleLowerCase()
}

function findByName(deckCards: DeckCardEntry[], zone: string, name: string) {
  const key = nameKey(name)
  return deckCards.find(
    (deckCard) => deckCard.zone === zone && deckCard.card?.name.toLocaleLowerCase() === key,
  )
}

export function cutChip(name: string, deckCards: DeckCardEntry[], swap: DeckSwap): SwapChip {
  const deckCard = findByName(deckCards, "mainboard", name)
  if (!deckCard) return { kind: "cut", name, toggle: null, staged: false }

  return {
    kind: "cut",
    name,
    toggle: { type: "toggle-cut", deckCardId: deckCard.id },
    staged: swap.cuts.some((cut) => cut.deckCardId === deckCard.id),
  }
}

// Suggested adds already on the Considering board stage as moves from
// Considering; anything else stages as a new card by name.
export function addChip(name: string, deckCards: DeckCardEntry[], swap: DeckSwap): SwapChip {
  const considering = findByName(deckCards, "considering", name)
  const key = considering
    ? swapAddKey({ source: "considering", deckCardId: considering.id, quantity: 1 })
    : swapAddKey({ source: "search", name, quantity: 1 })
  const staged = swap.adds.some((add) => swapAddKey(add) === key)

  if (findByName(deckCards, "mainboard", name) && !staged) {
    return { kind: "add", name, toggle: null, staged: false }
  }

  return {
    kind: "add",
    name,
    staged,
    toggle: staged
      ? { type: "remove-add", key }
      : considering
        ? { type: "toggle-considering-add", deckCardId: considering.id }
        : { type: "add-by-name", name },
  }
}

export function answerChips(
  answer: { recommendedCuts: string[]; recommendedAdditions: string[] },
  deckCards: DeckCardEntry[],
  swap: DeckSwap,
) {
  return [
    ...answer.recommendedCuts.map((name) => cutChip(name, deckCards, swap)),
    ...answer.recommendedAdditions.map((name) => addChip(name, deckCards, swap)),
  ]
}

export function stageAllActions(chips: SwapChip[]) {
  return chips.flatMap((chip) => (chip.toggle && !chip.staged ? [chip.toggle] : []))
}

export function swapContextNames(swap: DeckSwap, deckCardsById: Map<string, DeckCardEntry>) {
  return {
    cuts: swap.cuts.flatMap((cut) => {
      const name = deckCardsById.get(cut.deckCardId)?.card?.name
      return name ? [name] : []
    }),
    adds: swap.adds.flatMap((add) => {
      const name =
        add.source === "search" ? add.name : deckCardsById.get(add.deckCardId)?.card?.name
      return name ? [name] : []
    }),
  }
}

export function starterPrompts(swap: DeckSwap) {
  const prompts: string[] = []
  if (swap.cuts.length) prompts.push("Suggest replacements for my cuts")
  if (swap.adds.length) prompts.push("What should I cut to make room for these adds?")
  if (!swap.cuts.length && !swap.adds.length) {
    prompts.push("What are the weakest cards in this deck?")
    prompts.push("What upgrades fit this deck's plan?")
  } else {
    prompts.push("Is this swap an upgrade?")
  }
  return prompts
}

export function newSwapThreadId() {
  return `swap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
