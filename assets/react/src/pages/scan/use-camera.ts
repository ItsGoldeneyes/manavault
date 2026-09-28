import { useCallback, useEffect, useRef, useState } from "react"
import type { RgbaImage } from "./recognition/pipeline"

export type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "live"; width: number; height: number }
  | {
      status: "error"
      reason: "insecure" | "unsupported" | "denied" | "missing" | "failed"
      message: string
    }

/** Frames sent to the recognizer: a square from the middle of the video, at this size. */
export const FRAME_SIZE = 640
/** Share of the video's shorter side the frame square covers. */
export const FRAME_COVERAGE = 0.92

/**
 * The frame square in video pixels: centred in the part of the video that is visible under
 * `object-fit: cover` in a `viewWidth` × `viewHeight` box, so what the guide shows is what
 * gets scanned. The guide overlay draws the same square.
 */
export function frameSquare(
  videoWidth: number,
  videoHeight: number,
  viewWidth = videoWidth,
  viewHeight = videoHeight,
) {
  const viewAspect =
    viewWidth > 0 && viewHeight > 0 ? viewWidth / viewHeight : videoWidth / videoHeight
  const visibleWidth = Math.min(videoWidth, videoHeight * viewAspect)
  const visibleHeight = Math.min(videoHeight, videoWidth / viewAspect)
  const side = Math.min(visibleWidth, visibleHeight) * FRAME_COVERAGE
  return { x: (videoWidth - side) / 2, y: (videoHeight - side) / 2, side }
}

/**
 * The rear camera through getUserMedia, which the website, the PWA and the Capacitor
 * WebView all support (the native shells declare the camera permission).
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<CameraState>({ status: "idle" })
  // Bumped by every start and stop, so a getUserMedia call that resolves after a newer
  // start or a stop (for example React StrictMode's mount/unmount/mount) releases its stream.
  const generationRef = useRef(0)

  const stop = useCallback(() => {
    generationRef.current += 1
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState({ status: "idle" })
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return
    if (!window.isSecureContext) {
      setState({
        status: "error",
        reason: "insecure",
        message: "The camera needs a secure (HTTPS) connection to ManaVault.",
      })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        status: "error",
        reason: "unsupported",
        message: "This browser has no camera access.",
      })
      return
    }
    const generation = (generationRef.current += 1)
    setState({ status: "starting" })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      if (generation !== generationRef.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error("Camera view is not mounted")
      video.srcObject = stream
      await video.play()
      if (generation !== generationRef.current) return
      setState({ status: "live", width: video.videoWidth, height: video.videoHeight })
    } catch (error) {
      if (generation !== generationRef.current) return
      for (const track of streamRef.current?.getTracks() ?? []) track.stop()
      streamRef.current = null
      setState(cameraError(error))
    }
  }, [])

  useEffect(() => stop, [stop])

  /** The centre square of the current video frame as RGBA pixels, or null before video. */
  const grabFrame = useCallback((): RgbaImage | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) return null
    canvasRef.current ??= document.createElement("canvas")
    const canvas = canvasRef.current
    canvas.width = FRAME_SIZE
    canvas.height = FRAME_SIZE
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    const { x, y, side } = frameSquare(
      video.videoWidth,
      video.videoHeight,
      video.clientWidth,
      video.clientHeight,
    )
    context.drawImage(video, x, y, side, side, 0, 0, FRAME_SIZE, FRAME_SIZE)
    const pixels = context.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE)
    return { data: pixels.data, width: FRAME_SIZE, height: FRAME_SIZE }
  }, [])

  return { videoRef, state, start, stop, grabFrame }
}

function cameraError(error: unknown): CameraState {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      status: "error",
      reason: "denied",
      message: "Camera access was blocked. Allow the camera for ManaVault and try again.",
    }
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { status: "error", reason: "missing", message: "No camera was found on this device." }
  }
  return {
    status: "error",
    reason: "failed",
    message: error instanceof Error ? error.message : "The camera could not start.",
  }
}
