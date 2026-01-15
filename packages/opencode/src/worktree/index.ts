import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { Global } from "../global"
import { Instance } from "../project/instance"
import { Project } from "../project/project"
import { fn } from "../util/fn"
import { Config } from "@/config/config"
import { Log } from "../util/log"
import { Storage } from "../storage/storage"
export namespace Worktree {
  const log = Log.create({ service: "worktree" })

  export const CleanupMode = z.enum(["ask", "always", "never"])
  export type CleanupMode = z.infer<typeof CleanupMode>

  export const Info = z
    .object({
      path: z.string(),
      branch: z.string(),
      cleanup: CleanupMode.default("ask"),
    })
    .meta({
      ref: "WorktreeInfo",
    })
  export type Info = z.infer<typeof Info>

  /**
   * Generate the worktree path for a session.
   * Places worktree adjacent to the current worktree root.
   */
  export function getPath(name: string): string {
    const parentDir = path.dirname(Instance.worktree)
    return path.join(parentDir, name)
  }

  /**
   * Get the branch name for a session worktree.
   */
  export function getBranchName(sessionID: string): string {
    return `opencode/session-${sessionID}`
  }

  /**
   * Create a worktree with a dedicated branch for a session.
   * Creates branch opencode/session-{sessionID} at current HEAD.
   */
  export async function create(input: { sessionID: string; cleanup?: CleanupMode }): Promise<Info> {
    const candidate = await sessionCandidate()
    const branchName = getBranchName(input.sessionID)
    const info = await createAtPath(candidate.directory, branchName, input.cleanup ?? "ask")
    await Project.addSandbox(Instance.project.id, info.path).catch((error) => {
      log.warn("failed to track worktree sandbox", { path: info.path, error })
    })
    return info
  }

  /**
   * Check if a branch exists.
   */
  async function branchExists(branchName: string): Promise<boolean> {
    const result = await $`git show-ref --verify --quiet refs/heads/${branchName}`
      .cwd(Instance.worktree)
      .quiet()
      .nothrow()
    return result.exitCode === 0
  }

  async function createAtPath(worktreePath: string, branchName: string, cleanup: CleanupMode): Promise<Info> {
    log.info("creating worktree with branch", { path: worktreePath, branch: branchName })

    // Check if branch already exists (e.g., from failed cleanup)
    if (await branchExists(branchName)) {
      log.warn("branch already exists, deleting before creating worktree", { branch: branchName })
      await $`git branch -D ${branchName}`.cwd(Instance.worktree).quiet().nothrow()
    }

    // Create worktree with a new branch at current HEAD
    const result = await $`git worktree add -b ${branchName} ${worktreePath}`.cwd(Instance.worktree).quiet().nothrow()

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString()
      log.error("failed to create worktree", {
        path: worktreePath,
        branch: branchName,
        exitCode: result.exitCode,
        stderr,
      })
      throw new WorktreeError({
        operation: "create",
        path: worktreePath,
        message: stderr || "Failed to create worktree",
      })
    }

    log.info("worktree created", { path: worktreePath, branch: branchName })

    return {
      path: worktreePath,
      branch: branchName,
      cleanup,
    }
  }

  /**
   * Remove a worktree and optionally its branch.
   */
  export async function remove(input: { path: string; branch?: string; deleteBranch?: boolean }): Promise<void> {
    const { path: worktreePath, branch, deleteBranch = true } = input
    log.info("removing worktree", { path: worktreePath, branch, deleteBranch })

    // First try git worktree remove
    const result = await $`git worktree remove ${worktreePath} --force`.cwd(Instance.worktree).quiet().nothrow()

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString()
      log.warn("git worktree remove failed, trying manual cleanup", {
        path: worktreePath,
        stderr,
      })

      // Try manual cleanup
      try {
        await fs.rm(worktreePath, { recursive: true, force: true })
        // Also prune worktree references
        await $`git worktree prune`.cwd(Instance.worktree).quiet().nothrow()
        log.info("worktree manually removed", { path: worktreePath })
      } catch (err) {
        log.error("failed to remove worktree", { path: worktreePath, error: err })
        throw new WorktreeError({
          operation: "remove",
          path: worktreePath,
          message: "Failed to remove worktree",
        })
      }
    } else {
      log.info("worktree removed", { path: worktreePath })
    }

    await Project.removeSandbox(Instance.project.id, worktreePath).catch((error) => {
      log.warn("failed to untrack worktree sandbox", { path: worktreePath, error })
    })

    // Delete the branch if requested
    if (branch && deleteBranch) {
      log.info("deleting branch", { branch })
      const branchResult = await $`git branch -D ${branch}`.cwd(Instance.worktree).quiet().nothrow()

      if (branchResult.exitCode !== 0) {
        log.warn("failed to delete branch", {
          branch,
          stderr: branchResult.stderr.toString(),
        })
        // Don't throw - worktree is already removed, branch cleanup is best-effort
      } else {
        log.info("branch deleted", { branch })
      }
    }
  }

  export const RemoveFailedError = NamedError.create(
    "WorktreeRemoveFailedError",
    z.object({
      message: z.string(),
    }),
  )

  /**
   * Extract project ID from a managed worktree path.
   * Managed worktrees are stored at: {dataDir}/worktree/{projectID}/{name}
   * We look for the pattern "opencode/worktree/{projectID}/{name}" in the path.
   */
  function extractProjectID(worktreePath: string): string | undefined {
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

  /**
   * Remove a managed worktree by its path.
   * This function can be called without an Instance context as it derives
   * the project from the worktree path structure.
   */
  export async function removeManaged(worktreePath: string): Promise<void> {
    const projectID = extractProjectID(worktreePath)
    if (!projectID) {
      throw new RemoveFailedError({
        message: `Not a managed worktree: ${worktreePath}`,
      })
    }

    const project = await Storage.read<Project.Info>(["project", projectID]).catch(() => undefined)
    if (!project) {
      throw new RemoveFailedError({
        message: `Project not found for worktree: ${worktreePath}`,
      })
    }

    const mainWorktree = project.worktree
    log.info("removing managed worktree", { path: worktreePath, projectID, mainWorktree })

    // Check if the worktree directory exists
    const worktreeExists = await fs
      .access(worktreePath)
      .then(() => true)
      .catch(() => false)

    if (!worktreeExists) {
      log.info("worktree directory already removed, cleaning up tracking", { path: worktreePath })
      await Project.removeSandbox(projectID, worktreePath).catch((error) => {
        log.warn("failed to untrack worktree sandbox", { path: worktreePath, error })
      })
      return
    }

    // Check if the main worktree exists for git commands
    const mainWorktreeExists = await fs
      .access(mainWorktree)
      .then(() => true)
      .catch(() => false)

    if (!mainWorktreeExists) {
      log.warn("main worktree does not exist, using manual cleanup", { mainWorktree })
      await fs.rm(worktreePath, { recursive: true, force: true })
      await Project.removeSandbox(projectID, worktreePath).catch((error) => {
        log.warn("failed to untrack worktree sandbox", { path: worktreePath, error })
      })
      return
    }

    // First try git worktree remove
    const result = await $`git worktree remove ${worktreePath} --force`.cwd(mainWorktree).quiet().nothrow()

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString()
      log.warn("git worktree remove failed, trying manual cleanup", {
        path: worktreePath,
        stderr,
      })

      // Try manual cleanup with retries for Windows locked file issues
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            log.info("retrying worktree removal", { attempt, path: worktreePath })
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          await fs.rm(worktreePath, { recursive: true, force: true })
          // Also prune worktree references
          await $`git worktree prune`.cwd(mainWorktree).quiet().nothrow()
          log.info("worktree manually removed", { path: worktreePath })
          lastError = undefined
          break
        } catch (err) {
          lastError = err
          log.warn("fs.rm attempt failed", { attempt, path: worktreePath, error: err })
        }
      }

      if (lastError) {
        // Try using shell rm command as a last resort (works better on Windows with Git Bash)
        log.info("trying shell rm command", { path: worktreePath })
        const rmResult = await $`rm -rf ${worktreePath}`.quiet().nothrow()
        if (rmResult.exitCode === 0) {
          await $`git worktree prune`.cwd(mainWorktree).quiet().nothrow()
          log.info("worktree removed via rm command", { path: worktreePath })
          lastError = undefined
        } else if (process.platform === "win32") {
          // On Windows, also try rd command
          log.info("trying Windows rd command", { path: worktreePath })
          const rdResult = await $`cmd /c rd /s /q ${worktreePath}`.quiet().nothrow()
          if (rdResult.exitCode === 0) {
            await $`git worktree prune`.cwd(mainWorktree).quiet().nothrow()
            log.info("worktree removed via rd command", { path: worktreePath })
            lastError = undefined
          }
        }
      }

      if (lastError) {
        const errorMsg = lastError instanceof Error ? lastError.message : String(lastError)
        log.error("failed to remove worktree", { path: worktreePath, error: lastError })
        throw new RemoveFailedError({
          message: `Failed to remove worktree: ${errorMsg}`,
        })
      }
    } else {
      log.info("worktree removed", { path: worktreePath })
    }

    await Project.removeSandbox(projectID, worktreePath).catch((error) => {
      log.warn("failed to untrack worktree sandbox", { path: worktreePath, error })
    })
  }

  /**
   * Check if a worktree exists.
   */
  export async function exists(worktreePath: string): Promise<boolean> {
    const dirExists = await fs
      .access(worktreePath)
      .then(() => true)
      .catch(() => false)

    if (!dirExists) return false

    // Verify it's actually a git worktree
    const result = await $`git worktree list --porcelain`.cwd(Instance.worktree).quiet().nothrow()

    if (result.exitCode !== 0) return false

    const normalized = path.normalize(worktreePath)
    return result
      .text()
      .split("\n")
      .some((line) => {
        if (!line.startsWith("worktree ")) return false
        const listedPath = path.normalize(line.slice("worktree ".length))
        return listedPath === normalized
      })
  }

  /**
   * List all worktrees for the current repository.
   */
  export async function list(): Promise<string[]> {
    const result = await $`git worktree list --porcelain`.cwd(Instance.worktree).quiet().nothrow()

    if (result.exitCode !== 0) return []

    return result
      .text()
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length))
  }

  export class WorktreeError extends Error {
    constructor(
      public readonly info: {
        operation: "create" | "remove"
        path: string
        message: string
      },
    ) {
      super(`Worktree ${info.operation} failed: ${info.message}`)
      this.name = "WorktreeError"
    }
  }

  export const ManagedInfo = z
    .object({
      name: z.string(),
      branch: z.string(),
      directory: z.string(),
    })
    .meta({
      ref: "Worktree",
    })

  export type ManagedInfo = z.infer<typeof ManagedInfo>

  export const ManagedCreateInput = z
    .object({
      name: z.string().optional(),
      startCommand: z.string().optional(),
    })
    .meta({
      ref: "WorktreeCreateInput",
    })

  export type ManagedCreateInput = z.infer<typeof ManagedCreateInput>

  export const NotGitError = NamedError.create(
    "WorktreeNotGitError",
    z.object({
      message: z.string(),
    }),
  )

  export const NameGenerationFailedError = NamedError.create(
    "WorktreeNameGenerationFailedError",
    z.object({
      message: z.string(),
    }),
  )

  export const CreateFailedError = NamedError.create(
    "WorktreeCreateFailedError",
    z.object({
      message: z.string(),
    }),
  )

  export const StartCommandFailedError = NamedError.create(
    "WorktreeStartCommandFailedError",
    z.object({
      message: z.string(),
    }),
  )

  const ADJECTIVES = [
    "brave",
    "calm",
    "clever",
    "cozy",
    "crisp",
    "curious",
    "gentle",
    "glowing",
    "happy",
    "hearty",
    "hidden",
    "jolly",
    "kind",
    "lively",
    "lucky",
    "mighty",
    "misty",
    "modern",
    "neon",
    "nimble",
    "noble",
    "playful",
    "polished",
    "proud",
    "quick",
    "quiet",
    "shiny",
    "silent",
    "stellar",
    "subtle",
    "sunny",
    "swift",
    "tender",
    "tidy",
    "witty",
  ] as const

  const NOUNS = [
    "cabin",
    "cactus",
    "canyon",
    "circuit",
    "comet",
    "eagle",
    "engine",
    "falcon",
    "forest",
    "garden",
    "harbor",
    "island",
    "junction",
    "knight",
    "lagoon",
    "lantern",
    "library",
    "meadow",
    "mesa",
    "mirage",
    "moon",
    "mountain",
    "nebula",
    "orchid",
    "otter",
    "panda",
    "pixel",
    "planet",
    "plaza",
    "prism",
    "river",
    "rocket",
    "sailor",
    "squid",
    "star",
    "tiger",
    "wizard",
    "wolf",
  ] as const

  function pick<const T extends readonly string[]>(list: T) {
    return list[Math.floor(Math.random() * list.length)]
  }

  function slug(input: string) {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
  }

  function projectPrefix() {
    const base = path.basename(Instance.project.worktree)
    const normalized = slug(base)
    if (normalized) return normalized
    return "worktree"
  }

  function randomPair() {
    return `${pick(ADJECTIVES)}-${pick(NOUNS)}`
  }

  function prefixedName(input?: string) {
    const prefix = projectPrefix()
    const requested = input ? slug(input) : ""
    if (!requested) return `${prefix}-${randomPair()}`
    if (requested === prefix) return `${prefix}-${randomPair()}`
    if (requested.startsWith(`${prefix}-`)) return requested
    return `${prefix}-${requested}`
  }

  async function directoryExists(target: string) {
    return fs
      .stat(target)
      .then(() => true)
      .catch(() => false)
  }

  function outputText(input: Uint8Array | undefined) {
    if (!input?.length) return ""
    return new TextDecoder().decode(input).trim()
  }

  function errorText(result: { stdout?: Uint8Array; stderr?: Uint8Array }) {
    return [outputText(result.stderr), outputText(result.stdout)].filter(Boolean).join("\n")
  }

  async function candidate(root: string, base: string) {
    for (const attempt of Array.from({ length: 26 }, (_, i) => i)) {
      const name = attempt === 0 ? base : `${base}-${randomPair()}`
      const branch = `opencode/${name}`
      const directory = path.join(root, name)

      if (await directoryExists(directory)) continue

      const ref = `refs/heads/${branch}`
      const branchCheck = await $`git show-ref --verify --quiet ${ref}`.quiet().nothrow().cwd(Instance.worktree)
      if (branchCheck.exitCode === 0) continue

      return ManagedInfo.parse({ name, branch, directory })
    }

    throw new NameGenerationFailedError({ message: "Failed to generate a unique worktree name" })
  }

  async function sessionCandidate() {
    const root = path.dirname(Instance.worktree)
    for (const attempt of Array.from({ length: 26 }, (_, i) => i)) {
      const name = prefixedName()
      const directory = path.join(root, name)
      if (await directoryExists(directory)) continue
      return { name, directory }
    }
    throw new NameGenerationFailedError({ message: "Failed to generate a unique worktree name" })
  }

  async function runStartCommand(directory: string, cmd: string) {
    if (process.platform === "win32") {
      return $`cmd /c ${cmd}`.nothrow().cwd(directory)
    }
    return $`bash -lc ${cmd}`.nothrow().cwd(directory)
  }

  export const createManaged = fn(ManagedCreateInput.optional(), async (input) => {
    if (Instance.project.vcs !== "git") {
      throw new NotGitError({ message: "Worktrees are only supported for git projects" })
    }

    const root = path.join(Global.Path.data, "worktree", Instance.project.id)
    await fs.mkdir(root, { recursive: true })

    const base = prefixedName(input?.name)
    const info = await candidate(root, base)

    const created = await $`git worktree add -b ${info.branch} ${info.directory}`
      .quiet()
      .nothrow()
      .cwd(Instance.worktree)
    if (created.exitCode !== 0) {
      throw new CreateFailedError({ message: errorText(created) || "Failed to create git worktree" })
    }

    await Project.addSandbox(Instance.project.id, info.directory).catch((error) => {
      log.warn("failed to track worktree sandbox", { path: info.directory, error })
    })

    const cmd = input?.startCommand?.trim()
    if (!cmd) return info

    const ran = await runStartCommand(info.directory, cmd)
    if (ran.exitCode !== 0) {
      throw new StartCommandFailedError({ message: errorText(ran) || "Worktree start command failed" })
    }

    return info
  })
}
