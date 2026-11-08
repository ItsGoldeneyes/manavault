import { ExternalLink } from "lucide-react"
import { useEffect, useState } from "react"

import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import { Input } from "../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import { Switch } from "../../components/ui/switch"
import { formatDate } from "../settings/data"
import type { DeckDetail, DeckSummary } from "./deck-types"
import {
  externalSourceLabel,
  SYNC_INTERVAL_HOURS,
  syncIntervalLabel,
  syncScheduleLabel,
  useDeckExternalSource,
  type SyncSchedule,
} from "./use-deck-external-source"

type ExternalDeck = Pick<
  DeckSummary | DeckDetail,
  | "id"
  | "status"
  | "externalSource"
  | "externalUrl"
  | "externalSyncedAt"
  | "externalSyncError"
  | "externalSyncIntervalHours"
  | "externalSyncCron"
>

const CRON_VALUE = "cron"

/**
 * Edit-dialog section that links a deck to a Moxfield or Archidekt deck.
 * Pasting a URL does nothing on its own; turning the switch on (after a
 * confirmation) imports the external deck over this decklist and keeps it in
 * sync. Turning it off unlinks the deck and leaves the current cards in place.
 * While linked, `schedule` picks how often it syncs; the deck editor saves it
 * with the rest of the form.
 */
export function DeckExternalSourceField({
  deck,
  disabled = false,
  onPendingChange,
  onScheduleChange,
  schedule,
}: {
  deck: ExternalDeck
  disabled?: boolean
  onPendingChange?: (pending: boolean) => void
  onScheduleChange?: (schedule: SyncSchedule) => void
  schedule?: SyncSchedule
}) {
  const linked = Boolean(deck.externalSource)
  // The server refuses to link archived decks; unlinking still works.
  const archived = deck.status === "archived"
  const [url, setUrl] = useState(deck.externalUrl ?? "")
  const [confirm, setConfirm] = useState<"link" | "unlink" | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const { clearError, error, isLinking, isPending, isUnlinking, link, unlink } =
    useDeckExternalSource(deck.id)
  const sourceLabel = externalSourceLabel(deck.externalSource)
  const scheduleLabel = syncScheduleLabel(deck)
  const checked = isLinking || (linked && !isUnlinking)
  const shownError = localError || error

  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  useEffect(() => {
    if (deck.externalUrl) setUrl(deck.externalUrl)
  }, [deck.externalUrl])

  function toggle(nextChecked: boolean) {
    setLocalError(null)
    clearError()

    if (!nextChecked) {
      setConfirm("unlink")
      return
    }

    if (!url.trim()) {
      setLocalError("Paste a Moxfield or Archidekt deck link first")
      return
    }

    setConfirm("link")
  }

  return (
    <section
      aria-labelledby="deck-external-source-heading"
      className="space-y-3 border-t border-base-300 pt-5"
    >
      <h3
        id="deck-external-source-heading"
        className="text-xs font-black uppercase tracking-[0.18em] text-base-content/80"
      >
        External deck
      </h3>

      <div className="flex min-h-11 items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-bold">Link external deck</span>
          <span id="deck-external-source-help" className="block text-sm text-base-content/75">
            {linked
              ? `Mirrors ${sourceLabel} and syncs ${scheduleLabel}. Card edits are disabled here.`
              : archived
                ? "Unarchive this deck before linking an external deck."
                : "Replace this decklist with a Moxfield or Archidekt deck and keep it in sync."}
          </span>
        </span>
        <Switch
          aria-label="Link external deck"
          aria-describedby="deck-external-source-help"
          checked={checked}
          onCheckedChange={toggle}
          disabled={disabled || isPending || (archived && !linked)}
          className="shrink-0"
        />
      </div>

      <label className="block space-y-2">
        <span className="sr-only">Moxfield or Archidekt URL</span>
        <Input
          aria-label="Moxfield or Archidekt URL"
          className="min-h-11"
          inputMode="url"
          placeholder="https://moxfield.com/decks/... or https://archidekt.com/decks/..."
          value={url}
          disabled={linked || archived || disabled || isPending}
          onChange={(event) => {
            setUrl(event.target.value)
            setLocalError(null)
          }}
        />
      </label>

      {linked && schedule && onScheduleChange ? (
        <div className="space-y-2">
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-base-content/80">
              Sync
            </span>
            <Select
              value={schedule.mode === "cron" ? CRON_VALUE : String(schedule.intervalHours)}
              onValueChange={(value) =>
                onScheduleChange(
                  value === CRON_VALUE
                    ? { ...schedule, mode: "cron" }
                    : { ...schedule, mode: "interval", intervalHours: Number(value) },
                )
              }
              disabled={disabled || isPending}
            >
              <SelectTrigger
                aria-label="Sync schedule"
                className="min-h-11 bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYNC_INTERVAL_HOURS.map((hours) => (
                  <SelectItem key={hours} value={String(hours)}>
                    {syncIntervalLabel(hours)}
                  </SelectItem>
                ))}
                <SelectItem value={CRON_VALUE}>Cron schedule</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {schedule.mode === "cron" ? (
            <div className="space-y-2">
              <Input
                aria-label="Cron expression"
                aria-describedby="deck-sync-cron-help"
                className="min-h-11 font-mono"
                placeholder="0 */6 * * *"
                value={schedule.cron}
                disabled={disabled || isPending}
                onChange={(event) => onScheduleChange({ ...schedule, cron: event.target.value })}
              />
              <span id="deck-sync-cron-help" className="block text-sm text-base-content/65">
                Five fields (minute hour day month weekday), in UTC.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {linked ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/65">
          <span>
            {deck.externalSyncError
              ? `Last sync failed: ${deck.externalSyncError}`
              : deck.externalSyncedAt
                ? `Last synced ${formatDate(deck.externalSyncedAt)}`
                : "Not synced yet"}
          </span>
          {deck.externalUrl ? (
            <a
              className="link link-primary inline-flex items-center gap-1"
              href={deck.externalUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open in {sourceLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </p>
      ) : null}

      {isLinking ? <p className="text-sm text-base-content/65">Importing deck...</p> : null}

      {shownError ? (
        <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {shownError}
        </p>
      ) : null}

      <ConfirmDialog
        confirmLabel="Link and replace"
        destructive
        onConfirm={() => link(url.trim())}
        onOpenChange={(open) => !open && setConfirm(null)}
        open={confirm === "link"}
        title="Replace this decklist?"
      >
        The current cards are replaced with the external deck, which then syncs {scheduleLabel}. You
        can still allocate copies from your collection.
      </ConfirmDialog>

      <ConfirmDialog
        confirmLabel="Unlink"
        onConfirm={() => unlink()}
        onOpenChange={(open) => !open && setConfirm(null)}
        open={confirm === "unlink"}
        title={`Unlink from ${sourceLabel}?`}
      >
        The current cards stay in this deck, but it will stop syncing and become editable again.
      </ConfirmDialog>
    </section>
  )
}
