import { useApolloClient } from "@apollo/client/react"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { queueSharedImport } from "../../lib/native-shared-import"
import { useLocalStorageState } from "../../lib/use-local-storage"
import {
  printingOption,
  ScannerPrintingsDocument,
  ScannerSetIllustrationsDocument,
} from "./documents"
import { chooseFinish, choosePrinting, type Finish, type PrintingOption } from "./printing-choice"
import type { Identification } from "./recognition/messages"
import type { Candidate } from "./recognition/pipeline"
import { useRecognizer } from "./recognition/use-recognizer"
import {
  cardKey,
  evaluateFrame,
  forgetLastLogged,
  INITIAL_TRACKER,
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
import { IDLE_VIEW, nextView, type ScanView } from "./scan-view"
import { trainingCapture, trainingSample, uploadTrainingSample } from "./scan-training"
import { FRAME_SIZE, useCamera } from "./use-camera"

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

/** The set lock as a candidate filter; `loading` while its illustrations are fetched. */
type SetLock =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; allow: (candidate: Candidate) => boolean }

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
  const lockRef = useRef<SetLock>({ status: "off" })
  const bundleVersionRef = useRef<string | null>(null)
  bundleVersionRef.current = recognizer.state.status === "ready" ? recognizer.state.version : null

  /** Re-sends an uploaded capture's label; `null` marks it skipped. */
  const relabel = useCallback((entry: ScanEntry, label: string | null = entry.scryfallId) => {
    if (entry.training)
      void uploadTrainingSample(trainingSample(entry.training, label, entry.finish))
  }, [])
  const lockedSetsKey = settings.lockedSets.join(",")

  // A locked set restricts recognition to artwork printed in those sets. The browser only
  // knows each artwork's representative printing, so the server lists the illustrations.
  useEffect(() => {
    const sets = lockedSetsKey ? lockedSetsKey.split(",") : []
    if (sets.length === 0) {
      lockRef.current = { status: "off" }
      return
    }
    let cancelled = false
    lockRef.current = { status: "loading" }
    apollo
      .query({ query: ScannerSetIllustrationsDocument, variables: { setCodes: sets } })
      .then(({ data }) => {
        if (cancelled) return
        const illustrations = new Set(data?.scannerSetIllustrations ?? [])
        const codes = new Set(sets)
        lockRef.current = {
          status: "ready",
          allow: (candidate) =>
            codes.has(candidate.set.toLowerCase()) ||
            (candidate.illustration_id !== undefined &&
              illustrations.has(candidate.illustration_id)),
        }
      })
      .catch(() => {
        // Without the list, fall back to the representative printing's set.
        if (!cancelled) {
          const codes = new Set(sets)
          lockRef.current = { status: "ready", allow: (c) => codes.has(c.set.toLowerCase()) }
        }
      })
    return () => {
      cancelled = true
    }
  }, [apollo, lockedSetsKey])

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
      if (finish !== entry.finish) relabel({ ...entry, finish })
      playScanSound(soundForPrice(printing.prices[finish], settingsRef.current))
    },
    [apollo, relabel, updateEntry],
  )

  const { lastFrameJpeg } = camera

  const logScan = useCallback(
    (candidate: Candidate, result: Identification) => {
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
        // The full card scan of the recognized printing, not its art crop, so the thumbnail
        // does not jump from landscape art to a card when the catalog lookup finishes.
        imageUrl: candidate.url?.replace("/art_crop/", "/normal/") ?? null,
        resolved: false,
        scannedAt: Date.now(),
      }
      // Training upload of the frame the recognizer just saw (the canvas still holds it).
      const version = bundleVersionRef.current
      const image = settingsRef.current.collectTraining && version ? lastFrameJpeg() : null
      if (image && version) {
        entry.training = trainingCapture(newEntryId(), candidate, result, FRAME_SIZE, version)
        void uploadTrainingSample(trainingSample(entry.training, candidate.id, entry.finish, image))
      }
      setEntries((list) => [entry, ...list])
      void resolveEntry(entry)
    },
    [lastFrameJpeg, resolveEntry, setEntries],
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
          const lock = lockRef.current
          if (lock.status === "loading") {
            await sleep(100)
            continue
          }
          const { tracker, outcome } = evaluateFrame(
            trackerRef.current,
            result,
            lock.status === "ready" ? lock.allow : undefined,
          )
          trackerRef.current = tracker
          if (outcome.type === "accept") logScan(outcome.candidate, result)
          const now = performance.now()
          setView((current) => nextView(current, outcome, result, now))
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
      // A deleted scan may have been a misrecognition, so its training label is not trusted.
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (entry) relabel(entry, null)
      setEntries((list) => list.filter((entry) => entry.id !== id))
    },
    [relabel, setEntries],
  )

  const setQuantity = useCallback(
    (id: string, quantity: number) => {
      if (quantity <= 0) removeEntry(id)
      else updateEntry(id, (entry) => ({ ...entry, quantity }))
    },
    [removeEntry, updateEntry],
  )

  const setFinish = useCallback(
    (id: string, finish: Finish) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (entry && entry.finish !== finish) relabel({ ...entry, finish })
      updateEntry(id, (current) => ({ ...current, finish }))
    },
    [relabel, updateEntry],
  )

  const setLanguage = useCallback(
    (id: string, language: string) => updateEntry(id, (entry) => ({ ...entry, language })),
    [updateEntry],
  )

  const setPrinting = useCallback(
    (id: string, printing: PrintingOption) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (!entry) return
      const next = withPrinting(
        entry,
        printing,
        printing.finishes.includes(entry.finish)
          ? entry.finish
          : chooseFinish(printing.finishes, settingsRef.current.preferFoil),
      )
      relabel(next)
      updateEntry(id, () => next)
    },
    [relabel, updateEntry],
  )

  /** "Wrong card?": the entry becomes a different card; its capture is relabelled. */
  const replaceCard = useCallback(
    (id: string, printing: PrintingOption) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (!entry) return
      const next: ScanEntry = {
        ...withPrinting(
          entry,
          printing,
          chooseFinish(printing.finishes, settingsRef.current.preferFoil),
        ),
        cardKey: printing.scryfallId,
        illustrationId: printing.illustrationId,
        training: entry.training ? { ...entry.training, face: "" } : entry.training,
      }
      relabel(next)
      updateEntry(id, () => next)
    },
    [relabel, updateEntry],
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
    replaceCard,
    removeEntry,
    clear,
    addToCollection,
  }
}

export type ScanSession = ReturnType<typeof useScanSession>
