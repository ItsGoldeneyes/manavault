import { Link } from "@tanstack/react-router"
import { CameraOff, List, LoaderCircle, Settings2, X } from "lucide-react"
import { useEffect, useState } from "react"
import {
  restoreNativeSystemBarsTheme,
  setNativeSystemBarsTheme,
} from "../../lib/native-system-bars"
import { Button } from "../../components/ui/button"
import { PrintingSheet } from "./printing-sheet"
import type { RecognizerState } from "./recognition/use-recognizer"
import { ScanListSheet } from "./scan-list-sheet"
import { formatCents, totalQuantity, totalValueCents } from "./scan-list"
import { ScanResultBar } from "./scan-result-bar"
import { ScanSettingsSheet } from "./scan-settings-sheet"
import { unlockScanSounds } from "./scan-sounds"
import { ScanViewfinder } from "./scan-viewfinder"
import type { CameraState } from "./use-camera"
import type { ScanView } from "./scan-view"
import { useScanSession } from "./use-scan-session"

type Sheet =
  | { type: "none" }
  | { type: "list" }
  | { type: "settings" }
  | { type: "printing"; id: string }

/** Full-screen, auto-scanning camera view in the spirit of ManaBox. */
export function ScanPage() {
  const [sheet, setSheet] = useState<Sheet>({ type: "none" })
  const session = useScanSession({ paused: sheet.type !== "none" })
  const { camera, recognizer, view, entries, settings } = session
  const latest = entries[0] ?? null
  const printingEntry =
    sheet.type === "printing" ? (entries.find((entry) => entry.id === sheet.id) ?? null) : null
  const close = () => setSheet({ type: "none" })
  const count = totalQuantity(entries)
  const { start, stop } = session

  // Scanning starts as soon as the page opens; the browser asks for camera access once.
  useEffect(() => {
    start()
    return stop
  }, [start, stop])

  // The scanner is always dark, whatever the app theme: light status bar icons while open.
  useEffect(() => {
    setNativeSystemBarsTheme("dark")
    return restoreNativeSystemBarsTheme
  }, [])

  // Browsers keep audio locked until a user gesture; the first tap anywhere unlocks it.
  useEffect(() => {
    window.addEventListener("pointerdown", unlockScanSounds, { once: true })
    return () => window.removeEventListener("pointerdown", unlockScanSounds)
  }, [])

  return (
    <div
      className="scan-page fixed inset-0 z-40 overflow-hidden bg-black text-base-content"
      data-theme="dark"
      data-palette={
        typeof document === "undefined"
          ? undefined
          : (document.documentElement.dataset.palette ?? undefined)
      }
    >
      <ScanViewfinder videoRef={camera.videoRef} view={view} />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-[calc(var(--safe-top)_+_0.75rem)]">
        <Link
          to="/collection"
          search={{ importFile: false }}
          onClick={session.stop}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-base-100/85 text-base-content shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </Link>
        <div className="mx-auto">
          {settings.showTotal ? (
            <div
              className="flex h-11 items-center gap-2 rounded-full bg-base-100/85 px-4 shadow"
              aria-label={`${count} scanned, total ${formatCents(totalValueCents(entries))}`}
            >
              <span className="font-mono text-lg font-black text-warning">
                {formatCents(totalValueCents(entries))}
              </span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setSheet({ type: "list" })}
          className="relative flex h-11 items-center gap-2 rounded-full bg-base-100/85 px-4 font-bold shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Scanned cards: ${count}`}
        >
          <List className="h-5 w-5" aria-hidden="true" />
          <span className="font-mono">{count}</span>
        </button>
        <button
          type="button"
          onClick={() => setSheet({ type: "settings" })}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-base-100/85 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Scanner settings"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </header>

      {camera.state.status === "error" ? (
        <CameraErrorPanel message={camera.state.message} onRetry={start} />
      ) : (
        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-xl flex-col gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-[calc(var(--safe-bottom)_+_0.75rem)] pt-10">
          <StatusPill camera={camera.state} recognizer={recognizer.state} view={view} />
          <ScanResultBar
            entry={latest}
            onAddCopy={session.addCopy}
            onFinish={session.setFinish}
            onPrinting={(id) => setSheet({ type: "printing", id })}
            onLanguage={session.setLanguage}
          />
        </div>
      )}

      <ScanListSheet
        open={sheet.type === "list"}
        entries={entries}
        onClose={close}
        onQuantity={session.setQuantity}
        onFinish={session.setFinish}
        onPrinting={(id) => setSheet({ type: "printing", id })}
        onLanguage={session.setLanguage}
        onRemove={session.removeEntry}
        onClear={session.clear}
        onAddToCollection={session.addToCollection}
      />
      <ScanSettingsSheet
        open={sheet.type === "settings"}
        settings={settings}
        recognizer={recognizer.state}
        lastMs={view.ms}
        onChange={session.setSettings}
        onClose={close}
      />
      <PrintingSheet
        entry={printingEntry}
        settings={settings}
        onClose={close}
        onSelect={(printing) => {
          if (printingEntry) session.setPrinting(printingEntry.id, printing)
          close()
        }}
        onReplace={(printing) => {
          if (printingEntry) session.replaceCard(printingEntry.id, printing)
        }}
      />
    </div>
  )
}

function StatusPill({
  camera,
  recognizer,
  view,
}: {
  camera: CameraState
  recognizer: RecognizerState
  view: ScanView
}) {
  const { text, busy } =
    camera.status === "live"
      ? statusText(recognizer, view)
      : { text: "Starting camera…", busy: true }
  return (
    <p
      role="status"
      aria-live="polite"
      className="mx-auto flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-sm font-bold text-white"
    >
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {text}
    </p>
  )
}

function statusText(recognizer: RecognizerState, view: ScanView): { text: string; busy: boolean } {
  switch (recognizer.status) {
    case "idle":
    case "checking":
      return { text: "Starting scanner…", busy: true }
    case "loading": {
      if (recognizer.total === 0 || recognizer.cached || recognizer.loaded >= recognizer.total)
        return { text: "Loading scanner…", busy: true }
      const percent = Math.min(100, Math.round((recognizer.loaded / recognizer.total) * 100))
      const mb = (bytes: number) => Math.round(bytes / 1_000_000)
      return {
        text: `Downloading scanner ${percent}% · ${mb(recognizer.loaded)} of ${mb(recognizer.total)} MB`,
        busy: true,
      }
    }
    case "unavailable":
      return { text: "No recognition model on this server yet", busy: false }
    case "failed":
      return { text: `Scanner failed: ${recognizer.message}`, busy: false }
    case "ready":
      break
  }
  switch (view.outcome) {
    case "tracking":
      return { text: "Hold steady…", busy: false }
    case "outside-lock":
      return {
        text: `Not in locked sets: ${view.candidate?.name ?? ""} (${view.candidate?.set.toUpperCase() ?? ""})`,
        busy: false,
      }
    case "duplicate":
      return { text: "Already logged · tap +1 for another copy", busy: false }
    case "accept":
      return { text: `Logged ${view.candidate?.name ?? ""}`, busy: false }
    default:
      return { text: "Hold one card in view", busy: false }
  }
}

/** Only shown when the camera cannot start: what went wrong and a way to retry. */
function CameraErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex items-end justify-center bg-base-100 px-5 pb-[calc(var(--safe-bottom)_+_2rem)] pt-24 sm:items-center">
      <div className="w-full max-w-md">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-box border-[1.5px] border-base-300 bg-base-200">
          <CameraOff className="h-7 w-7 text-error" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-black">Camera unavailable</h1>
        <p role="alert" className="mt-3 text-base text-base-content/75">
          {message}
        </p>
        <Button type="button" className="mt-6 h-12 w-full text-base" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  )
}
