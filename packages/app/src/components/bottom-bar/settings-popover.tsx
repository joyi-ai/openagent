import { type ParentProps, createMemo, createSignal, Match, onMount, Show, Switch } from "solid-js"
import { Popover as Kobalte } from "@kobalte/core/popover"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ProgressCircle } from "@opencode-ai/ui/progress-circle"
import { Select } from "@opencode-ai/ui/select"
import { useVoice, type RecordingMode } from "@/context/voice"
import { formatKeybind } from "@/context/command"
import { useKeybindCapture } from "@/hooks/use-keybind-capture"

function VoiceSettingsContent() {
  const voice = useVoice()
  const { isCapturing, setIsCapturing, capturedKeybind, handleKeyDown } = useKeybindCapture(voice.settings.keybind())
  const [selectedMode, setSelectedMode] = createSignal<RecordingMode>(voice.settings.mode())
  const [selectedDevice, setSelectedDevice] = createSignal<string>(voice.settings.deviceId() ?? "default")

  const deviceOptions = createMemo(() => {
    const devices = voice.state.availableDevices()
    return [
      { id: "default", label: "System Default" },
      ...devices.map((device) => ({ id: device.id, label: device.label })),
    ]
  })

  const currentDevice = createMemo(() => {
    const options = deviceOptions()
    const currentId = selectedDevice()
    const match = options.find((option) => option.id === currentId)
    if (match) return match
    return options[0]
  })

  onMount(() => {
    voice.actions.refreshDevices()
  })

  const handleSave = () => {
    voice.settings.setKeybind(capturedKeybind())
    voice.settings.setMode(selectedMode())
    const deviceId = selectedDevice()
    voice.settings.setDeviceId(deviceId === "default" ? null : deviceId)
    voice.settings.markConfigured()
  }

  const handleDownload = () => {
    voice.actions.downloadModel()
  }

  return (
    <div class="w-80 flex flex-col gap-3">
      {/* Model Status */}
      <div class="flex flex-col gap-2">
        <div class="text-11-medium text-text-subtle">Model Status</div>
        <Switch>
          <Match when={voice.state.modelStatus() === "not-downloaded"}>
            <div class="flex items-center gap-2">
              <div class="flex-1 text-12-regular text-text-base">Model not downloaded (~700MB)</div>
              <Button variant="primary" size="small" onClick={handleDownload}>
                Download
              </Button>
            </div>
          </Match>
          <Match when={voice.state.modelStatus() === "downloading"}>
            <div class="flex items-center gap-3">
              <ProgressCircle percentage={voice.state.downloadProgress() * 100} size={16} />
              <div class="flex-1 text-12-regular text-text-base">
                Downloading... {Math.round(voice.state.downloadProgress() * 100)}%
              </div>
            </div>
          </Match>
          <Match when={voice.state.modelStatus() === "ready"}>
            <div class="flex items-center gap-2">
              <Icon name="check" size="small" class="text-icon-success-base" />
              <div class="text-12-regular text-text-success-base">Model ready</div>
            </div>
          </Match>
          <Match when={voice.state.modelStatus() === "error"}>
            <div class="flex items-center gap-2">
              <Icon name="circle-x" size="small" class="text-icon-critical-base" />
              <div class="flex-1 text-12-regular text-text-critical-base">
                {voice.state.error() || "Download failed"}
              </div>
              <Button variant="ghost" size="small" onClick={handleDownload}>
                Retry
              </Button>
            </div>
          </Match>
        </Switch>
      </div>

      {/* Microphone */}
      <div class="flex flex-col gap-2 pt-2 border-t border-border-weak-base">
        <div class="text-11-medium text-text-subtle">Microphone</div>
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <Select
              options={deviceOptions()}
              current={currentDevice()}
              value={(option) => option.id}
              label={(option) => option.label}
              onSelect={(option) => {
                const next = option?.id ?? "default"
                setSelectedDevice(next)
              }}
              variant="ghost"
              class="justify-between text-12-regular"
              disabled={!voice.state.isSupported()}
            />
          </div>
          <Button
            variant="ghost"
            size="small"
            onClick={() => voice.actions.refreshDevices()}
            disabled={!voice.state.isSupported()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Hotkey */}
      <div class="flex flex-col gap-2 pt-2 border-t border-border-weak-base">
        <div class="text-11-medium text-text-subtle">Hotkey</div>
        <button
          type="button"
          class="w-full px-3 py-1.5 rounded-md bg-surface-raised-base border border-border-base text-12-regular text-text-base text-left focus:outline-none focus:ring-2 focus:ring-border-focus-base"
          classList={{ "ring-2 ring-border-focus-base": isCapturing() }}
          onClick={() => setIsCapturing(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsCapturing(false)}
        >
          <Show when={!isCapturing()} fallback={<span class="text-text-subtle">Press keys...</span>}>
            <span class="font-mono">{formatKeybind(capturedKeybind())}</span>
          </Show>
        </button>
      </div>

      {/* Recording Mode */}
      <div class="flex flex-col gap-2 pt-2 border-t border-border-weak-base">
        <div class="text-11-medium text-text-subtle">Recording Mode</div>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-12-regular"
            classList={{
              "bg-surface-info-base/20 ring-1 ring-border-info-base": selectedMode() === "toggle",
              "bg-surface-raised-base hover:bg-surface-raised-hover": selectedMode() !== "toggle",
            }}
            onClick={() => setSelectedMode("toggle")}
          >
            <Icon name="microphone" size="small" class="text-icon-base" />
            Toggle
          </button>
          <button
            type="button"
            class="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-12-regular"
            classList={{
              "bg-surface-info-base/20 ring-1 ring-border-info-base": selectedMode() === "push-to-talk",
              "bg-surface-raised-base hover:bg-surface-raised-hover": selectedMode() !== "push-to-talk",
            }}
            onClick={() => setSelectedMode("push-to-talk")}
          >
            <Icon name="microphone" size="small" class="text-icon-base" />
            Push to Talk
          </button>
        </div>
      </div>

      {/* Save button */}
      <div class="pt-2 border-t border-border-weak-base">
        <Button
          variant="primary"
          size="small"
          class="w-full"
          onClick={handleSave}
          disabled={voice.state.modelStatus() !== "ready"}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

export function SettingsPopover(props: ParentProps) {
  return (
    <Kobalte gutter={8} placement="top-end" modal={false}>
      <Kobalte.Trigger as="div" class="cursor-pointer">
        {props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content class="z-50 rounded-lg border border-border-base bg-background-base shadow-lg p-3 animate-in fade-in-0 zoom-in-95">
          <div class="flex items-center justify-between pb-2 border-b border-border-weak-base mb-2">
            <div class="flex items-center gap-2">
              <Icon name="microphone" size="small" class="text-icon-base" />
              <span class="text-13-medium text-text-strong">Voice Settings</span>
            </div>
            <Kobalte.CloseButton as={IconButton} icon="close" variant="ghost" />
          </div>
          <VoiceSettingsContent />
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}
