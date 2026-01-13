import { createSignal, createEffect, splitProps } from "solid-js"
import type { ComponentProps } from "solid-js"

export interface ColorPickerProps extends Omit<ComponentProps<"div">, "onChange"> {
  value?: string
  onChange?: (value: string) => void
  label?: string
}

function isValidHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

function normalizeHex(value: string): string {
  const clean = value.replace(/[^0-9A-Fa-f#]/g, "")
  if (!clean.startsWith("#")) return "#" + clean.slice(0, 6)
  return clean.slice(0, 7)
}

export function ColorPicker(props: ColorPickerProps) {
  const [local, others] = splitProps(props, ["value", "onChange", "label", "class"])
  const [hexInput, setHexInput] = createSignal(local.value ?? "#000000")

  createEffect(() => {
    const val = local.value
    if (val && isValidHex(val)) {
      setHexInput(val.toUpperCase())
    }
  })

  const handleColorInput = (e: Event) => {
    const target = e.target as HTMLInputElement
    const value = target.value.toUpperCase()
    setHexInput(value)
    local.onChange?.(value)
  }

  const handleTextInput = (e: Event) => {
    const target = e.target as HTMLInputElement
    const normalized = normalizeHex(target.value).toUpperCase()
    setHexInput(normalized)
    if (isValidHex(normalized)) {
      local.onChange?.(normalized)
    }
  }

  const handleTextBlur = () => {
    const current = hexInput()
    if (!isValidHex(current)) {
      const fallback = local.value ?? "#000000"
      setHexInput(fallback.toUpperCase())
    }
  }

  return (
    <div {...others} data-component="color-picker" class={local.class}>
      <label data-slot="color-picker-swatch">
        <input
          type="color"
          value={hexInput()}
          onInput={handleColorInput}
          data-slot="color-picker-input"
        />
        <span
          data-slot="color-picker-preview"
          style={{ "background-color": hexInput() }}
        />
      </label>
      <input
        type="text"
        value={hexInput()}
        onInput={handleTextInput}
        onBlur={handleTextBlur}
        maxLength={7}
        data-slot="color-picker-hex"
      />
    </div>
  )
}
