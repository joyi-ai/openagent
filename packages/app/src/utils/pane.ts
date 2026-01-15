import type { PaneConfig } from "@/context/multi-pane"
import type { useGlobalSync } from "@/context/global-sync"
import { truncateDirectoryPrefix } from "@opencode-ai/util/path"

type GlobalSync = ReturnType<typeof useGlobalSync>

export type PaneState = "empty" | "project" | "session"

export function getPaneState(pane: PaneConfig): PaneState {
  if (!pane.directory) return "empty"
  if (!pane.sessionId) return "project"
  return "session"
}

export function getPaneTitle(pane: PaneConfig | undefined, sync: GlobalSync) {
  if (!pane) return undefined
  const sessionId = pane.sessionId
  if (!sessionId) return "New session"
  const directory = pane.worktree ?? pane.directory
  if (!directory) return sessionId
  const [store] = sync.child(directory)
  const session = store.session.find((candidate) => candidate.id === sessionId)
  if (session?.title) return session.title
  return sessionId
}

export function getPaneProjectLabel(pane: PaneConfig | undefined) {
  if (!pane?.directory) return undefined
  return truncateDirectoryPrefix(pane.directory)
}

export function getPaneWorking(pane: PaneConfig | undefined, sync: GlobalSync) {
  if (!pane) return false
  const sessionId = pane.sessionId
  const directory = pane.worktree ?? pane.directory
  if (!sessionId || !directory) return false
  const [store] = sync.child(directory)
  const status = store.session_status[sessionId]
  return status?.type === "busy" || status?.type === "retry"
}
