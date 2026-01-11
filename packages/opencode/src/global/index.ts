import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"

const app = "opencode"

const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)

// Tauri app config directory (where oh-my-opencode installer writes for desktop)
function getTauriConfigDir(): string | undefined {
  if (process.env.OPENCODE_TEST_HOME) return undefined
  const identifier = "ai.opencode.desktop"
  const identifierDev = "ai.opencode.desktop.dev"

  const platform = process.platform
  let tauriDir: string

  switch (platform) {
    case "darwin":
      tauriDir = path.join(os.homedir(), "Library", "Application Support", identifier)
      break
    case "win32": {
      const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      tauriDir = path.join(appData, identifier)
      break
    }
    default: {
      // Linux uses XDG which is same as our config path
      return undefined
    }
  }

  // Check dev version first, then production
  const devDir = tauriDir.replace(identifier, identifierDev)
  try {
    if (Bun.file(path.join(devDir, "opencode.json")).size) return devDir
  } catch {}
  try {
    if (Bun.file(path.join(devDir, "opencode.jsonc")).size) return devDir
  } catch {}
  try {
    if (Bun.file(path.join(tauriDir, "opencode.json")).size) return tauriDir
  } catch {}
  try {
    if (Bun.file(path.join(tauriDir, "opencode.jsonc")).size) return tauriDir
  } catch {}

  return undefined
}

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    // Tauri config dir (if exists) for oh-my-opencode compatibility
    get tauriConfig() {
      return getTauriConfigDir()
    },
    state,
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
])

const CACHE_VERSION = "16"

const version = await Bun.file(path.join(Global.Path.cache, "version"))
  .text()
  .catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
}
