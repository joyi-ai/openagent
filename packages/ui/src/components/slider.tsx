import { Slider as Kobalte } from "@kobalte/core/slider"
import { Show, splitProps, createMemo } from "solid-js"
import type { ComponentProps } from "solid-js"

export interface SliderProps extends Omit<ComponentProps<typeof Kobalte>, "children"> {
  label?: string
  showValue?: boolean
  formatValue?: (value: number) => string
}

export function Slider(props: SliderProps) {
  const [local, others] = splitProps(props, ["label", "showValue", "formatValue", "class", "value"])

  const formatFn = () => local.formatValue ?? ((v: number) => String(v))
  const displayValue = createMemo(() => {
    const val = local.value
    if (Array.isArray(val) && val.length > 0) {
      return formatFn()(val[0])
    }
    return ""
  })

  return (
    <Kobalte {...others} value={local.value} data-component="slider" class={local.class}>
      <Show when={local.label || local.showValue}>
        <div data-slot="slider-header">
          <Show when={local.label}>
            <Kobalte.Label data-slot="slider-label">{local.label}</Kobalte.Label>
          </Show>
          <Show when={local.showValue}>
            <span data-slot="slider-value">{displayValue()}</span>
          </Show>
        </div>
      </Show>
      <Kobalte.Track data-slot="slider-track">
        <Kobalte.Fill data-slot="slider-fill" />
        <Kobalte.Thumb data-slot="slider-thumb">
          <Kobalte.Input data-slot="slider-input" />
        </Kobalte.Thumb>
      </Kobalte.Track>
    </Kobalte>
  )
}
