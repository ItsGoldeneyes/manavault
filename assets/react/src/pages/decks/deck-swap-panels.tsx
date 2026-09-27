import { Box, Check, Layers, Minus, Plus, Scissors, type LucideIcon } from "lucide-react"
import { useState, type FormEvent, type ReactNode } from "react"

import { CardNameSearchField } from "../../components/card-name-search-field"
import { Input } from "../../components/ui/input"
import { ManaSymbol } from "../../components/ui/mana-symbols"
import { cn } from "../../lib/utils"
import { cardImageUrl } from "./deck-card-model"
import type { DeckCardEntry } from "./deck-types"

function ManaCost({ cost }: { cost?: string | null }) {
  const symbols = cost?.match(/\{[^}]+\}/g) ?? []
  if (!symbols.length) return null

  return (
    <span className="inline-flex shrink-0 items-center" aria-label={`Mana cost ${cost}`}>
      {symbols.map((symbol, index) => (
        <ManaSymbol key={`${symbol}-${index}`} symbol={symbol} className="h-3.5 w-3.5" />
      ))}
    </span>
  )
}

function CandidateRow({
  deckCard,
  kind,
  onToggle,
  staged,
}: {
  deckCard: DeckCardEntry
  kind: "cut" | "add"
  onToggle: () => void
  staged: boolean
}) {
  const name = deckCard.card?.name || "Unknown card"
  const artUrl = cardImageUrl(deckCard, "artCropUrl")
  const IdleIcon = kind === "cut" ? Minus : Plus
  const StagedIcon = kind === "cut" ? Scissors : Check

  return (
    <li>
      <button
        type="button"
        aria-pressed={staged}
        aria-label={`${kind === "cut" ? "Cut" : "Bring in"} ${name}`}
        className={cn(
          "group flex w-full items-center gap-3 rounded-field px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          staged
            ? kind === "cut"
              ? "bg-error/10 hover:bg-error/15"
              : "bg-success/10 hover:bg-success/15"
            : "hover:bg-base-200/80",
        )}
        onClick={onToggle}
      >
        <span className="relative h-8 w-11 shrink-0 overflow-hidden rounded-[4px] bg-base-300">
          {artUrl ? (
            <img
              src={artUrl}
              alt=""
              loading="lazy"
              className={cn(
                "h-full w-full object-cover transition-[filter,opacity]",
                staged && kind === "cut" && "opacity-50 grayscale",
              )}
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-bold",
              staged && kind === "cut" && "text-base-content/55 line-through decoration-error/70",
            )}
          >
            {name}
          </span>
          <span className="block truncate text-xs text-base-content/55">
            {deckCard.card?.typeLine}
          </span>
        </span>
        {deckCard.quantity > 1 ? (
          <span className="shrink-0 font-mono text-xs font-black tabular-nums text-base-content/60">
            ×{deckCard.quantity}
          </span>
        ) : null}
        <ManaCost cost={deckCard.card?.manaCost} />
        <span
          aria-hidden="true"
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors",
            staged
              ? kind === "cut"
                ? "bg-error text-error-content"
                : "bg-success text-success-content"
              : "text-base-content/30 group-hover:bg-base-300 group-hover:text-base-content/70",
          )}
        >
          {staged ? <StagedIcon className="h-3.5 w-3.5" /> : <IdleIcon className="h-3.5 w-3.5" />}
        </span>
      </button>
    </li>
  )
}

function CandidateSection({
  children,
  count,
  empty,
  icon: Icon,
  iconClassName,
  title,
}: {
  children: ReactNode
  count: number
  empty?: string
  icon: LucideIcon
  iconClassName?: string
  title: string
}) {
  return (
    <section aria-label={title} className="py-2">
      <h3 className="flex items-center gap-2 px-2 pb-1.5 text-[0.6875rem] font-black uppercase tracking-[0.16em] text-base-content/55">
        <Icon className={cn("h-3.5 w-3.5", iconClassName)} aria-hidden="true" />
        {title}
        <span className="font-mono tabular-nums text-base-content/40">{count}</span>
      </h3>
      {count ? (
        <ul className="space-y-0.5">{children}</ul>
      ) : empty ? (
        <p className="px-2 py-2 text-xs text-base-content/55">{empty}</p>
      ) : null}
    </section>
  )
}

function PanelHeader({
  children,
  icon: Icon,
  iconClassName,
  title,
}: {
  children: ReactNode
  icon: LucideIcon
  iconClassName: string
  title: string
}) {
  return (
    <div className="space-y-2.5 border-b border-base-300 px-3 py-3">
      <h2 className="flex items-center gap-2 text-sm font-black">
        <Icon className={cn("h-4 w-4", iconClassName)} aria-hidden="true" />
        {title}
      </h2>
      {children}
    </div>
  )
}

export function SwapCutPanel({
  flagged,
  filter,
  onFilterChange,
  onToggle,
  rest,
  stagedIds,
}: {
  flagged: DeckCardEntry[]
  filter: string
  onFilterChange: (value: string) => void
  onToggle: (deckCardId: string) => void
  rest: DeckCardEntry[]
  stagedIds: Set<string>
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={Scissors} iconClassName="text-error" title="Cut from deck">
        <Input
          aria-label="Filter mainboard"
          className="input-sm h-9 text-sm"
          placeholder="Filter mainboard"
          type="search"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
        <CandidateSection
          count={flagged.length}
          empty={
            filter
              ? undefined
              : "No cards tagged Consider Cutting. Tag cards on the deck page to shortlist them here."
          }
          icon={Scissors}
          iconClassName="text-warning"
          title="Consider cutting"
        >
          {flagged.map((deckCard) => (
            <CandidateRow
              key={deckCard.id}
              deckCard={deckCard}
              kind="cut"
              staged={stagedIds.has(deckCard.id)}
              onToggle={() => onToggle(deckCard.id)}
            />
          ))}
        </CandidateSection>
        <CandidateSection
          count={rest.length}
          empty={filter ? "No mainboard cards match that filter." : undefined}
          icon={Layers}
          title="Mainboard"
        >
          {rest.map((deckCard) => (
            <CandidateRow
              key={deckCard.id}
              deckCard={deckCard}
              kind="cut"
              staged={stagedIds.has(deckCard.id)}
              onToggle={() => onToggle(deckCard.id)}
            />
          ))}
        </CandidateSection>
      </div>
    </div>
  )
}

export function SwapAddPanel({
  considering,
  onSearchCard,
  onToggle,
  stagedIds,
}: {
  considering: DeckCardEntry[]
  onSearchCard: (name: string) => void
  onToggle: (deckCardId: string) => void
  stagedIds: Set<string>
}) {
  const [query, setQuery] = useState("")

  function stage(name: string) {
    if (!name.trim()) return
    onSearchCard(name)
    setQuery("")
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    stage(query)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={Plus} iconClassName="text-success" title="Bring in">
        <form onSubmit={submit}>
          <CardNameSearchField
            aria-label="Search any card to add"
            className="input-sm h-9 text-sm"
            placeholder="Search any card to add"
            recordSubmitAsSearch={false}
            selectFirstSuggestionOnEnter
            value={query}
            onSuggestionSelect={stage}
            onValueChange={setQuery}
          />
        </form>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
        <CandidateSection
          count={considering.length}
          empty="The Considering board is empty. Search above to add any card."
          icon={Box}
          iconClassName="text-info"
          title="Considering"
        >
          {considering.map((deckCard) => (
            <CandidateRow
              key={deckCard.id}
              deckCard={deckCard}
              kind="add"
              staged={stagedIds.has(deckCard.id)}
              onToggle={() => onToggle(deckCard.id)}
            />
          ))}
        </CandidateSection>
      </div>
    </div>
  )
}
