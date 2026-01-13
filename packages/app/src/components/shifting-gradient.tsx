import { Index, createEffect, createSignal, on, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "@opencode-ai/ui/theme"
import type { CustomGradient } from "@opencode-ai/ui/theme/context"

type RGB = {
  r: number
  g: number
  b: number
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  }
}

type Blob = {
  x: number
  y: number
  size: number
  scale: number
  blur: number
  alpha: number
  color: RGB
}

const [trigger, setTrigger] = createSignal(0)
const gate = { queued: false }

export function triggerShiftingGradient() {
  if (gate.queued) return
  gate.queued = true
  requestAnimationFrame(() => {
    gate.queued = false
    setTrigger((x) => x + 1)
  })
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function parseHex(hex: string): RGB | null {
  const value = hex.trim()
  if (!value.startsWith("#")) return null
  const raw = value.slice(1)
  if (raw.length !== 3 && raw.length !== 6) return null
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw
  const int = Number.parseInt(expanded, 16)
  if (Number.isNaN(int)) return null
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

function parseRgb(value: string): RGB | null {
  const match = value.trim().match(/^rgba?\(([^)]+)\)$/)
  if (!match) return null
  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()))
  if (parts.length < 3) return null
  if (parts.some((part) => Number.isNaN(part))) return null
  return { r: parts[0], g: parts[1], b: parts[2] }
}

function parseColor(value: string): RGB | null {
  const hex = parseHex(value)
  if (hex) return hex
  return parseRgb(value)
}

type HSL = { h: number; s: number; l: number }

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h, s, l }
}

function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl

  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

function applyAdjustments(rgb: RGB, saturation: number, brightness: number, contrast: number): RGB {
  const hsl = rgbToHsl(rgb)

  // Apply saturation adjustment (100 = no change)
  const satFactor = saturation / 100
  hsl.s = Math.min(1, Math.max(0, hsl.s * satFactor))

  // Apply brightness adjustment (100 = no change)
  const brightFactor = brightness / 100
  hsl.l = Math.min(1, Math.max(0, hsl.l * brightFactor))

  let result = hslToRgb(hsl)

  // Apply contrast adjustment (100 = no change)
  const contrastFactor = (contrast - 100) / 100
  const adjust = (v: number) => {
    const normalized = v / 255 - 0.5
    const adjusted = normalized * (1 + contrastFactor) + 0.5
    return Math.round(Math.min(255, Math.max(0, adjusted * 255)))
  }

  result = {
    r: adjust(result.r),
    g: adjust(result.g),
    b: adjust(result.b),
  }

  return result
}

function getCustomPalette(custom: CustomGradient): RGB[] {
  return custom.colors.map((hex) => {
    const rgb = parseHex(hex) ?? { r: 120, g: 120, b: 120 }
    return applyAdjustments(rgb, custom.saturation, custom.brightness, custom.contrast)
  })
}

function readPalette(mode: "light" | "dark", relative = false): RGB[] {
  const root = getComputedStyle(document.documentElement)
  const fallback = parseColor(root.getPropertyValue("--text-strong")) ?? { r: 120, g: 120, b: 120 }
  const base = parseColor(root.getPropertyValue("--background-base")) ?? fallback

  if (relative) {
    // Relative: subtle colors blended heavily with background
    const tokens = [
      "--text-interactive-base",
      "--surface-info-strong",
      "--surface-success-strong",
      "--surface-warning-strong",
      "--surface-brand-base",
    ]
    const strength = mode === "dark" ? 0.35 : 0.4
    return tokens.map((token) => {
      const color = parseColor(root.getPropertyValue(token)) ?? fallback
      return mixRgb(base, color, strength)
    })
  }

  // Strong: use theme's accent/brand colors at high saturation
  const brandColor = parseColor(root.getPropertyValue("--surface-brand-base")) ?? fallback
  const accentColor =
    parseColor(root.getPropertyValue("--text-accent-base")) ??
    parseColor(root.getPropertyValue("--text-interactive-base")) ??
    brandColor
  const strength = mode === "dark" ? 0.65 : 0.75

  return [
    mixRgb(base, brandColor, strength),
    mixRgb(base, accentColor, strength),
    mixRgb(base, brandColor, strength * 0.85),
    mixRgb(base, accentColor, strength * 0.88),
    mixRgb(base, brandColor, strength * 0.9),
  ]
}

const BASE_POSITIONS = [
  { x: 16, y: 14 },
  { x: 86, y: 16 },
  { x: 18, y: 88 },
  { x: 88, y: 88 },
  { x: 52, y: 54 },
]

function blobs(colors: RGB[], crisp = false, blurMultiplier = 1): Blob[] {
  const list: Blob[] = []
  const blurRange = crisp ? { min: 20, max: 40 } : { min: 120, max: 200 }

  for (let i = 0; i < BASE_POSITIONS.length; i++) {
    const b = BASE_POSITIONS[i]
    const size = Math.round(rand(1020, 1280))
    const baseBlur = rand(blurRange.min, blurRange.max)
    list.push({
      x: rand(b.x - 6, b.x + 6),
      y: rand(b.y - 6, b.y + 6),
      size,
      scale: rand(0.9, 1.15),
      blur: Math.round(baseBlur * blurMultiplier),
      alpha: rand(0.88, 1.0),
      color: colors[i],
    })
  }

  return list
}

function updateBlobPositions(
  setStore: (path: "blobs", index: number, key: keyof Blob, value: number | RGB) => void,
  colors: RGB[],
  crisp = false,
  blurMultiplier = 1,
) {
  const blurRange = crisp ? { min: 20, max: 40 } : { min: 120, max: 200 }

  for (let i = 0; i < BASE_POSITIONS.length; i++) {
    const b = BASE_POSITIONS[i]
    const baseBlur = rand(blurRange.min, blurRange.max)
    setStore("blobs", i, "x", rand(b.x - 5, b.x + 5))
    setStore("blobs", i, "y", rand(b.y - 5, b.y + 5))
    setStore("blobs", i, "scale", rand(0.9, 1.15))
    setStore("blobs", i, "blur", Math.round(baseBlur * blurMultiplier))
    setStore("blobs", i, "alpha", rand(0.88, 1.0))
    setStore("blobs", i, "color", colors[i])
  }
}

function updateBlobSettingsOnly(
  setStore: (path: "blobs", index: number, key: keyof Blob, value: number | RGB) => void,
  colors: RGB[],
  blurMultiplier = 1,
  currentBlobs: Blob[],
  crisp = false,
) {
  const blurRange = crisp ? { min: 20, max: 40 } : { min: 120, max: 200 }
  const baseBlur = (blurRange.min + blurRange.max) / 2
  for (let i = 0; i < colors.length; i++) {
    setStore("blobs", i, "color", colors[i])
    // Keep relative blur values but apply multiplier
    const currentBaseBlur = currentBlobs[i]?.blur ?? baseBlur
    const originalMultiplier = currentBaseBlur / baseBlur
    setStore("blobs", i, "blur", Math.round(baseBlur * originalMultiplier * blurMultiplier))
  }
}

export const GRAIN_DATA_URI =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27160%27%20height%3D%27160%27%20viewBox%3D%270%200%20160%20160%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.8%27%20numOctaves%3D%274%27%20stitchTiles%3D%27stitch%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27160%27%20height%3D%27160%27%20filter%3D%27url(%23n)%27%20opacity%3D%270.45%27%2F%3E%3C%2Fsvg%3E"

export function ShiftingGradient(props: { class?: string }) {
  const theme = useTheme()
  const [store, setStore] = createStore({
    ready: false,
    blobs: [] as Blob[],
    palette: [] as RGB[],
  })

  const isCrisp = () => theme.activeGradientMode() === "crisp"
  const isRelative = () => theme.activeGradientColor() === "relative"
  const getBlurMultiplier = () => {
    const custom = theme.activeCustomGradient()
    return custom ? custom.blur / 100 : 1
  }

  const getPalette = () => {
    const custom = theme.activeCustomGradient()
    if (custom) {
      return getCustomPalette(custom)
    }
    return readPalette(theme.mode(), isRelative())
  }

  onMount(() => {
    const palette = getPalette()
    setStore("palette", palette)
    setStore("blobs", blobs(palette, isCrisp(), getBlurMultiplier()))
    requestAnimationFrame(() => setStore("ready", true))
  })

  createEffect(
    on(
      () => {
        const custom = theme.activeCustomGradient()
        return [
          theme.themeId(),
          theme.mode(),
          theme.activeGradientMode(),
          theme.activeGradientColor(),
          theme.previewThemeId(),
          custom ? JSON.stringify(custom) : null,
        ]
      },
      () => {
        const isPreviewing = theme.isCustomGradientPreviewing()
        const blurMult = getBlurMultiplier()
        // Wait for CSS custom properties to be applied before reading the new palette
        requestAnimationFrame(() => {
          const palette = getPalette()
          setStore("palette", palette)
          if (store.blobs.length === 0) {
            setStore("blobs", blobs(palette, isCrisp(), blurMult))
          } else if (isPreviewing) {
            // Only update colors and blur when previewing advanced settings (no position animation)
            updateBlobSettingsOnly(setStore, palette, blurMult, store.blobs, isCrisp())
          } else {
            updateBlobPositions(setStore, palette, isCrisp(), blurMult)
          }
        })
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => trigger(),
      () => {
        const palette = store.palette.length > 0 ? store.palette : getPalette()
        const blurMult = getBlurMultiplier()
        if (store.blobs.length === 0) {
          setStore("blobs", blobs(palette, isCrisp(), blurMult))
        } else {
          updateBlobPositions(setStore, palette, isCrisp(), blurMult)
        }
      },
      { defer: true },
    ),
  )

  return (
    <div aria-hidden="true" class={`pointer-events-none absolute inset-0 overflow-hidden ${props.class ?? ""}`}>
      <Index each={store.blobs}>
        {(item) => (
          <div
            class="absolute left-0 top-0"
            style={{
              width: `${item().size}px`,
              height: `${item().size}px`,
              left: `${item().x}%`,
              top: `${item().y}%`,
              transform: `translate3d(-50%, -50%, 0) scale(${item().scale})`,
              transition: store.ready
                ? "left 1000ms cubic-bezier(0.22, 1, 0.36, 1), top 3200ms cubic-bezier(0.22, 1, 0.36, 1), transform 1000ms cubic-bezier(0.22, 1, 0.36, 1)"
                : "none",
              "will-change": "left, top, transform",
              filter: `blur(${item().blur}px)`,
              "border-radius": "9999px",
              background:
                `radial-gradient(circle at center, ` +
                `rgba(${item().color.r}, ${item().color.g}, ${item().color.b}, ${item().alpha}) 0%, ` +
                `rgba(${item().color.r}, ${item().color.g}, ${item().color.b}, ${Math.max(0, item().alpha - 0.18)}) 26%, ` +
                `transparent 72%)`,
            }}
          />
        )}
      </Index>
    </div>
  )
}
