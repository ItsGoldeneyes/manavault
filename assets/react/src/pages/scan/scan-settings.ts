export const SCAN_SETTINGS_STORAGE_KEY = "manavault.scanner.settings"
export const SCAN_LIST_STORAGE_KEY = "manavault.scanner.list"

export interface ScanSettings {
  /** Lowercase set codes; when any are set, printings from them win the default choice. */
  lockedSets: string[]
  ignorePromos: boolean
  preferFoil: boolean
  soundsEnabled: boolean
  dingThresholdCents: number
  bigDingThresholdCents: number
  showTotal: boolean
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  lockedSets: [],
  ignorePromos: true,
  preferFoil: false,
  soundsEnabled: true,
  dingThresholdCents: 100,
  bigDingThresholdCents: 1000,
  showTotal: true,
}

/** Stored settings from an older version or a hand-edited value fall back field by field. */
export function normalizeScanSettings(value: unknown): ScanSettings {
  const stored = (value && typeof value === "object" ? value : {}) as Partial<ScanSettings>
  const bool = (key: keyof ScanSettings) =>
    typeof stored[key] === "boolean"
      ? (stored[key] as boolean)
      : (DEFAULT_SCAN_SETTINGS[key] as boolean)
  const cents = (key: "dingThresholdCents" | "bigDingThresholdCents") => {
    const number = stored[key]
    return typeof number === "number" && Number.isFinite(number) && number >= 0
      ? Math.round(number)
      : DEFAULT_SCAN_SETTINGS[key]
  }
  return {
    lockedSets: Array.isArray(stored.lockedSets)
      ? [
          ...new Set(
            stored.lockedSets
              .filter((set): set is string => typeof set === "string" && set.trim() !== "")
              .map((set) => set.trim().toLowerCase()),
          ),
        ]
      : [],
    ignorePromos: bool("ignorePromos"),
    preferFoil: bool("preferFoil"),
    soundsEnabled: bool("soundsEnabled"),
    dingThresholdCents: cents("dingThresholdCents"),
    bigDingThresholdCents: cents("bigDingThresholdCents"),
    showTotal: bool("showTotal"),
  }
}

export type ScanSound = "none" | "scan" | "ding" | "big-ding"

/** Every scan clicks; valuable cards ding, and the big ding wins over the ordinary one. */
export function soundForPrice(priceCents: number | null, settings: ScanSettings): ScanSound {
  if (!settings.soundsEnabled) return "none"
  if (priceCents !== null && priceCents >= settings.bigDingThresholdCents) return "big-ding"
  if (priceCents !== null && priceCents >= settings.dingThresholdCents) return "ding"
  return "scan"
}
