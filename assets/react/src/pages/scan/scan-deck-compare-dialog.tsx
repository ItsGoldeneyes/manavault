import { useMutation, useQuery } from "@apollo/client/react"
import { ArrowLeft, Check, Copy, Search } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import type { DeckDiffMutation } from "../../gql/graphql"
import { copyTextToClipboard } from "../../lib/clipboard"
import { cn, pluralize, present, titleize } from "../../lib/utils"
import { CardDeckOptionsDocument } from "../cards/data"
import { DeckDiffDocument } from "../decks/deck-compare-documents"
import { scanListText, totalQuantity, type ScanEntry } from "./scan-list"

type DeckDiff = NonNullable<DeckDiffMutation["deckDiff"]>

interface CompareRow {
  cardName: string
  quantity: number
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

/**
 * The scan list is sent as the "other" list, so the diff's adds are scanned cards the deck lacks,
 * its cuts are deck cards nobody scanned, and a change is a card in both at different counts.
 */
export function summarizeScanDiff(diff: DeckDiff, scannedTotal: number): ScanDeckComparison {
  const missing: CompareRow[] = diff.cuts.map(({ cardName, quantity }) => ({ cardName, quantity }))
  const extra: CompareRow[] = diff.adds.map(({ cardName, quantity }) => ({ cardName, quantity }))
  for (const change of diff.changes) {
    const delta = change.toQuantity - change.fromQuantity
    if (delta < 0) missing.push({ cardName: change.cardName, quantity: -delta })
    else if (delta > 0) extra.push({ cardName: change.cardName, quantity: delta })
  }
  const byName = (left: CompareRow, right: CompareRow) =>
    left.cardName.localeCompare(right.cardName)
  missing.sort(byName)
  extra.sort(byName)

  const sum = (rows: CompareRow[]) => rows.reduce((total, row) => total + row.quantity, 0)
  // Unrecognized lines never reach the diff, so their copies can't count as matched.
  const unrecognized = diff.unrecognized.reduce(
    (total, line) => total + Number(/^\s*(\d+)x?\s/i.exec(line)?.[1] ?? 1),
    0,
  )
  const matched = Math.max(0, scannedTotal - sum(extra) - unrecognized)
  return { matched, deckTotal: matched + sum(missing), missing, extra }
}

export function ScanDeckCompareDialog({
  open,
  entries,
  onClose,
}: {
  open: boolean
  entries: ScanEntry[]
  onClose: () => void
}) {
  const [deck, setDeck] = useState<{ id: string; name: string } | null>(null)
  const [runDiff, diff] = useMutation(DeckDiffDocument)

  function choose(next: { id: string; name: string }) {
    setDeck(next)
    void runDiff({ variables: { deckId: next.id, text: scanListText(entries) } }).catch(
      () => undefined,
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="scan-sheet sm:max-w-lg" labelledBy="scan-compare-title">
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-2">
            {deck ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Choose another deck"
                onClick={() => setDeck(null)}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
            <div className="min-w-0">
              <DialogTitle id="scan-compare-title">Compare to a deck</DialogTitle>
              <p className="mt-1 truncate text-sm text-base-content/70">
                {deck ? deck.name : "Pick the deck to check the scanned cards against."}
              </p>
            </div>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {deck ? (
            diff.loading ? (
              <p className="px-5 py-10 text-center text-sm text-base-content/70" role="status">
                Comparing…
              </p>
            ) : diff.error ? (
              <p className="m-5 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {diff.error.message || "Could not compare with that deck."}
              </p>
            ) : diff.data?.deckDiff ? (
              <ComparisonResult
                diff={diff.data.deckDiff}
                comparison={summarizeScanDiff(diff.data.deckDiff, totalQuantity(entries))}
              />
            ) : null
          ) : (
            <DeckChoices onChoose={choose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeckChoices({ onChoose }: { onChoose: (deck: { id: string; name: string }) => void }) {
  const [query, setQuery] = useState("")
  const { data, loading, error } = useQuery(CardDeckOptionsDocument, {
    fetchPolicy: "cache-and-network",
  })
  const decks = (data?.decks.edges ?? []).map((edge) => edge?.node).filter(present)
  const needle = query.trim().toLowerCase()
  const visible = needle ? decks.filter((deck) => deck.name.toLowerCase().includes(needle)) : decks

  return (
    <>
      <div className="border-b border-base-300 px-5 py-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/60"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search decks"
            aria-label="Search decks"
            className="pl-9"
          />
        </label>
      </div>
      {!data && loading ? (
        <p className="px-5 py-10 text-center text-sm text-base-content/70" role="status">
          Loading decks…
        </p>
      ) : !data && error ? (
        <p className="m-5 rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          Could not load your decks.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-base-content/70">
          {decks.length === 0 ? "You have no decks yet." : `No deck matches “${query}”.`}
        </p>
      ) : (
        <ul className="divide-y divide-base-300">
          {visible.map((deck) => (
            <li key={deck.id}>
              <button
                type="button"
                onClick={() => onChoose({ id: deck.id, name: deck.name })}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-none"
              >
                <span className="min-w-0 truncate font-bold">{deck.name}</span>
                <span className="shrink-0 text-xs text-base-content/70">
                  {titleize(deck.format)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ComparisonResult({
  diff,
  comparison,
}: {
  diff: DeckDiff
  comparison: ScanDeckComparison
}) {
  const { matched, deckTotal, missing, extra } = comparison
  const complete = missing.length === 0

  return (
    <div className="space-y-5 p-5">
      <div
        className={cn(
          "rounded-box border p-3 text-sm",
          complete ? "border-success/40 bg-success/10" : "border-base-300 bg-base-200/60",
        )}
      >
        <p>
          <span className="font-mono font-bold">
            {matched}/{deckTotal}
          </span>{" "}
          deck cards scanned
        </p>
        {complete ? (
          <p className="mt-1 flex items-center gap-1 font-bold text-success">
            <Check className="h-4 w-4" aria-hidden="true" />
            Every card in the deck is in the scan.
          </p>
        ) : null}
      </div>

      <CompareGroup
        title="Missing from scan"
        hint="In the deck but not scanned (or fewer copies)."
        tone="error"
        rows={missing}
      />
      <CompareGroup
        title="Not in deck"
        hint="Scanned but the deck doesn't run it (or extra copies)."
        tone="warning"
        rows={extra}
      />

      {diff.unrecognized.length ? (
        <details>
          <summary className="cursor-pointer text-sm text-warning">
            {pluralize(diff.unrecognized.length, "unrecognized card")}
          </summary>
          <ul className="mt-2 space-y-0.5 pl-4 text-sm text-base-content/70">
            {diff.unrecognized.map((line, index) => (
              <li key={`${line}-${index}`} className="list-disc">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function CompareGroup({
  title,
  hint,
  tone,
  rows,
}: {
  title: string
  hint: string
  tone: "error" | "warning"
  rows: CompareRow[]
}) {
  const [copied, setCopied] = useState(false)
  if (!rows.length) return null
  const count = rows.reduce((total, row) => total + row.quantity, 0)

  async function copy() {
    const text = rows.map((row) => `${row.quantity}x ${row.cardName}`).join("\n") + "\n"
    if (await copyTextToClipboard(text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <section className="space-y-1.5" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3
            className={cn(
              "text-xs font-black uppercase tracking-[0.18em]",
              tone === "error" ? "text-error" : "text-warning",
            )}
          >
            {title} ({count})
          </h3>
          <p className="text-xs text-base-content/70">{hint}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => void copy()}
          aria-label={`Copy ${title.toLowerCase()}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 text-sm">
        {rows.map((row) => (
          <li key={row.cardName} className="flex items-center gap-3 px-3 py-1.5">
            <span className="w-6 shrink-0 text-right font-mono font-bold">{row.quantity}</span>
            <span className="min-w-0 truncate">{row.cardName}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
