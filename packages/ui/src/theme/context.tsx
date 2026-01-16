import { onMount, onCleanup, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import type { DesktopTheme } from "./types"
import { resolveThemeVariant, themeToCss } from "./resolve"
import { DEFAULT_THEMES } from "./default-themes"
import { createSimpleContext } from "../context/helper"

export type ColorScheme = "light" | "dark" | "system"

export type GradientMode = "soft" | "crisp"
export type GradientColor = "relative" | "strong"

export interface CustomGradient {
  name: string
  saturation: number
  brightness: number
  contrast: number
  blur: number
  noise: number
  colors: [string, string, string, string, string]
}

const STORAGE_KEYS = {
  THEME_ID: "opencode-theme-id",
  COLOR_SCHEME: "opencode-color-scheme",
  THEME_CSS_LIGHT: "opencode-theme-css-light",
  THEME_CSS_DARK: "opencode-theme-css-dark",
  GRADIENT_MODE: "opencode-gradient-mode",
  GRADIENT_COLOR: "opencode-gradient-color",
  CUSTOM_GRADIENT: "opencode-custom-gradient",
  SAVED_GRADIENTS: "opencode-saved-gradients",
} as const

const THEME_STYLE_ID = "oc-theme"

function ensureThemeStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
  if (existing) return existing
  const element = document.createElement("style")
  element.id = THEME_STYLE_ID
  document.head.appendChild(element)
  return element
}

function getSystemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyThemeCss(theme: DesktopTheme, themeId: string, mode: "light" | "dark") {
  const isDark = mode === "dark"
  const variant = isDark ? theme.dark : theme.light
  const tokens = resolveThemeVariant(variant, isDark)
  const css = themeToCss(tokens)

  if (themeId !== "oc-1") {
    try {
      localStorage.setItem(isDark ? STORAGE_KEYS.THEME_CSS_DARK : STORAGE_KEYS.THEME_CSS_LIGHT, css)
    } catch {}
  }

  const fullCss = `:root {
  color-scheme: ${mode};
  --text-mix-blend-mode: ${isDark ? "plus-lighter" : "multiply"};
  ${css}
}`

  document.getElementById("oc-theme-preload")?.remove()
  ensureThemeStyleElement().textContent = fullCss
  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
}

function cacheThemeVariants(theme: DesktopTheme, themeId: string) {
  if (themeId === "oc-1") return
  for (const mode of ["light", "dark"] as const) {
    const isDark = mode === "dark"
    const variant = isDark ? theme.dark : theme.light
    const tokens = resolveThemeVariant(variant, isDark)
    const css = themeToCss(tokens)
    try {
      localStorage.setItem(isDark ? STORAGE_KEYS.THEME_CSS_DARK : STORAGE_KEYS.THEME_CSS_LIGHT, css)
    } catch {}
  }
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props: { defaultTheme?: string }) => {
    const [store, setStore] = createStore({
      themes: DEFAULT_THEMES as Record<string, DesktopTheme>,
      themeId: props.defaultTheme ?? "tokyonight",
      colorScheme: "system" as ColorScheme,
      mode: getSystemMode(),
      gradientMode: "soft" as GradientMode,
      gradientColor: "relative" as GradientColor,
      customGradient: null as CustomGradient | null,
      savedGradients: [] as CustomGradient[],
      previewThemeId: null as string | null,
      previewScheme: null as ColorScheme | null,
      previewGradientMode: null as GradientMode | null,
      previewGradientColor: null as GradientColor | null,
      previewCustomGradient: null as CustomGradient | null,
    })

    onMount(() => {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
      const handler = () => {
        if (store.colorScheme === "system") {
          setStore("mode", getSystemMode())
        }
      }
      mediaQuery.addEventListener("change", handler)
      onCleanup(() => mediaQuery.removeEventListener("change", handler))

      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME_ID)
      const savedScheme = localStorage.getItem(STORAGE_KEYS.COLOR_SCHEME) as ColorScheme | null
      const savedGradientMode = localStorage.getItem(STORAGE_KEYS.GRADIENT_MODE) as GradientMode | null
      if (savedTheme && store.themes[savedTheme]) {
        setStore("themeId", savedTheme)
      }
      if (savedScheme) {
        setStore("colorScheme", savedScheme)
        if (savedScheme !== "system") {
          setStore("mode", savedScheme)
        }
      }
      if (savedGradientMode && (savedGradientMode === "soft" || savedGradientMode === "crisp")) {
        setStore("gradientMode", savedGradientMode)
      }
      const savedGradientColor = localStorage.getItem(STORAGE_KEYS.GRADIENT_COLOR) as GradientColor | null
      if (savedGradientColor && (savedGradientColor === "relative" || savedGradientColor === "strong")) {
        setStore("gradientColor", savedGradientColor)
      }
      const savedCustomGradient = localStorage.getItem(STORAGE_KEYS.CUSTOM_GRADIENT)
      if (savedCustomGradient) {
        try {
          const parsed = JSON.parse(savedCustomGradient) as CustomGradient
          if (
            parsed.name &&
            typeof parsed.saturation === "number" &&
            Array.isArray(parsed.colors) &&
            parsed.colors.length === 5
          ) {
            setStore("customGradient", parsed)
          }
        } catch {}
      }
      const savedGradients = localStorage.getItem(STORAGE_KEYS.SAVED_GRADIENTS)
      if (savedGradients) {
        try {
          const parsed = JSON.parse(savedGradients) as CustomGradient[]
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(
              (g) => g.name && typeof g.saturation === "number" && Array.isArray(g.colors) && g.colors.length === 5,
            )
            setStore("savedGradients", valid)
          }
        } catch {}
      }
      const currentTheme = store.themes[store.themeId]
      if (currentTheme) {
        cacheThemeVariants(currentTheme, store.themeId)
      }
    })

    createEffect(() => {
      if (store.previewThemeId || store.previewScheme) return
      const theme = store.themes[store.themeId]
      if (theme) {
        applyThemeCss(theme, store.themeId, store.mode)
      }
    })

    const resolvePreviewMode = (scheme: ColorScheme | null) => {
      if (!scheme) return store.mode
      if (scheme === "system") return getSystemMode()
      return scheme
    }

    const setTheme = (id: string) => {
      const theme = store.themes[id]
      if (!theme) {
        console.warn(`Theme "${id}" not found`)
        return
      }
      setStore("themeId", id)
      localStorage.setItem(STORAGE_KEYS.THEME_ID, id)
      cacheThemeVariants(theme, id)
    }

    const setColorScheme = (scheme: ColorScheme) => {
      setStore("colorScheme", scheme)
      localStorage.setItem(STORAGE_KEYS.COLOR_SCHEME, scheme)
      setStore("mode", scheme === "system" ? getSystemMode() : scheme)
    }

    const setGradientMode = (mode: GradientMode) => {
      setStore("gradientMode", mode)
      setStore("previewGradientMode", null)
      localStorage.setItem(STORAGE_KEYS.GRADIENT_MODE, mode)
    }

    const setGradientColor = (color: GradientColor) => {
      setStore("gradientColor", color)
      setStore("previewGradientColor", null)
      localStorage.setItem(STORAGE_KEYS.GRADIENT_COLOR, color)
    }

    const setCustomGradient = (gradient: CustomGradient) => {
      setStore("customGradient", gradient)
      setStore("previewCustomGradient", null)
      localStorage.setItem(STORAGE_KEYS.CUSTOM_GRADIENT, JSON.stringify(gradient))
    }

    const clearCustomGradient = () => {
      setStore("customGradient", null)
      setStore("previewCustomGradient", null)
      localStorage.removeItem(STORAGE_KEYS.CUSTOM_GRADIENT)
    }

    const saveGradient = (gradient: CustomGradient) => {
      const existing = store.savedGradients.findIndex((g) => g.name === gradient.name)
      if (existing >= 0) {
        setStore("savedGradients", existing, gradient)
      } else {
        setStore("savedGradients", [...store.savedGradients, gradient])
      }
      localStorage.setItem(STORAGE_KEYS.SAVED_GRADIENTS, JSON.stringify(store.savedGradients))
      // Also set as active
      setCustomGradient(gradient)
    }

    const deleteGradient = (name: string) => {
      const filtered = store.savedGradients.filter((g) => g.name !== name)
      setStore("savedGradients", filtered)
      localStorage.setItem(STORAGE_KEYS.SAVED_GRADIENTS, JSON.stringify(filtered))
      // If deleting the active gradient, clear it
      if (store.customGradient?.name === name) {
        clearCustomGradient()
      }
    }

    const selectGradient = (name: string) => {
      const gradient = store.savedGradients.find((g) => g.name === name)
      if (gradient) {
        setCustomGradient(gradient)
      }
    }

    return {
      themeId: () => store.themeId,
      colorScheme: () => store.colorScheme,
      mode: () => store.mode,
      gradientMode: () => store.gradientMode,
      gradientColor: () => store.gradientColor,
      activeGradientMode: () => store.previewGradientMode ?? store.gradientMode,
      activeGradientColor: () => store.previewGradientColor ?? store.gradientColor,
      customGradient: () => store.customGradient,
      savedGradients: () => store.savedGradients,
      activeCustomGradient: () => store.previewCustomGradient ?? store.customGradient,
      isCustomGradientPreviewing: () => store.previewCustomGradient !== null,
      previewThemeId: () => store.previewThemeId,
      themes: () => store.themes,
      setTheme,
      setColorScheme,
      setGradientMode,
      setGradientColor,
      setCustomGradient,
      clearCustomGradient,
      saveGradient,
      deleteGradient,
      selectGradient,
      previewCustomGradient: (gradient: CustomGradient | null) => setStore("previewCustomGradient", gradient),
      cancelCustomGradientPreview: () => setStore("previewCustomGradient", null),
      registerTheme: (theme: DesktopTheme) => setStore("themes", theme.id, theme),
      previewTheme: (id: string) => {
        const theme = store.themes[id]
        if (!theme) return
        const previewMode = resolvePreviewMode(store.previewScheme)
        applyThemeCss(theme, id, previewMode)
        setStore("previewThemeId", id)
      },
      previewColorScheme: (scheme: ColorScheme) => {
        const previewMode = scheme === "system" ? getSystemMode() : scheme
        const id = store.previewThemeId ?? store.themeId
        const theme = store.themes[id]
        if (theme) {
          applyThemeCss(theme, id, previewMode)
        }
        setStore("previewScheme", scheme)
      },
      previewGradientMode: (mode: GradientMode) => setStore("previewGradientMode", mode),
      previewGradientColor: (color: GradientColor) => setStore("previewGradientColor", color),
      cancelThemePreview: () => {
        const theme = store.themes[store.themeId]
        if (theme) {
          const previewMode = resolvePreviewMode(store.previewScheme)
          applyThemeCss(theme, store.themeId, previewMode)
        }
        setStore("previewThemeId", null)
      },
      cancelGradientModePreview: () => setStore("previewGradientMode", null),
      cancelGradientColorPreview: () => setStore("previewGradientColor", null),
      commitPreview: () => {
        if (store.previewThemeId) {
          setTheme(store.previewThemeId)
        }
        if (store.previewScheme) {
          setColorScheme(store.previewScheme)
        }
        if (store.previewGradientMode) {
          setGradientMode(store.previewGradientMode)
        }
        if (store.previewGradientColor) {
          setGradientColor(store.previewGradientColor)
        }
        if (store.previewCustomGradient) {
          setCustomGradient(store.previewCustomGradient)
        }
        setStore("previewThemeId", null)
        setStore("previewScheme", null)
        setStore("previewGradientMode", null)
        setStore("previewGradientColor", null)
        setStore("previewCustomGradient", null)
      },
      cancelPreview: () => {
        const theme = store.themes[store.themeId]
        if (theme) {
          applyThemeCss(theme, store.themeId, store.mode)
        }
        setStore("previewThemeId", null)
        setStore("previewScheme", null)
        setStore("previewGradientMode", null)
        setStore("previewGradientColor", null)
        setStore("previewCustomGradient", null)
      },
    }
  },
})
