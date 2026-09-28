import { useApolloClient } from "@apollo/client/react"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { queueSharedImport } from "../../lib/native-shared-import"
import { useLocalStorageState } from "../../lib/use-local-storage"
import { printingOption, ScannerPrintingsDocument } from "./documents"
import { chooseFinish, choosePrinting, type Finish, type PrintingOption } from "./printing-choice"
import type { Candidate, Quad } from "./recognition/pipeline"
import { useRecognizer } from "./recognition/use-recognizer"
import {
  cardKey,
  evaluateFrame,
  forgetLastLogged,
  INITIAL_TRACKER,
  type FrameOutcome,
  type ScanTracker,
} from "./scan-decision"
import {
  entryPriceCents,
  normalizeScanList,
  scanListCsv,
  withPrinting,
  type ScanEntry,
} from "./scan-list"
import {
  DEFAULT_SCAN_SETTINGS,
  normalizeScanSettings,
  SCAN_LIST_STORAGE_KEY,
  SCAN_SETTINGS_STORAGE_KEY,
  soundForPrice,
  type ScanSettings,
} from "./scan-settings"
import { playScanSound, unlockScanSounds } from "./scan-sounds"
import { useCamera } from "./use-camera"

/** What the viewfinder shows for the latest frame. */
export interface ScanView {
  outcome: FrameOutcome["type"] | "idle"
  /** Detected card corners in frame pixels (see `FRAME_SIZE`), when a card is in view. */
  quad: Quad | null
  candidate: Candidate | null
  /** Milliseconds for the latest identification. */
  ms: number | null
  /** Increments on every logged scan, to replay the confirmation flash. */
  logged: number
}

const IDLE_VIEW: ScanView = { outcome: "idle", quad: null, candidate: null, ms: null, logged: 0 }
/** Breathing room between frames so the UI thread and battery are not saturated. */
const FRAME_GAP_MS = 40

const EMPTY_LIST: ScanEntry[] = []
const readSettings = (value: string) => normalizeScanSettings(JSON.parse(value))
const readList = (value: string) => normalizeScanList(JSON.parse(value))

function newEntryId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * The scanner's state machine: camera + recognizer → scan decision → list entry → catalog
 * printing lookup → sound. Entries and settings persist in localStorage.
 */
export function useScanSession({ paused }: { paused: boolean }) {
  const apollo = useApolloClient()
  const navigate = useNavigate()
  const camera = useCamera()
  const recognizer = useRecognizer()
  const [settings, setSettings] = useLocalStorageState<ScanSettings>(
    SCAN_SETTINGS_STORAGE_KEY,
    DEFAULT_SCAN_SETTINGS,
    { deserialize: readSettings },
  )
  const [entries, setEntries] = useLocalStorageState<ScanEntry[]>(
    SCAN_LIST_STORAGE_KEY,
    EMPTY_LIST,
    {
      deserialize: readList,
    },
  )
  const [view, setView] = useState<ScanView>(IDLE_VIEW)

  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const trackerRef = useRef<ScanTracker>(INITIAL_TRACKER)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const updateEntry = useCallback(
    (id: string, update: (entry: ScanEntry) => ScanEntry) =>
      setEntries((list) => list.map((entry) => (entry.id === id ? update(entry) : entry))),
    [setEntries],
  )

  const resolveEntry = useCallback(
    async (entry: ScanEntry) => {
      let printing: PrintingOption | null = null
      try {
        const { data } = await apollo.query({
          query: ScannerPrintingsDocument,
          variables: { scryfallId: entry.scryfallId, illustrationId: entry.illustrationId },
          fetchPolicy: "cache-first",
        })
        printing = choosePrinting(
          (data?.scannerPrintings ?? []).map(printingOption),
          { illustrationId: entry.illustrationId },
          settingsRef.current,
        )
      } catch {
        // Offline or catalog error: keep the recognized gallery printing without a price.
      }
      if (!printing) {
        playScanSound(soundForPrice(null, settingsRef.current))
        return
      }
      const finish = chooseFinish(printing.finishes, settingsRef.current.preferFoil)
      updateEntry(entry.id, (current) => withPrinting(current, printing, finish))
      playScanSound(soundForPrice(printing.prices[finish], settingsRef.current))
    },
    [apollo, updateEntry],
  )

  const logScan = useCallback(
    (candidate: Candidate) => {
      const key = cardKey(candidate.id)
      const entry: ScanEntry = {
        id: newEntryId(),
        cardKey: key,
        illustrationId: candidate.illustration_id ?? null,
        name: candidate.name,
        scryfallId: key,
        setCode: candidate.set,
        setName: null,
        collectorNumber: candidate.collector_number ?? "",
        rarity: null,
        finish: settingsRef.current.preferFoil ? "foil" : "nonfoil",
        finishes: [],
        language: candidate.lang ?? "en",
        quantity: 1,
        prices: { nonfoil: null, foil: null, etched: null },
        imageUrl: candidate.url ?? null,
        resolved: false,
        scannedAt: Date.now(),
      }
      setEntries((list) => [entry, ...list])
      void resolveEntry(entry)
    },
    [resolveEntry, setEntries],
  )

  const running = camera.state.status === "live" && recognizer.state.status === "ready"
  const { grabFrame } = camera
  const { identify } = recognizer

  useEffect(() => {
    if (!running) return
    let cancelled = false
    void (async () => {
      while (!cancelled) {
        if (pausedRef.current || document.visibilityState === "hidden") {
          await sleep(250)
          continue
        }
        const frame = grabFrame()
        if (!frame) {
          await sleep(100)
          continue
        }
        try {
          const result = await identify(frame)
          if (cancelled || pausedRef.current) continue
          const { tracker, outcome } = evaluateFrame(trackerRef.current, result)
          trackerRef.current = tracker
          if (outcome.type === "accept") logScan(outcome.candidate)
          setView((current) => ({
            outcome: outcome.type,
            quad: outcome.type === "empty" ? null : result.quad,
            candidate: outcome.type === "empty" ? null : outcome.candidate,
            ms: result.timings.total,
            logged: current.logged + (outcome.type === "accept" ? 1 : 0),
          }))
        } catch {
          if (cancelled) return
          await sleep(250)
        }
        await sleep(FRAME_GAP_MS)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [grabFrame, identify, logScan, running])

  const { start: startCamera, stop: stopCamera } = camera
  const { start: startRecognizer, stop: stopRecognizer } = recognizer

  /** Must run from a tap: it unlocks audio and triggers the camera permission prompt. */
  const start = useCallback(() => {
    unlockScanSounds()
    startRecognizer()
    void startCamera()
  }, [startCamera, startRecognizer])

  const stop = useCallback(() => {
    stopCamera()
    stopRecognizer()
    setView(IDLE_VIEW)
  }, [stopCamera, stopRecognizer])

  /** Explicitly logs another copy; this is how the same card is counted twice in a row. */
  const addCopy = useCallback(
    (id: string) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (!entry) return
      updateEntry(id, (current) => ({ ...current, quantity: current.quantity + 1 }))
      playScanSound(soundForPrice(entryPriceCents(entry), settingsRef.current))
    },
    [updateEntry],
  )

  /** Removing the latest scan lets the same card be scanned again straight away. */
  const removeEntry = useCallback(
    (id: string) => {
      if (entriesRef.current[0]?.id === id) {
        trackerRef.current = forgetLastLogged(trackerRef.current)
      }
      setEntries((list) => list.filter((entry) => entry.id !== id))
    },
    [setEntries],
  )

  const setQuantity = useCallback(
    (id: string, quantity: number) => {
      if (quantity <= 0) removeEntry(id)
      else updateEntry(id, (entry) => ({ ...entry, quantity }))
    },
    [removeEntry, updateEntry],
  )

  const setFinish = useCallback(
    (id: string, finish: Finish) => updateEntry(id, (entry) => ({ ...entry, finish })),
    [updateEntry],
  )

  const setLanguage = useCallback(
    (id: string, language: string) => updateEntry(id, (entry) => ({ ...entry, language })),
    [updateEntry],
  )

  const setPrinting = useCallback(
    (id: string, printing: PrintingOption) =>
      updateEntry(id, (entry) =>
        withPrinting(
          entry,
          printing,
          printing.finishes.includes(entry.finish)
            ? entry.finish
            : chooseFinish(printing.finishes, settingsRef.current.preferFoil),
        ),
      ),
    [updateEntry],
  )

  const clear = useCallback(() => {
    trackerRef.current = forgetLastLogged(trackerRef.current)
    setEntries([])
  }, [setEntries])

  /** Queues the list as CSV for the collection import overlay and opens it. */
  const addToCollection = useCallback(() => {
    if (entriesRef.current.length === 0) return
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
    queueSharedImport({
      text: scanListCsv(entriesRef.current),
      fileName: `manavault-scan-${stamp}.csv`,
      mimeType: "text/csv",
      source: "scanner",
    })
    stop()
    void navigate({ to: "/collection", search: { importFile: true } })
  }, [navigate, stop])

  return {
    camera,
    recognizer,
    view,
    entries,
    settings,
    setSettings,
    start,
    stop,
    addCopy,
    setQuantity,
    setFinish,
    setLanguage,
    setPrinting,
    removeEntry,
    clear,
    addToCollection,
  }
}

export type ScanSession = ReturnType<typeof useScanSession>
