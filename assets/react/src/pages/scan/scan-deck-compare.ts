/**
 * Comparing the scanned list with a deck, through the deck diff (`deckDiff`). Pure, so the
 * list text and the scan-side summary are unit-tested.
 *
 * The scan list is sent as the diff's "other" list, so its adds are scanned cards the deck lacks,
 * its cuts are deck cards nobody scanned, and a change is a card in both at different counts.
 */

import type { DeckDiffMutation } from "../../gql/graphql"
import { TOKEN_LAYOUTS } from "./recognition/pipeline.ts"
import type { ScanEntry } from "./scan-list"

type DeckDiff = NonNullable<DeckDiffMutation["deckDiff"]>

export interface CompareRow {
  cardName: string
  quantity: number
  /** The catalog has no card by this name (a misread or mistyped scan). */
  unrecognized?: true
}

/** The deck diff read from the scan's side: what the deck still needs, and what it doesn't use. */
export interface ScanDeckComparison {
  /** Deck cards (copies) the scan covers. */
  matched: number
  /** Deck card copies in total, considering zone left out. */
  deckTotal: number
  /** Deck cards the scan has fewer copies of than the deck, with how many are short. */
  missing: CompareRow[]
  /** Scanned cards the deck doesn't use, or extra copies beyond what it runs. */
  extra: CompareRow[]
}

/** What the deck diff is given: one `N Name` line per card, and what was left out. */
export interface ScanCompareList {
  text: string
  /** Copies in `text`. */
  total: number
  /** Token and emblem copies left out: the diff's name lookup never resolves them. */
  tokens: number
}

/**
 * The scanned cards as decklist text for the deck diff, oldest scan first. Copies are summed per
 * card name, which is all the diff matches on: the text parser keeps the larger quantity of two
 * identical lines, so one line per scan entry would lose copies scanned at different times.
 */
export function scanCompareList(
  entries: Pick<ScanEntry, "name" | "quantity" | "layout">[],
): ScanCompareList {
  const quantities = new Map<string, number>()
  let tokens = 0
  for (const entry of [...entries].reverse()) {
    if (entry.layout && TOKEN_LAYOUTS.has(entry.layout)) {
      tokens += entry.quantity
      continue
    }
    quantities.set(entry.name, (quantities.get(entry.name) ?? 0) + entry.quantity)
  }
  let total = 0
  const lines: string[] = []
  for (const [name, quantity] of quantities) {
    total += quantity
    lines.push(`${quantity} ${name}`)
  }
  return { text: lines.join("\n"), total, tokens }
}

/** Summarizes a diff of `scannedTotal` copies (the `total` of the list that was sent). */
export function summarizeScanDiff(
  diff: Pick<DeckDiff, "adds" | "cuts" | "changes">,
  scannedTotal: number,
): ScanDeckComparison {
  const missing: CompareRow[] = diff.cuts.map(({ cardName, quantity }) => ({ cardName, quantity }))
  // A name the catalog doesn't know comes back as an add with no oracle id (and in `unrecognized`).
  const extra: CompareRow[] = diff.adds.map(({ cardName, quantity, oracleId }) =>
    oracleId ? { cardName, quantity } : { cardName, quantity, unrecognized: true },
  )
  for (const change of diff.changes) {
    const delta = change.toQuantity - change.fromQuantity
    if (delta < 0) missing.push({ cardName: change.cardName, quantity: -delta })
    else if (delta > 0) extra.push({ cardName: change.cardName, quantity: delta })
  }
  const byName = (left: CompareRow, right: CompareRow) =>
    left.cardName.localeCompare(right.cardName)
  missing.sort(byName)
  extra.sort(byName)

  const matched = Math.max(0, scannedTotal - copies(extra))
  return { matched, deckTotal: matched + copies(missing), missing, extra }
}

export function copies(rows: CompareRow[]) {
  return rows.reduce((total, row) => total + row.quantity, 0)
}
