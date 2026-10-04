import { useQuery } from "@apollo/client/react"
import { useEffect, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { pluralize } from "../../lib/utils"
import { CardNamePreview, FinishBadge } from "./auto-sort-summary-dialog"
import { CollectionBulkCleanDocument } from "./bulk-clean/documents"
import { formatCents } from "./sell-cards-list"

const SETTINGS_DEBOUNCE_MS = 300

type BulkCleanSettings = { maxPriceCents: number; minCopies: number; keepCopies: number }
type BulkCleanPull = {
  cardId: string
  cardName: string
  collectionItemId: string
  collectorNumber: string
  finish: string
  fromLocationId?: string | null
  fromLocationName: string
  imageUrl?: string | null
  ownedQuantity: number
  priceCents: number
  quantity: number
  setCode: string
}
type PullGroup = { key: string; title: string; subtitle: string; pulls: BulkCleanPull[] }

export function BulkCleanDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [maxPrice, setMaxPrice] = useState("0.20")
  const [minCopies, setMinCopies] = useState("10")
  const [keepCopies, setKeepCopies] = useState("4")
  const [groupBy, setGroupBy] = useState<"location" | "card">("location")
  const settings = parseSettings(maxPrice, minCopies, keepCopies)
  const [variables, setVariables] = useState<BulkCleanSettings>(
    settings ?? { maxPriceCents: 20, minCopies: 10, keepCopies: 4 },
  )
  const settingsKey = settings ? JSON.stringify(settings) : null

  useEffect(() => {
    if (!settingsKey) return
    const timeout = window.setTimeout(
      () => setVariables(JSON.parse(settingsKey) as BulkCleanSettings),
      SETTINGS_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [settingsKey])

  const { data, error, loading, previousData } = useQuery(CollectionBulkCleanDocument, {
    variables,
    skip: !open,
    fetchPolicy: "network-only",
  })
  const result = (data ?? previousData)?.collectionBulkClean
  const groups = result ? groupPulls(result.cards, groupBy) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" labelledBy="bulk-clean-title">
        <DialogHeader>
          <div>
            <DialogTitle id="bulk-clean-title">Bulk clean</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Pull surplus copies of cheap cards you own in bulk. Deck-allocated and list cards are
              left alone.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">Bulk clean thresholds</legend>
            <SettingField
              id="bulk-clean-max-price"
              label="Worth under"
              prefix="$"
              hint="Per copy, current market price"
              min={0}
              step={0.01}
              value={maxPrice}
              onChange={setMaxPrice}
            />
            <SettingField
              id="bulk-clean-min-copies"
              label="Own at least"
              suffix="copies"
              hint="Loose copies across printings"
              min={1}
              step={1}
              value={minCopies}
              onChange={setMinCopies}
            />
            <SettingField
              id="bulk-clean-keep-copies"
              label="Keep"
              suffix="copies"
              hint="Left in your collection"
              min={0}
              step={1}
              value={keepCopies}
              onChange={setKeepCopies}
            />
          </fieldset>

          {!settings ? (
            <p role="alert" className="text-sm text-error">
              Enter a price of $0 or more, at least 1 copy, and 0 or more to keep.
            </p>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-3" aria-busy={loading}>
            <CountCard label="Cards" value={result ? String(result.cardCount) : "–"} />
            <CountCard label="Copies to pull" value={result ? String(result.pullQuantity) : "–"} />
            <CountCard
              label="Pull value"
              value={result ? formatCents(result.pullValueCents) : "–"}
            />
          </dl>

          {error ? (
            <p
              role="alert"
              className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            >
              {error.message}
            </p>
          ) : !result ? (
            <p className="text-sm text-base-content/70">Finding bulk to pull...</p>
          ) : groups.length ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold">Group by</span>
                <ToggleGroup
                  type="single"
                  aria-label="Group pulls by"
                  value={groupBy}
                  onValueChange={(value) => {
                    if (value === "location" || value === "card") setGroupBy(value)
                  }}
                  className="flex gap-1 rounded-btn border border-base-300 bg-base-100 p-1"
                >
                  {(["location", "card"] as const).map((value) => (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className="min-h-11 rounded-btn px-4 text-sm font-bold transition-colors hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=on]:bg-primary data-[state=on]:text-primary-content"
                    >
                      {value === "location" ? "Location" : "Card"}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {groups.map((group, index) => {
                const headingId = `bulk-clean-${groupBy}-${index}`

                return (
                  <details
                    key={`${groupBy}:${group.key}`}
                    open
                    className="rounded-box border border-base-300 bg-base-100/70"
                    aria-labelledby={headingId}
                  >
                    <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
                      <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-start justify-between gap-3 align-top">
                        <div>
                          <h3 id={headingId} className="font-black tracking-normal">
                            {group.title}
                          </h3>
                          <p className="text-xs text-base-content/60">{group.subtitle}</p>
                        </div>
                        <span className="badge badge-outline shrink-0">
                          Pull {pulledCopies(group.pulls)}
                        </span>
                      </div>
                    </summary>
                    <ul className="divide-y divide-base-300 border-t border-base-300">
                      {group.pulls.map((pull) => (
                        <li key={pull.collectionItemId} className="space-y-1 px-4 py-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <CardNamePreview move={pull} />
                            <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/70">
                              <span className="font-bold text-base-content">
                                Pull {pull.quantity}
                                {pull.quantity < pull.ownedQuantity
                                  ? ` of ${pull.ownedQuantity}`
                                  : ""}
                              </span>
                              <FinishBadge finish={pull.finish} />
                            </div>
                          </div>
                          <p className="text-sm text-base-content/70">
                            {groupBy === "card" ? `From ${pull.fromLocationName} · ` : ""}
                            <span className="font-mono text-xs">
                              {pull.setCode.toUpperCase()} #{pull.collectorNumber}
                            </span>
                            {" · "}
                            {formatCents(pull.priceCents)} each
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })}
            </div>
          ) : (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4">
              <p className="text-sm font-bold text-base-content/80">Nothing to pull.</p>
              <p className="mt-1 text-sm text-base-content/70">
                No card under that price has enough loose copies. Raise the price or lower the copy
                count.
              </p>
            </div>
          )}

          <div className="flex justify-end border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SettingField({
  hint,
  id,
  label,
  min,
  onChange,
  prefix,
  step,
  suffix,
  value,
}: {
  hint: string
  id: string
  label: string
  min: number
  onChange: (value: string) => void
  prefix?: string
  step: number
  suffix?: string
  value: string
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-base-content/70">{prefix}</span> : null}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="text-sm text-base-content/70">{suffix}</span> : null}
      </div>
      <p id={`${id}-hint`} className="text-xs text-base-content/60">
        {hint}
      </p>
    </div>
  )
}

function CountCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-base-content/60">{label}</dt>
      <dd className="mt-1 text-2xl font-black tracking-tight">{value}</dd>
    </div>
  )
}

function parseSettings(
  maxPrice: string,
  minCopies: string,
  keepCopies: string,
): BulkCleanSettings | null {
  const maxPriceCents = Math.round(Number(maxPrice) * 100)
  const min = Number(minCopies)
  const keep = Number(keepCopies)
  if (maxPrice.trim() === "" || !Number.isFinite(maxPriceCents) || maxPriceCents < 0) return null
  if (minCopies.trim() === "" || !Number.isInteger(min) || min < 1) return null
  if (keepCopies.trim() === "" || !Number.isInteger(keep) || keep < 0) return null
  return { maxPriceCents, minCopies: min, keepCopies: keep }
}

function groupPulls(
  cards: readonly {
    cardId: string
    cardName: string
    totalCopies: number
    pulls: BulkCleanPull[]
  }[],
  groupBy: "location" | "card",
): PullGroup[] {
  if (groupBy === "card") {
    return cards.map((card) => ({
      key: card.cardId,
      title: card.cardName,
      subtitle: `${pluralize(card.totalCopies, "loose copy", "loose copies")} owned`,
      pulls: card.pulls,
    }))
  }

  const groups = new Map<string, PullGroup>()
  for (const pull of cards.flatMap((card) => card.pulls)) {
    const key = pull.fromLocationId ?? "unfiled"
    const group = groups.get(key)
    if (group) group.pulls.push(pull)
    else groups.set(key, { key, title: pull.fromLocationName, subtitle: "", pulls: [pull] })
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      subtitle: pluralize(new Set(group.pulls.map((pull) => pull.cardId)).size, "card"),
    }))
    .sort((left, right) => left.title.localeCompare(right.title))
}

function pulledCopies(pulls: readonly BulkCleanPull[]) {
  return pulls.reduce((total, pull) => total + pull.quantity, 0)
}
