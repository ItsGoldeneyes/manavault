import type { DeckCardEntry, DeckLegality } from "./deck-types"

// Staging model for the Swap cards workbench. The staged swap is the only
// state; counts, released copies, GraphQL input, and legality diffs are all
// derived from it plus the current decklist.

export type SwapCutDestination = "remove" | "considering"

export type SwapCut = {
  deckCardId: string
  destination: SwapCutDestination
  quantity: number
}

export type SwapAdd =
  | { source: "considering"; deckCardId: string; quantity: number }
  | { source: "search"; name: string; quantity: number }

export type DeckSwap = {
  adds: SwapAdd[]
  cuts: SwapCut[]
}

export type DeckSwapAction =
  | { type: "toggle-cut"; deckCardId: string }
  | { type: "set-cut-quantity"; deckCardId: string; quantity: number }
  | { type: "set-cut-destination"; deckCardId: string; destination: SwapCutDestination }
  | { type: "toggle-considering-add"; deckCardId: string }
  | { type: "add-by-name"; name: string }
  | { type: "set-add-quantity"; key: string; quantity: number }
  | { type: "remove-add"; key: string }
  | { type: "reset" }

export type SwapIssue = {
  cardName?: string | null
  code?: string | null
  message: string
}

export const EMPTY_DECK_SWAP: DeckSwap = { adds: [], cuts: [] }

export function swapAddKey(add: SwapAdd) {
  return add.source === "considering"
    ? `considering:${add.deckCardId}`
    : `search:${add.name.toLocaleLowerCase()}`
}

export function deckSwapReducer(swap: DeckSwap, action: DeckSwapAction): DeckSwap {
  switch (action.type) {
    case "toggle-cut":
      return swap.cuts.some((cut) => cut.deckCardId === action.deckCardId)
        ? { ...swap, cuts: swap.cuts.filter((cut) => cut.deckCardId !== action.deckCardId) }
        : {
            ...swap,
            cuts: [
              ...swap.cuts,
              { deckCardId: action.deckCardId, destination: "remove", quantity: 1 },
            ],
          }
    case "set-cut-quantity":
      return {
        ...swap,
        cuts:
          action.quantity > 0
            ? swap.cuts.map((cut) =>
                cut.deckCardId === action.deckCardId ? { ...cut, quantity: action.quantity } : cut,
              )
            : swap.cuts.filter((cut) => cut.deckCardId !== action.deckCardId),
      }
    case "set-cut-destination":
      return {
        ...swap,
        cuts: swap.cuts.map((cut) =>
          cut.deckCardId === action.deckCardId ? { ...cut, destination: action.destination } : cut,
        ),
      }
    case "toggle-considering-add": {
      const key = swapAddKey({ source: "considering", deckCardId: action.deckCardId, quantity: 1 })
      return swap.adds.some((add) => swapAddKey(add) === key)
        ? { ...swap, adds: swap.adds.filter((add) => swapAddKey(add) !== key) }
        : {
            ...swap,
            adds: [
              ...swap.adds,
              { source: "considering", deckCardId: action.deckCardId, quantity: 1 },
            ],
          }
    }
    case "add-by-name": {
      const name = action.name.trim()
      if (!name) return swap
      const key = swapAddKey({ source: "search", name, quantity: 1 })
      const existing = swap.adds.find((add) => swapAddKey(add) === key)
      return existing
        ? {
            ...swap,
            adds: swap.adds.map((add) =>
              add === existing ? { ...add, quantity: add.quantity + 1 } : add,
            ),
          }
        : { ...swap, adds: [...swap.adds, { source: "search", name, quantity: 1 }] }
    }
    case "set-add-quantity":
      return {
        ...swap,
        adds:
          action.quantity > 0
            ? swap.adds.map((add) =>
                swapAddKey(add) === action.key ? { ...add, quantity: action.quantity } : add,
              )
            : swap.adds.filter((add) => swapAddKey(add) !== action.key),
      }
    case "remove-add":
      return { ...swap, adds: swap.adds.filter((add) => swapAddKey(add) !== action.key) }
    case "reset":
      return EMPTY_DECK_SWAP
  }
}

// A searched name that is already on the Considering board moves that card
// instead of adding a second copy of it.
export function stageSearchedCardAction(
  name: string,
  consideringCards: DeckCardEntry[],
): DeckSwapAction {
  const key = name.trim().toLocaleLowerCase()
  const match = consideringCards.find((deckCard) => deckCard.card?.name.toLocaleLowerCase() === key)
  return match
    ? { type: "toggle-considering-add", deckCardId: match.id }
    : { type: "add-by-name", name }
}

export function isDeckSwapEmpty(swap: DeckSwap) {
  return swap.cuts.length === 0 && swap.adds.length === 0
}

export function deckSwapInput(swap: DeckSwap) {
  return {
    cuts: swap.cuts.map((cut) => ({
      deckCardId: cut.deckCardId,
      quantity: cut.quantity,
      destination:
        cut.destination === "considering" ? ("CONSIDERING" as const) : ("REMOVE" as const),
    })),
    adds: swap.adds.map((add) =>
      add.source === "considering"
        ? { deckCardId: add.deckCardId, quantity: add.quantity }
        : { name: add.name, quantity: add.quantity },
    ),
  }
}

// Physical copies allocated to the deck card that no longer fit once the cut
// quantity leaves the deck. Basic lands report a virtual allocation and
// proxies are not stored copies, so neither counts as released.
export function releasedCopyCount(deckCard: DeckCardEntry, cutQuantity: number) {
  const status = deckCard.allocationStatus
  if (!status || status.state === "basic_land") return 0

  const physical = Math.max(status.allocated - status.proxyAllocated, 0)
  const remaining = Math.max(deckCard.quantity - cutQuantity, 0)
  return Math.max(physical - remaining, 0)
}

export function deckSwapSummary(swap: DeckSwap, deckCards: DeckCardEntry[]) {
  const byId = new Map(deckCards.map((deckCard) => [deckCard.id, deckCard]))
  const currentCount = deckCards
    .filter((deckCard) => deckCard.zone !== "considering")
    .reduce((total, deckCard) => total + deckCard.quantity, 0)
  const cutQuantity = swap.cuts.reduce((total, cut) => total + cut.quantity, 0)
  const addQuantity = swap.adds.reduce((total, add) => total + add.quantity, 0)
  const releasedCopies = swap.cuts.reduce((total, cut) => {
    const deckCard = byId.get(cut.deckCardId)
    return deckCard ? total + releasedCopyCount(deckCard, cut.quantity) : total
  }, 0)

  return {
    addQuantity,
    currentCount,
    cutQuantity,
    releasedCopies,
    resultCount: currentCount - cutQuantity + addQuantity,
    stagedCount: swap.cuts.length + swap.adds.length,
  }
}

function byCardName(left: DeckCardEntry, right: DeckCardEntry) {
  return (left.card?.name || "").localeCompare(right.card?.name || "")
}

export function swapCutCandidates(deckCards: DeckCardEntry[], filter = "") {
  const query = filter.trim().toLocaleLowerCase()
  const mainboard = deckCards
    .filter((deckCard) => deckCard.zone === "mainboard")
    .filter((deckCard) => !query || deckCard.card?.name.toLocaleLowerCase().includes(query))
    .sort(byCardName)

  return {
    flagged: mainboard.filter((deckCard) => deckCard.tag === "consider_cutting"),
    rest: mainboard.filter((deckCard) => deckCard.tag !== "consider_cutting"),
  }
}

export function swapAddCandidates(deckCards: DeckCardEntry[]) {
  return deckCards.filter((deckCard) => deckCard.zone === "considering").sort(byCardName)
}

function issueKey(issue: SwapIssue) {
  return `${issue.code ?? ""}:${issue.cardName ?? ""}`
}

function presentIssues(legality: DeckLegality): SwapIssue[] {
  return (legality?.issues ?? []).flatMap((issue) =>
    issue?.message ? [{ cardName: issue.cardName, code: issue.code, message: issue.message }] : [],
  )
}

// Issues are matched by code and card rather than message, so a deck-size
// issue whose count changes stays "persisting" instead of flipping between
// resolved and introduced.
export function diffLegalityIssues(before: DeckLegality, after: DeckLegality) {
  const beforeIssues = presentIssues(before)
  const afterIssues = presentIssues(after)
  const beforeKeys = new Set(beforeIssues.map(issueKey))
  const afterKeys = new Set(afterIssues.map(issueKey))

  return {
    introduced: afterIssues.filter((issue) => !beforeKeys.has(issueKey(issue))),
    persisting: afterIssues.filter((issue) => beforeKeys.has(issueKey(issue))),
    resolved: beforeIssues.filter((issue) => !afterKeys.has(issueKey(issue))),
  }
}
