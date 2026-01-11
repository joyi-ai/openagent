/**
 * Audio capture utility for streaming raw PCM samples to the Rust backend.
 * Captures audio at 16kHz mono float32 format for ONNX STT inference.
 */

type AudioChunkCallback = (samples: Float32Array) => void
type AudioLevelCallback = (levels: number[]) => void

export class AudioCapture {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private onAudioChunk: AudioChunkCallback | null = null
  private onAudioLevel: AudioLevelCallback | null = null

  async start(
    onAudioChunk: AudioChunkCallback,
    onAudioLevel?: AudioLevelCallback,
    deviceId?: string | null,
  ): Promise<void> {
    if (this.audioContext) {
      throw new Error("AudioCapture already started")
    }

    this.onAudioChunk = onAudioChunk
    this.onAudioLevel = onAudioLevel ?? null

    // Request microphone access with 16kHz sample rate
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    })

    // Create audio context at 16kHz
    this.audioContext = new AudioContext({ sampleRate: 16000 })

    // Create source from stream
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream)

    // Use ScriptProcessorNode for audio processing
    // Buffer size of 4096 samples at 16kHz = ~256ms chunks
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)

    this.processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0)
      // Create a copy of the samples since the buffer is reused
      const samples = new Float32Array(inputData.length)
      samples.set(inputData)
      this.onAudioChunk?.(samples)

      // Calculate audio levels for visualization
      if (this.onAudioLevel) {
        const levels = calculateAudioLevels(inputData)
        this.onAudioLevel(levels)
      }
    }

    // Connect: source -> processor -> destination (required for processor to work)
    this.source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
  }

  stop(): void {
    // Disconnect processor
    if (this.processor) {
      this.processor.disconnect()
      this.processor.onaudioprocess = null
      this.processor = null
    }

    // Disconnect source
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    // Stop all tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.onAudioChunk = null
    this.onAudioLevel = null
  }

  isRecording(): boolean {
    return this.audioContext !== null
  }
}

/**
 * Check if audio capture is supported in the current environment
 */
export function isAudioCaptureSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices !== "undefined" &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof AudioContext !== "undefined"
  )
}

/**
 * Calculate audio levels from samples for visualization.
 * Returns an array of RMS values for multiple frequency bands.
 */
function calculateAudioLevels(samples: Float32Array): number[] {
  const bandCount = 8
  const samplesPerBand = Math.floor(samples.length / bandCount)
  const levels: number[] = []

  for (let band = 0; band < bandCount; band++) {
    const start = band * samplesPerBand
    const end = start + samplesPerBand
    let sum = 0

    for (let i = start; i < end; i++) {
      sum += samples[i] * samples[i]
    }

    // RMS value normalized to 0-1 range
    const rms = Math.sqrt(sum / samplesPerBand)
    // Apply moderate gain and clamp (reduced from 4 to 1.5 for less sensitivity)
    const level = Math.min(1, rms * 1.5)
    levels.push(level)
  }

  return levels
}
