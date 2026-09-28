import { Volume2 } from "lucide-react"
import { useId, type ReactNode } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Switch } from "../../components/ui/switch"
import { SetCombobox } from "../collection/set-combobox"
import type { RecognizerState } from "./recognition/use-recognizer"
import { normalizeScanSettings, type ScanSettings } from "./scan-settings"
import { playScanSound, unlockScanSounds } from "./scan-sounds"

export function ScanSettingsSheet({
  open,
  settings,
  recognizer,
  lastMs,
  onChange,
  onClose,
}: {
  open: boolean
  settings: ScanSettings
  recognizer: RecognizerState
  lastMs: number | null
  onChange: (settings: ScanSettings) => void
  onClose: () => void
}) {
  const update = (patch: Partial<ScanSettings>) =>
    onChange(normalizeScanSettings({ ...settings, ...patch }))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="scan-sheet sm:max-w-lg" labelledBy="scan-settings-title">
        <DialogHeader>
          <DialogTitle id="scan-settings-title">Scanner settings</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="divide-y divide-base-300 overflow-y-auto">
          <section className="space-y-2 px-5 py-4">
            <h3 className="text-sm font-bold">Lock sets</h3>
            <p className="text-sm text-base-content/70">
              Scans prefer printings from these sets. Useful when sorting a pile from one release.
            </p>
            <SetCombobox
              values={settings.lockedSets}
              onValuesChange={(lockedSets) => update({ lockedSets })}
            />
          </section>

          <section className="px-5 py-2">
            <ToggleRow
              label="Ignore promos"
              description="Never pick a promo printing automatically."
              checked={settings.ignorePromos}
              onChange={(ignorePromos) => update({ ignorePromos })}
            />
            <ToggleRow
              label="Prefer foil"
              description="Log cards as foil when the printing has a foil version."
              checked={settings.preferFoil}
              onChange={(preferFoil) => update({ preferFoil })}
            />
            <ToggleRow
              label="Show total value"
              description="Keep the running value of the scanned list on screen."
              checked={settings.showTotal}
              onChange={(showTotal) => update({ showTotal })}
            />
          </section>

          <section className="space-y-3 px-5 py-4">
            <ToggleRow
              label="Sounds"
              description="A click for every scan, a ding for valuable cards."
              checked={settings.soundsEnabled}
              onChange={(soundsEnabled) => update({ soundsEnabled })}
            />
            <ThresholdField
              label="Ding at"
              cents={settings.dingThresholdCents}
              disabled={!settings.soundsEnabled}
              onChange={(dingThresholdCents) => update({ dingThresholdCents })}
              onTest={() => testSound("ding")}
            />
            <ThresholdField
              label="Big ding at"
              cents={settings.bigDingThresholdCents}
              disabled={!settings.soundsEnabled}
              onChange={(bigDingThresholdCents) => update({ bigDingThresholdCents })}
              onTest={() => testSound("big-ding")}
            />
          </section>

          <section className="px-5 py-4 text-sm text-base-content/70">
            <h3 className="mb-1 text-sm font-bold text-base-content">Recognition model</h3>
            <RecognizerSummary state={recognizer} lastMs={lastMs} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function testSound(sound: "ding" | "big-ding") {
  unlockScanSounds()
  playScanSound(sound)
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-sm text-base-content/70">{description}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function ThresholdField({
  label,
  cents,
  disabled,
  onChange,
  onTest,
}: {
  label: string
  cents: number
  disabled: boolean
  onChange: (cents: number) => void
  onTest: () => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-sm font-bold">
        {label}
      </label>
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-base-content/60">
          $
        </span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          disabled={disabled}
          // Uncontrolled so a half-typed value is not reformatted mid-edit.
          defaultValue={(cents / 100).toFixed(2)}
          onBlur={(event) => {
            const dollars = Number.parseFloat(event.target.value)
            if (Number.isFinite(dollars) && dollars >= 0) onChange(Math.round(dollars * 100))
            else event.target.value = (cents / 100).toFixed(2)
          }}
          className="pl-7 font-mono"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={onTest}
        aria-label={`Play ${label.toLowerCase()} sound`}
      >
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

function RecognizerSummary({
  state,
  lastMs,
}: {
  state: RecognizerState
  lastMs: number | null
}): ReactNode {
  switch (state.status) {
    case "ready":
      return (
        <p>
          <span className="font-mono">{state.version}</span> · {state.arts.toLocaleString()}{" "}
          artworks · loaded in{" "}
          <span className="font-mono">{(state.loadMs / 1000).toFixed(1)} s</span>
          {lastMs !== null ? (
            <>
              {" "}
              · last scan <span className="font-mono">{Math.round(lastMs)} ms</span>
            </>
          ) : null}
        </p>
      )
    case "loading":
      return (
        <p>
          Loading <span className="font-mono">{state.version}</span>…
        </p>
      )
    case "unavailable":
      return <p>No recognition model is installed on this server yet.</p>
    case "failed":
      return <p className="text-error">{state.message}</p>
    default:
      return <p>Loads when you start scanning. New models are picked up automatically.</p>
  }
}
