/**
 * Synthesized scan sounds (no audio assets). Browsers only allow audio after a user gesture,
 * so the scanner calls `unlockScanSounds` from its start button.
 */
import type { ScanSound } from "./scan-settings"

let context: AudioContext | null = null

function audioContext() {
  if (typeof window === "undefined") return null
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  context ??= new Context()
  return context
}

export function unlockScanSounds() {
  const audio = audioContext()
  if (audio?.state === "suspended") void audio.resume()
}

/** Frequencies (Hz) and start offsets (s) of the partials each sound strikes. */
const NOTES: Record<Exclude<ScanSound, "none">, Array<[number, number]>> = {
  scan: [[1320, 0]],
  ding: [
    [1568, 0],
    [2349, 0.09],
  ],
  "big-ding": [
    [1047, 0],
    [1568, 0.08],
    [2093, 0.16],
    [3136, 0.24],
  ],
}

export function playScanSound(sound: ScanSound) {
  if (sound === "none") return
  const audio = audioContext()
  if (!audio) return
  const now = audio.currentTime
  const length = sound === "scan" ? 0.07 : sound === "ding" ? 0.6 : 1.1
  const peak = sound === "scan" ? 0.08 : 0.2
  for (const [frequency, offset] of NOTES[sound]) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + offset)
    gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + length)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(now + offset)
    oscillator.stop(now + offset + length + 0.05)
  }
}
