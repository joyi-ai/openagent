import z from "zod"
import fs from "fs/promises"
import { Filesystem } from "../util/filesystem"
import path from "path"
import { $ } from "bun"
import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { Flag } from "@/flag/flag"
import { Session } from "../session"
import { work } from "../util/queue"
import { fn } from "@opencode-ai/util/fn"
import { BusEvent } from "@/bus/bus-event"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { Global } from "@/global"
import { existsSync } from "fs"

export namespace Project {
  const log = Log.create({ service: "project" })

  // Normalize path for comparison (case-insensitive on Windows, forward slashes)
  function normalizePathKey(p: string): string {
    const normalized = p.replace(/\\/g, "/")
    return process.platform === "win32" ? normalized.toLowerCase() : normalized
  }

  // Check if a path exists in the sandboxes array (using normalized comparison)
  function hasSandbox(sandboxes: string[], target: string): boolean {
    const normalizedTarget = normalizePathKey(target)
    return sandboxes.some((s) => normalizePathKey(s) === normalizedTarget)
  }
  export const Info = z
    .object({
      id: z.string(),
      worktree: z.string(),
      vcs: z.literal("git").optional(),
      name: z.string().optional(),
      icon: z
        .object({
          url: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        initialized: z.number().optional(),
      }),
      sandboxes: z.array(z.string()),
    })
    .meta({
      ref: "Project",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define("project.updated", Info),
  }

  export async function fromDirectory(directory: string) {
    log.info("fromDirectory", { directory })

    const { id, sandbox, worktree, vcs } = await iife(async () => {
      const matches = Filesystem.up({ targets: [".git"], start: directory })
      const git = await matches.next().then((x) => x.value)
      await matches.return()
      if (git) {
        let sandbox = path.dirname(git)

        // cached id calculation
        let id = await Bun.file(path.join(git, "opencode"))
          .text()
          .then((x) => x.trim())
          .catch(() => {})

        // generate id from root commit
        if (!id) {
          const roots = await $`git rev-list --max-parents=0 --all`
            .quiet()
            .nothrow()
            .cwd(sandbox)
            .text()
            .then((x) =>
              x
                .split("\n")
                .filter(Boolean)
                .map((x) => x.trim())
                .toSorted(),
            )
          id = roots[0]
          if (id) Bun.file(path.join(git, "opencode")).write(id)
        }

        if (!id) {
          // For managed worktrees, extract project ID from path structure
          // Managed worktrees are stored at: {dataDir}/worktree/{projectID}/{name}
          const managedProjectID = extractManagedWorktreeProjectID(directory)
          if (managedProjectID) {
            id = managedProjectID
          } else {
            return {
              id: "global",
              worktree: sandbox,
              sandbox: sandbox,
              vcs: "git",
            }
          }
        }

        sandbox = await $`git rev-parse --show-toplevel`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => path.resolve(sandbox, x.trim()))
        const worktree = await $`git rev-parse --git-common-dir`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => {
            const dirname = path.dirname(x.trim())
            if (dirname === ".") return sandbox
            return dirname
          })
        return {
          id,
          sandbox,
          worktree,
          vcs: "git",
        }
      }

      return {
        id: "global",
        worktree: "/",
        sandbox: "/",
        vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
      }
    })

    // Check if project exists
    const existing = await Storage.read<Info>(["project", id]).catch(() => undefined)

    let result: Info
    if (!existing) {
      // New project - create it with this directory as the primary worktree
      result = {
        id,
        worktree,
        vcs: vcs as Info["vcs"],
        sandboxes: [],
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      // Add sandbox if different from worktree (using normalized comparison)
      if (normalizePathKey(sandbox) !== normalizePathKey(worktree)) {
        result.sandboxes.push(sandbox)
      }
      if (id !== "global") {
        await migrateFromGlobal(id, worktree)
      }
      if (Flag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY) discover(result)
      await Storage.write<Info>(["project", id], result)
    } else {
      // Existing project - use atomic update to add this directory as a sandbox
      // Keep the original worktree, don't overwrite it
      result = await Storage.update<Info>(["project", id], (draft) => {
        // migrate old projects before sandboxes
        if (!draft.sandboxes) draft.sandboxes = []

        // Update vcs if needed
        if (vcs) draft.vcs = vcs as Info["vcs"]

        // Add current sandbox if not already tracked (as worktree or in sandboxes)
        const normalizedSandbox = normalizePathKey(sandbox)
        const isWorktree = normalizePathKey(draft.worktree) === normalizedSandbox
        const inSandboxes = hasSandbox(draft.sandboxes, sandbox)

        if (!isWorktree && !inSandboxes) {
          draft.sandboxes.push(sandbox)
        }

        // Filter out non-existent sandboxes
        draft.sandboxes = draft.sandboxes.filter((x) => existsSync(x))

        draft.time.updated = Date.now()
      })

      if (Flag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY) discover(result)
    }

    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return { project: result, sandbox }
  }

  export async function discover(input: Info) {
    if (input.vcs !== "git") return
    if (input.icon?.url) return
    const glob = new Bun.Glob("**/{favicon}.{ico,png,svg,jpg,jpeg,webp}")
    const matches = await Array.fromAsync(
      glob.scan({
        cwd: input.worktree,
        absolute: true,
        onlyFiles: true,
        followSymlinks: false,
        dot: false,
      }),
    )
    const shortest = matches.sort((a, b) => a.length - b.length)[0]
    if (!shortest) return
    const file = Bun.file(shortest)
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mime = file.type || "image/png"
    const url = `data:${mime};base64,${base64}`
    await update({
      projectID: input.id,
      icon: {
        url,
      },
    })
    return
  }

  async function migrateFromGlobal(newProjectID: string, worktree: string) {
    const globalProject = await Storage.read<Info>(["project", "global"]).catch(() => undefined)
    if (!globalProject) return

    const globalSessions = await Storage.list(["session", "global"]).catch(() => [])
    if (globalSessions.length === 0) return

    log.info("migrating sessions from global", { newProjectID, worktree, count: globalSessions.length })

    await work(10, globalSessions, async (key) => {
      const sessionID = key[key.length - 1]
      const session = await Storage.read<Session.Info>(key).catch(() => undefined)
      if (!session) return
      if (session.directory && session.directory !== worktree) return

      session.projectID = newProjectID
      log.info("migrating session", { sessionID, from: "global", to: newProjectID })
      await Storage.write(["session", newProjectID, sessionID], session)
      await Storage.remove(key)
    }).catch((error) => {
      log.error("failed to migrate sessions from global to project", { error, projectId: newProjectID })
    })
  }

  export async function setInitialized(projectID: string) {
    await Storage.update<Info>(["project", projectID], (draft) => {
      draft.time.initialized = Date.now()
    })
  }

  async function resolveSandboxes(project: Info) {
    const stored = project.sandboxes ?? []
    const unique = new Set(stored)
    const root = path.join(Global.Path.data, "worktree", project.id)
    const managed = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of managed) {
      if (!entry.isDirectory()) continue
      unique.add(path.join(root, entry.name))
    }
    const valid: string[] = []
    for (const dir of unique) {
      const stat = await fs.stat(dir).catch(() => undefined)
      if (stat?.isDirectory()) valid.push(dir)
    }
    return valid
  }

  export async function list() {
    const keys = await Storage.list(["project"])
    const projects = await Promise.all(keys.map((x) => Storage.read<Info>(x)))
    return await Promise.all(
      projects.map(async (project) => ({
        ...project,
        sandboxes: await resolveSandboxes(project),
      })),
    )
  }

  export const update = fn(
    z.object({
      projectID: z.string(),
      name: z.string().optional(),
      icon: Info.shape.icon.optional(),
    }),
    async (input) => {
      const result = await Storage.update<Info>(["project", input.projectID], (draft) => {
        if (input.name !== undefined) draft.name = input.name
        if (input.icon !== undefined) {
          draft.icon = {
            ...draft.icon,
          }
          if (input.icon.url !== undefined) draft.icon.url = input.icon.url
          if (input.icon.color !== undefined) draft.icon.color = input.icon.color
        }
        draft.time.updated = Date.now()
      })
      GlobalBus.emit("event", {
        payload: {
          type: Event.Updated.type,
          properties: result,
        },
      })
      return result
    },
  )

  export async function addSandbox(projectID: string, sandbox: string) {
    if (!sandbox) return
    const result = await Storage.update<Info>(["project", projectID], (draft) => {
      if (!draft.sandboxes) draft.sandboxes = []
      // Use normalized comparison for paths
      if (normalizePathKey(draft.worktree) === normalizePathKey(sandbox)) return
      if (hasSandbox(draft.sandboxes, sandbox)) return
      draft.sandboxes.push(sandbox)
      draft.time.updated = Date.now()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return result
  }

  export async function removeSandbox(projectID: string, sandbox: string) {
    if (!sandbox) return
    const normalizedSandbox = normalizePathKey(sandbox)
    const result = await Storage.update<Info>(["project", projectID], (draft) => {
      if (!draft.sandboxes || draft.sandboxes.length === 0) return
      if (!hasSandbox(draft.sandboxes, sandbox)) return
      // Use normalized comparison for filtering
      draft.sandboxes = draft.sandboxes.filter((dir) => normalizePathKey(dir) !== normalizedSandbox)
      draft.time.updated = Date.now()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return result
  }

  export async function sandboxes(projectID: string) {
    const project = await Storage.read<Info>(["project", projectID]).catch(() => undefined)
    if (!project) return []
    return resolveSandboxes(project)
  }

  /**
   * Extract project ID from a managed worktree path.
   * Managed worktrees are stored at: {dataDir}/worktree/{projectID}/{name}
   */
  function extractManagedWorktreeProjectID(worktreePath: string): string | undefined {
    // Normalize path separators to forward slashes for consistent matching
    const normalized = worktreePath.replace(/\\/g, "/")

    // Look for the pattern: opencode/worktree/{projectID}/{name}
    // The projectID is a 40-char hex string (git commit hash)
    const match = normalized.match(/opencode\/worktree\/([a-f0-9]{40})\/[^/]+\/?$/)
    if (match) return match[1]

    // Fallback: try matching against Global.Path.data
    const managedRoot = path.normalize(path.join(Global.Path.data, "worktree")).replace(/\\/g, "/")
    const normalizedPath = path.normalize(worktreePath).replace(/\\/g, "/")

    // Case-insensitive comparison for Windows
    const isWindows = process.platform === "win32"
    const pathLower = isWindows ? normalizedPath.toLowerCase() : normalizedPath
    const rootLower = isWindows ? managedRoot.toLowerCase() : managedRoot

    if (!pathLower.startsWith(rootLower)) return undefined

    const relative = normalizedPath.slice(managedRoot.length)
    const parts = relative.split("/").filter(Boolean)
    if (parts.length < 2) return undefined
    return parts[0]
  }
}
