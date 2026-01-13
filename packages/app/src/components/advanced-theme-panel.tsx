import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { createSignal, createEffect, Show, For } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Slider } from "@opencode-ai/ui/slider"
import { ColorPicker } from "@opencode-ai/ui/color-picker"
import { useTheme } from "@opencode-ai/ui/theme"
import type { CustomGradient } from "@opencode-ai/ui/theme/context"
import "./advanced-theme-panel.css"

const DEFAULT_GRADIENT: CustomGradient = {
  name: "Custom",
  saturation: 100,
  brightness: 100,
  contrast: 100,
  blur: 100,
  noise: 100,
  colors: ["#5E81AC", "#B48EAD", "#A3BE8C", "#EBCB8B", "#88C0D0"],
}

const BLOB_LABELS = ["Blob 1", "Blob 2", "Blob 3", "Blob 4", "Blob 5"]

interface AdvancedThemePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editGradient?: CustomGradient | null
}

export function AdvancedThemePanel(props: AdvancedThemePanelProps) {
  const theme = useTheme()

  const [name, setName] = createSignal(DEFAULT_GRADIENT.name)
  const [saturation, setSaturation] = createSignal(DEFAULT_GRADIENT.saturation)
  const [brightness, setBrightness] = createSignal(DEFAULT_GRADIENT.brightness)
  const [contrast, setContrast] = createSignal(DEFAULT_GRADIENT.contrast)
  const [blur, setBlur] = createSignal(DEFAULT_GRADIENT.blur)
  const [noise, setNoise] = createSignal(DEFAULT_GRADIENT.noise)
  const [colors, setColors] = createSignal<[string, string, string, string, string]>([...DEFAULT_GRADIENT.colors])

  createEffect(() => {
    // When opening, use editGradient if provided, then customGradient, then defaults
    if (!props.open) return
    const edit = props.editGradient
    const custom = edit ?? theme.customGradient()
    if (custom) {
      setName(custom.name)
      setSaturation(custom.saturation)
      setBrightness(custom.brightness)
      setContrast(custom.contrast)
      setBlur(custom.blur ?? DEFAULT_GRADIENT.blur)
      setNoise(custom.noise ?? DEFAULT_GRADIENT.noise)
      setColors([...custom.colors])
    } else {
      setName(DEFAULT_GRADIENT.name)
      setSaturation(DEFAULT_GRADIENT.saturation)
      setBrightness(DEFAULT_GRADIENT.brightness)
      setContrast(DEFAULT_GRADIENT.contrast)
      setBlur(DEFAULT_GRADIENT.blur)
      setNoise(DEFAULT_GRADIENT.noise)
      setColors([...DEFAULT_GRADIENT.colors])
    }
  })

  const updatePreview = () => {
    theme.previewCustomGradient({
      name: name(),
      saturation: saturation(),
      brightness: brightness(),
      contrast: contrast(),
      blur: blur(),
      noise: noise(),
      colors: colors(),
    })
  }

  const handleSliderChange = (setter: (v: number) => void) => (values: number[]) => {
    setter(values[0])
    updatePreview()
  }

  const handleColorChange = (index: number) => (value: string) => {
    const newColors = [...colors()] as [string, string, string, string, string]
    newColors[index] = value
    setColors(newColors)
    updatePreview()
  }

  const handleSave = () => {
    theme.saveGradient({
      name: name(),
      saturation: saturation(),
      brightness: brightness(),
      contrast: contrast(),
      blur: blur(),
      noise: noise(),
      colors: colors(),
    })
    props.onOpenChange(false)
  }

  const handleCancel = () => {
    theme.cancelCustomGradientPreview()
    props.onOpenChange(false)
  }

  const handleReset = () => {
    setName(DEFAULT_GRADIENT.name)
    setSaturation(DEFAULT_GRADIENT.saturation)
    setBrightness(DEFAULT_GRADIENT.brightness)
    setContrast(DEFAULT_GRADIENT.contrast)
    setBlur(DEFAULT_GRADIENT.blur)
    setNoise(DEFAULT_GRADIENT.noise)
    setColors([...DEFAULT_GRADIENT.colors])
    updatePreview()
  }

  const handleClear = () => {
    theme.clearCustomGradient()
    props.onOpenChange(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Cancel preview when dialog closes without explicit save
      theme.cancelCustomGradientPreview()
    }
    props.onOpenChange(open)
  }

  return (
    <Kobalte open={props.open} onOpenChange={handleOpenChange} modal={false}>
      <Kobalte.Portal>
        <div data-component="advanced-theme-panel">
          <Kobalte.Content data-slot="panel-content">
            <div data-slot="panel-header">
              <Kobalte.Title data-slot="panel-title">Advanced Theme</Kobalte.Title>
              <Kobalte.CloseButton as={IconButton} icon="close" variant="ghost" />
            </div>

            <div data-slot="panel-body">
              <div data-slot="section">
                <label data-slot="section-label">Theme Name</label>
                <TextField
                  value={name()}
                  onChange={(value) => setName(value)}
                  placeholder="Custom Theme"
                />
              </div>

              <div data-slot="section">
                <label data-slot="section-label">Adjustments</label>
                <div data-slot="sliders">
                  <Slider
                    label="Saturation"
                    showValue
                    value={[saturation()]}
                    onChange={handleSliderChange(setSaturation)}
                    minValue={0}
                    maxValue={200}
                    step={1}
                    formatValue={(v) => `${v}%`}
                  />
                  <Slider
                    label="Brightness"
                    showValue
                    value={[brightness()]}
                    onChange={handleSliderChange(setBrightness)}
                    minValue={0}
                    maxValue={200}
                    step={1}
                    formatValue={(v) => `${v}%`}
                  />
                  <Slider
                    label="Contrast"
                    showValue
                    value={[contrast()]}
                    onChange={handleSliderChange(setContrast)}
                    minValue={0}
                    maxValue={200}
                    step={1}
                    formatValue={(v) => `${v}%`}
                  />
                  <Slider
                    label="Blur"
                    showValue
                    value={[blur()]}
                    onChange={handleSliderChange(setBlur)}
                    minValue={0}
                    maxValue={200}
                    step={1}
                    formatValue={(v) => `${v}%`}
                  />
                  <Slider
                    label="Noise"
                    showValue
                    value={[noise()]}
                    onChange={handleSliderChange(setNoise)}
                    minValue={0}
                    maxValue={200}
                    step={1}
                    formatValue={(v) => `${v}%`}
                  />
                </div>
              </div>

              <div data-slot="section">
                <label data-slot="section-label">Blob Colors</label>
                <div data-slot="color-pickers">
                  <For each={BLOB_LABELS}>
                    {(label, index) => (
                      <div data-slot="color-picker-row">
                        <span data-slot="color-picker-label">{label}</span>
                        <ColorPicker
                          value={colors()[index()]}
                          onChange={handleColorChange(index())}
                        />
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </div>

            <div data-slot="panel-footer">
              <div data-slot="footer-secondary">
                <Button variant="ghost" size="small" onClick={handleReset}>
                  Reset
                </Button>
                <Show when={theme.customGradient()}>
                  <Button variant="ghost" size="small" onClick={handleClear}>
                    Clear
                  </Button>
                </Show>
              </div>
              <div data-slot="footer-primary">
                <Button variant="secondary" size="small" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button variant="primary" size="small" onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
          </Kobalte.Content>
        </div>
      </Kobalte.Portal>
    </Kobalte>
  )
}
