import { useApolloClient, useMutation, useQuery } from "@apollo/client/react"
import { ArrowRightLeft, ShieldAlert, ShieldCheck } from "lucide-react"
import { useEffect, useMemo, useReducer, useState, type ReactNode } from "react"

import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { useToast } from "../../components/ui/toast"
import { refetchActiveQueries } from "../../lib/apollo"
import { cn } from "../../lib/utils"
import { deckLegalityIssueCount } from "./deck-legality"
import { DeckSwapLedger, type SwapSummary } from "./deck-swap-ledger"
import type { SwapLegalityState } from "./deck-swap-legality"
import { ApplyDeckSwapDocument, DeckSwapPreviewDocument } from "./deck-swap-documents"
import {
  deckSwapInput,
  deckSwapReducer,
  deckSwapSummary,
  diffLegalityIssues,
  EMPTY_DECK_SWAP,
  isDeckSwapEmpty,
  stageSearchedCardAction,
  swapAddCandidates,
  swapCutCandidates,
  type DeckSwap,
} from "./deck-swap-model"
import { SwapAddPanel, SwapCutPanel } from "./deck-swap-panels"
import type { DeckCardEntry, DeckDetail } from "./deck-types"

const PREVIEW_DEBOUNCE_MS = 250

type MobileTab = "cut" | "add" | "review"
type PendingConfirm = "clear" | "close" | null

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}

function legalityStatus(status?: string | null): "legal" | "illegal" {
  return status === "legal" ? "legal" : "illegal"
}

function useSwapLegality(deck: DeckDetail, swap: DeckSwap): SwapLegalityState {
  const input = useMemo(() => deckSwapInput(swap), [swap])
  const debouncedInput = useDebouncedValue(input, PREVIEW_DEBOUNCE_MS)
  const debouncedEmpty = debouncedInput.cuts.length + debouncedInput.adds.length === 0
  const { data, error, loading, previousData } = useQuery(DeckSwapPreviewDocument, {
    variables: { deckId: deck.id, input: debouncedInput },
    skip: debouncedEmpty,
    fetchPolicy: "network-only",
  })

  if (isDeckSwapEmpty(swap)) {
    return {
      kind: "current",
      status: legalityStatus(deck.legality?.status),
      issueCount: deckLegalityIssueCount(deck.legality),
    }
  }

  const stale = loading || input !== debouncedInput
  if (error && !stale) return { kind: "error", message: error.message }

  const preview = (data ?? previousData)?.deckSwapPreview
  if (!preview) return { kind: "checking" }

  return {
    kind: "preview",
    ...diffLegalityIssues(deck.legality, preview.legality),
    stale,
    status: legalityStatus(preview.legality.status),
    unresolvedNames: preview.unresolvedNames,
  }
}

function MobileTabs({
  onChange,
  summary,
  swap,
  tab,
}: {
  onChange: (tab: MobileTab) => void
  summary: SwapSummary
  swap: DeckSwap
  tab: MobileTab
}) {
  const tabs = [
    { value: "cut", label: "Cut", count: swap.cuts.length },
    { value: "add", label: "Add", count: swap.adds.length },
    { value: "review", label: "Review", count: summary.stagedCount },
  ] as const

  return (
    <div
      role="tablist"
      aria-label="Swap sections"
      className="grid grid-cols-3 gap-1 border-b border-base-300 p-1.5 lg:hidden"
    >
      {tabs.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          id={`swap-tab-${item.value}`}
          aria-controls={`swap-panel-${item.value}`}
          aria-selected={tab === item.value}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-field text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            tab === item.value
              ? "bg-base-content text-base-100"
              : "text-base-content/65 hover:bg-base-200",
          )}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count ? (
            <span className="font-mono text-xs tabular-nums opacity-70">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

function SwapPanel({
  children,
  className,
  tab,
  value,
}: {
  children: ReactNode
  className?: string
  tab: MobileTab
  value: MobileTab
}) {
  return (
    <div
      id={`swap-panel-${value}`}
      aria-labelledby={`swap-tab-${value}`}
      className={cn(
        "min-h-0 min-w-0 flex-1 flex-col lg:flex",
        tab === value ? "flex" : "hidden",
        className,
      )}
    >
      {children}
    </div>
  )
}

function SwapFooter({
  applyError,
  canApply,
  isApplying,
  legality,
  onApply,
  onDiscard,
  summary,
}: {
  applyError: string | null
  canApply: boolean
  isApplying: boolean
  legality: SwapLegalityState
  onApply: () => void
  onDiscard: () => void
  summary: SwapSummary
}) {
  const willBeIllegal = legality.kind === "preview" && legality.status === "illegal"

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-base-300 px-4 py-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] sm:pb-3">
      <div className="min-w-0 flex-1 text-sm">
        {applyError ? (
          <p role="alert" className="text-error">
            {applyError}
          </p>
        ) : willBeIllegal ? (
          <p className="flex items-center gap-1.5 text-base-content/70">
            <ShieldAlert className="h-4 w-4 shrink-0 text-error" aria-hidden="true" />
            <span>The deck will be illegal after this swap. You can still apply it.</span>
          </p>
        ) : summary.stagedCount ? (
          <p
            className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs font-bold tabular-nums text-base-content/60 lg:hidden"
            aria-label={`${summary.cutQuantity} out, ${summary.addQuantity} in, ${summary.resultCount} cards after swap`}
          >
            −{summary.cutQuantity} +{summary.addQuantity} → {summary.resultCount}
            {legality.kind === "preview" && legality.status === "legal" && !legality.stale ? (
              <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            ) : null}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!summary.stagedCount || isApplying}
        onClick={onDiscard}
      >
        Discard
      </Button>
      <Button type="button" size="sm" disabled={!canApply} onClick={onApply}>
        <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
        {isApplying
          ? "Applying…"
          : summary.stagedCount
            ? `Apply ${summary.stagedCount} ${summary.stagedCount === 1 ? "change" : "changes"}`
            : "Apply swap"}
      </Button>
    </div>
  )
}

export function DeckSwapDialog({
  deck,
  deckCards,
  onClose,
}: {
  deck: DeckDetail
  deckCards: DeckCardEntry[]
  onClose: () => void
}) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [swap, dispatch] = useReducer(deckSwapReducer, EMPTY_DECK_SWAP)
  const [filter, setFilter] = useState("")
  const [tab, setTab] = useState<MobileTab>("cut")
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySwap, { loading: isApplying }] = useMutation(ApplyDeckSwapDocument)
  const deckCardsById = useMemo(
    () => new Map(deckCards.map((deckCard) => [deckCard.id, deckCard])),
    [deckCards],
  )
  const { flagged, rest } = useMemo(() => swapCutCandidates(deckCards, filter), [deckCards, filter])
  const considering = useMemo(() => swapAddCandidates(deckCards), [deckCards])
  const summary = deckSwapSummary(swap, deckCards)
  const legality = useSwapLegality(deck, swap)
  const stagedCutIds = useMemo(() => new Set(swap.cuts.map((cut) => cut.deckCardId)), [swap.cuts])
  const stagedAddIds = useMemo(
    () =>
      new Set(swap.adds.flatMap((add) => (add.source === "considering" ? [add.deckCardId] : []))),
    [swap.adds],
  )

  function requestClose() {
    if (isApplying) return
    if (isDeckSwapEmpty(swap)) onClose()
    else setPendingConfirm("close")
  }

  function apply() {
    setApplyError(null)
    const { cutQuantity, addQuantity } = summary

    void applySwap({ variables: { deckId: deck.id, input: deckSwapInput(swap) } })
      .then(() => {
        onClose()
        showToast(`Swapped ${cutQuantity} out and ${addQuantity} in`)
        return refetchActiveQueries(client)
      })
      .catch((error: unknown) =>
        setApplyError(error instanceof Error ? error.message : "Could not apply swap"),
      )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent
        className="flex max-w-[96rem] flex-col sm:h-[calc(100dvh-4rem)] sm:max-h-[60rem]"
        labelledBy="deck-swap-title"
      >
        <DialogHeader className="items-center py-3">
          <div className="min-w-0">
            <DialogTitle id="deck-swap-title">Swap cards</DialogTitle>
            <p className="truncate text-sm text-base-content/60">{deck.name}</p>
          </div>
          <DialogClose onClose={requestClose} />
        </DialogHeader>

        <MobileTabs onChange={setTab} summary={summary} swap={swap} tab={tab} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)_minmax(0,1fr)] lg:divide-x lg:divide-base-300">
          <SwapPanel tab={tab} value="cut">
            <SwapCutPanel
              filter={filter}
              flagged={flagged}
              rest={rest}
              stagedIds={stagedCutIds}
              onFilterChange={setFilter}
              onToggle={(deckCardId) => dispatch({ type: "toggle-cut", deckCardId })}
            />
          </SwapPanel>
          <SwapPanel tab={tab} value="review" className="bg-base-200/30">
            <DeckSwapLedger
              deckCardsById={deckCardsById}
              dispatch={dispatch}
              format={deck.format}
              legality={legality}
              summary={summary}
              swap={swap}
            />
          </SwapPanel>
          <SwapPanel tab={tab} value="add">
            <SwapAddPanel
              considering={considering}
              stagedIds={stagedAddIds}
              onSearchCard={(name) => dispatch(stageSearchedCardAction(name, considering))}
              onToggle={(deckCardId) => dispatch({ type: "toggle-considering-add", deckCardId })}
            />
          </SwapPanel>
        </div>

        <SwapFooter
          applyError={applyError}
          canApply={summary.stagedCount > 0 && !isApplying}
          isApplying={isApplying}
          legality={legality}
          summary={summary}
          onApply={apply}
          onDiscard={() => setPendingConfirm("clear")}
        />
      </DialogContent>
      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel={pendingConfirm === "close" ? "Discard and close" : "Clear staged"}
        destructive
        open={pendingConfirm !== null}
        title={pendingConfirm === "close" ? "Discard staged swap?" : "Clear staged changes?"}
        onConfirm={() => {
          dispatch({ type: "reset" })
          setApplyError(null)
          if (pendingConfirm === "close") onClose()
        }}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
      >
        {summary.stagedCount === 1
          ? "The staged change will be lost. The deck has not been changed."
          : `All ${summary.stagedCount} staged changes will be lost. The deck has not been changed.`}
      </ConfirmDialog>
    </Dialog>
  )
}
