import { createSignal, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { persisted } from "@/utils/persist"
import { usePlatform } from "./platform"
import { useCommand, parseKeybind, matchKeybind } from "./command"
import { AudioCapture, isAudioCaptureSupported } from "@/utils/audio-capture"

export type ModelStatus = "not-downloaded" | "downloading" | "ready" | "error"
export type RecordingMode = "toggle" | "push-to-talk"

type AudioDevice = { id: string; label: string }

type SttStatus = {
  modelStatus:
    | { type: "NotDownloaded" }
    | { type: "Downloading"; progress: number }
    | { type: "Ready" }
    | { type: "Error"; message: string }
  isRecording: boolean
}

const truncateDeviceId = (value: string) => {
  if (value.length <= 8) return value
  return `${value.slice(0, 8)}...`
}

export const { use: useVoice, provider: VoiceProvider } = createSimpleContext({
  name: "Voice",
  init: () => {
    const platform = usePlatform()
    const command = useCommand()
    const isDesktop = platform.platform === "desktop"
    const invoke = platform.invoke
    const listen = platform.listen

    // Persisted settings
    const [settings, setSettings, , ready] = persisted(
      "voice.v2",
      createStore({
        keybind: "mod+shift+v",
        hasConfigured: false,
        mode: "toggle" as RecordingMode,
        deviceId: null as string | null,
      }),
    )

    // Runtime state
    const [isRecording, setIsRecording] = createSignal(false)
    const [isTranscribing, setIsTranscribing] = createSignal(false)
    const [modelStatus, setModelStatus] = createSignal<ModelStatus>("not-downloaded")
    const [downloadProgress, setDownloadProgress] = createSignal(0)
    const [lastTranscription, setLastTranscription] = createSignal<string | null>(null)
    const [error, setError] = createSignal<string | null>(null)
    const [audioLevels, setAudioLevels] = createSignal<number[]>([])
    const [availableDevices, setAvailableDevices] = createSignal<AudioDevice[]>([])

    // Audio capture instance
    let audioCapture: AudioCapture | null = null

    const refreshDevices = () => {
      if (!isAudioCaptureSupported()) return
      if (typeof navigator.mediaDevices.enumerateDevices !== "function") return

      return navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const inputs = devices
            .filter((device) => device.kind === "audioinput")
            .filter((device) => device.deviceId !== "default")
            .map((device) => {
              const label = device.label.trim()
              const fallback = truncateDeviceId(device.deviceId)
              return {
                id: device.deviceId,
                label: label.length > 0 ? label : fallback,
              }
            })
          setAvailableDevices(inputs)

          const selected = settings.deviceId
          if (selected && !inputs.some((device) => device.id === selected)) {
            setSettings("deviceId", null)
          }
        })
        .catch((err) => {
          console.error("Failed to enumerate audio devices:", err)
        })
    }

    onMount(() => {
      refreshDevices()
    })

    // Initialize on mount for Tauri
    onMount(async () => {
      if (!isDesktop || !invoke) return

      // Get initial status
      try {
        const status = await invoke<SttStatus>("stt_get_status")
        if (status.modelStatus.type === "Ready") {
          setModelStatus("ready")
        } else if (status.modelStatus.type === "Downloading") {
          setModelStatus("downloading")
          setDownloadProgress(status.modelStatus.progress)
        } else if (status.modelStatus.type === "Error") {
          setModelStatus("error")
          setError(status.modelStatus.message)
        }
      } catch (e) {
        console.error("Failed to get STT status:", e)
      }

      // Listen for download progress events
      if (listen) {
        const unlisten = await listen<number>("stt:download-progress", (progress) => {
          setDownloadProgress(progress)
          if (progress >= 1) {
            setModelStatus("ready")
          }
        })

        onCleanup(() => {
          unlisten()
          if (audioCapture) {
            audioCapture.stop()
            audioCapture = null
          }
        })
      }
    })

    const downloadModel = async () => {
      if (!isDesktop || !invoke) return

      setModelStatus("downloading")
      setDownloadProgress(0)
      setError(null)

      try {
        await invoke("stt_download_model")
        setModelStatus("ready")
      } catch (e) {
        setModelStatus("error")
        setError(e instanceof Error ? e.message : String(e))
        console.error("Failed to download model:", e)
      }
    }

    const startRecording = async () => {
      if (!isDesktop || !invoke || !isAudioCaptureSupported()) {
        setError("Audio capture not supported")
        return
      }

      if (modelStatus() !== "ready") {
        setError("Model not ready")
        return
      }

      if (isRecording()) return

      setError(null)
      setLastTranscription(null)

      try {
        // Tell backend we're starting
        await invoke("stt_start_recording")

        // Start audio capture
        audioCapture = new AudioCapture()
        await audioCapture.start(
          async (samples) => {
            // Send audio chunks to backend
            try {
              await invoke("stt_push_audio", { samples: Array.from(samples) })
            } catch (e) {
              console.error("Failed to push audio:", e)
            }
          },
          (levels) => {
            // Update audio levels for visualization
            setAudioLevels(levels)
          },
          settings.deviceId,
        )

        refreshDevices()
        setIsRecording(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        console.error("Failed to start recording:", e)
      }
    }

    const stopRecording = async () => {
      if (!isRecording() || !invoke) return

      // Stop audio capture
      if (audioCapture) {
        audioCapture.stop()
        audioCapture = null
      }

      setIsRecording(false)
      setIsTranscribing(true)
      setAudioLevels([])

      try {
        // Get transcription from backend
        const text = await invoke<string>("stt_stop_and_transcribe")
        setLastTranscription(text)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        console.error("Failed to transcribe:", e)
      } finally {
        setIsTranscribing(false)
      }
    }

    const toggle = async () => {
      if (isRecording()) {
        await stopRecording()
      } else {
        await startRecording()
      }
    }

    const clearTranscription = () => {
      setLastTranscription(null)
    }

    // Register voice command with keybind system
    if (isDesktop) {
      command.register(() => [
        {
          id: "voice.toggle",
          title: settings.mode === "toggle" ? "Toggle Voice Input" : "Push to Talk",
          category: "Voice",
          keybind: settings.keybind,
          disabled: modelStatus() !== "ready",
          onSelect: () => {
            if (modelStatus() === "ready") {
              if (settings.mode === "toggle") {
                toggle()
              } else {
                // Push-to-talk: start recording on keydown
                startRecording()
              }
            }
          },
        },
      ])

      // Handle keyup for push-to-talk mode
      const handleKeyUp = (event: KeyboardEvent) => {
        if (settings.mode !== "push-to-talk") return
        if (modelStatus() !== "ready") return
        if (!isRecording()) return

        const keybinds = parseKeybind(settings.keybind)
        if (matchKeybind(keybinds, event)) {
          stopRecording()
        }
      }

      onMount(() => {
        document.addEventListener("keyup", handleKeyUp)
      })

      onCleanup(() => {
        document.removeEventListener("keyup", handleKeyUp)
      })
    }

    const markConfigured = () => {
      setSettings("hasConfigured", true)
    }

    const setKeybind = (keybind: string) => {
      setSettings("keybind", keybind)
    }

    const setMode = (mode: RecordingMode) => {
      setSettings("mode", mode)
    }

    const setDeviceId = (deviceId: string | null) => {
      setSettings("deviceId", deviceId)
    }

    return {
      // Settings
      settings: {
        keybind: () => settings.keybind,
        setKeybind,
        hasConfigured: () => settings.hasConfigured,
        markConfigured,
        mode: () => settings.mode,
        setMode,
        deviceId: () => settings.deviceId,
        setDeviceId,
        ready,
      },

      // State
      state: {
        isRecording,
        isTranscribing,
        modelStatus,
        downloadProgress,
        lastTranscription,
        error,
        audioLevels,
        availableDevices,
        isSupported: () => isDesktop && isAudioCaptureSupported(),
      },

      // Actions
      actions: {
        downloadModel,
        startRecording,
        stopRecording,
        toggle,
        clearTranscription,
        refreshDevices,
      },
    }
  },
})
