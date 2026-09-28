import { useQuery } from "@apollo/client/react"
import { Check } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { cn } from "../../lib/utils"
import { printingOption, ScannerPrintingsDocument } from "./documents"
import { rankPrintings, type PrintingOption } from "./printing-choice"
import { formatCents, type ScanEntry } from "./scan-list"
import type { ScanSettings } from "./scan-settings"

/**
 * Every printing of the scanned card, same artwork first. Identical art cannot tell reprints
 * apart, so this is where the exact set, number and language get corrected.
 */
export function PrintingSheet({
  entry,
  settings,
  onSelect,
  onClose,
}: {
  entry: ScanEntry | null
  settings: ScanSettings
  onSelect: (printing: PrintingOption) => void
  onClose: () => void
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      {entry ? (
        <DialogContent className="scan-sheet sm:max-w-xl" labelledBy="scan-printing-title">
          <DialogHeader>
            <div className="min-w-0">
              <DialogTitle id="scan-printing-title">Choose printing</DialogTitle>
              <p className="mt-1 truncate text-sm text-base-content/70">{entry.name}</p>
            </div>
            <DialogClose onClose={onClose} />
          </DialogHeader>
          <PrintingList entry={entry} settings={settings} onSelect={onSelect} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function PrintingList({
  entry,
  settings,
  onSelect,
}: {
  entry: ScanEntry
  settings: ScanSettings
  onSelect: (printing: PrintingOption) => void
}) {
  const { data, loading, error } = useQuery(ScannerPrintingsDocument, {
    variables: { scryfallId: entry.cardKey, illustrationId: entry.illustrationId },
  })
  const options = rankPrintings(
    (data?.scannerPrintings ?? []).map(printingOption),
    { illustrationId: entry.illustrationId },
    { lockedSets: settings.lockedSets, ignorePromos: false },
  )

  if (loading && options.length === 0) {
    return <p className="px-5 py-6 text-sm text-base-content/70">Loading printings…</p>
  }
  if (error) {
    return <p className="px-5 py-6 text-sm text-error">Could not load printings: {error.message}</p>
  }
  if (options.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-base-content/70">
        This card is not in the catalog yet. It will import as the recognized printing.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-base-300 overflow-y-auto">
      {options.map((option) => {
        const selected = option.scryfallId === entry.scryfallId
        const sameArt =
          Boolean(entry.illustrationId) && option.illustrationId === entry.illustrationId
        const price = option.prices[entry.finish] ?? option.prices.nonfoil ?? option.prices.foil
        return (
          <li key={option.scryfallId}>
            <button
              type="button"
              onClick={() => onSelect(option)}
              aria-pressed={selected}
              className={cn(
                "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-none",
                selected && "bg-primary/10",
              )}
            >
              {option.imageUrl ? (
                <img
                  src={option.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-14 w-10 shrink-0 rounded-[3px] object-cover"
                />
              ) : (
                <span className="h-14 w-10 shrink-0 rounded-[3px] bg-base-300" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{option.setName ?? option.setCode}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/70">
                  <span className="font-mono">
                    {option.setCode.toUpperCase()} #{option.collectorNumber} ·{" "}
                    {option.lang.toUpperCase()}
                  </span>
                  {option.releasedAt ? <span>{option.releasedAt.slice(0, 4)}</span> : null}
                  {sameArt ? <span className="badge badge-outline badge-sm">Same art</span> : null}
                  {option.promo ? (
                    <span className="badge badge-outline badge-sm">Promo</span>
                  ) : null}
                  {option.ownedCount > 0 ? (
                    <span className="badge badge-success badge-outline badge-sm">
                      Own {option.ownedCount}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-bold text-warning">
                {formatCents(price ?? null)}
              </span>
              {selected ? (
                <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Selected" />
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
