import { ExternalLink, Link2, RefreshCw, Unlink } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { formatDate } from "../settings/data"
import type { DeckDetail } from "./deck-types"
import { externalSourceLabel, useDeckExternalSource } from "./use-deck-external-source"

/**
 * Link a deck to a Moxfield or Archidekt deck, or manage an existing link.
 * While linked the decklist is read-only and mirrors the external deck.
 */
export function DeckExternalSourceDialog({
  deck,
  onClose,
}: {
  deck: DeckDetail
  onClose: () => void
}) {
  const [url, setUrl] = useState("")
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const { error, isLinking, isPending, isSyncing, isUnlinking, link, sync, unlink } =
    useDeckExternalSource(deck.id)
  const linked = Boolean(deck.externalSource)

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    link(trimmed, onClose)
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-xl" labelledBy="deck-external-source-title">
          <DialogHeader>
            <div>
              <DialogTitle id="deck-external-source-title">
                {linked ? "External deck" : "Link external deck"}
              </DialogTitle>
              <p className="mt-1 text-sm text-base-content/60">{deck.name}</p>
            </div>
            <DialogClose onClose={onClose} />
          </DialogHeader>

          {linked ? (
            <div className="space-y-4 p-5">
              <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Source
                </dt>
                <dd>{externalSourceLabel(deck.externalSource)}</dd>
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-accent">Link</dt>
                <dd className="min-w-0">
                  <a
                    className="link link-primary inline-flex max-w-full items-center gap-1"
                    href={deck.externalUrl ?? "#"}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="truncate">{deck.externalUrl}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </dd>
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Last synced
                </dt>
                <dd>{deck.externalSyncedAt ? formatDate(deck.externalSyncedAt) : "Never"}</dd>
              </dl>

              <p className="text-sm text-base-content/65">
                This deck mirrors its {externalSourceLabel(deck.externalSource)} list and syncs
                every hour. Edit the decklist there; allocation from your collection still works
                here.
              </p>

              {deck.externalSyncError ? (
                <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                  Last sync failed: {deck.externalSyncError}
                </p>
              ) : null}
              {error ? (
                <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-base-300 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setConfirmUnlink(true)}
                >
                  <Unlink className="h-4 w-4" />
                  {isUnlinking ? "Unlinking..." : "Unlink"}
                </Button>
                <span className="flex-1" />
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button type="button" disabled={isPending} onClick={() => sync()}>
                  <RefreshCw className={isSyncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  {isSyncing ? "Syncing..." : "Sync now"}
                </Button>
              </div>
            </div>
          ) : (
            <form className="space-y-4 p-5" onSubmit={submitLink}>
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                  Moxfield or Archidekt URL
                </span>
                <Input
                  autoFocus
                  inputMode="url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://moxfield.com/decks/..."
                  value={url}
                />
              </label>

              <p className="text-sm text-base-content/65">
                Linking replaces this decklist with the external deck and keeps it in sync every
                hour. While linked you cannot edit cards here, but you can still allocate copies
                from your collection.
              </p>

              {error ? (
                <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-base-300 pt-4">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!url.trim() || isPending}>
                  <Link2 className="h-4 w-4" />
                  {isLinking ? "Importing..." : "Link deck"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Unlink"
        onConfirm={() => unlink(onClose)}
        onOpenChange={setConfirmUnlink}
        open={confirmUnlink}
        title={`Unlink from ${externalSourceLabel(deck.externalSource)}?`}
      >
        The current cards stay in this deck, but it will stop syncing and become editable again.
      </ConfirmDialog>
    </>
  )
}
