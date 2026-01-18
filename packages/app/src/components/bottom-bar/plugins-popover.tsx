import { type ParentProps, Show, createMemo, createSignal } from "solid-js"
import { Popover as Kobalte } from "@kobalte/core/popover"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tabs } from "@opencode-ai/ui/tabs"
import { SDKProvider } from "@/context/sdk"
import { SyncProvider } from "@/context/sync"
import { LocalProvider } from "@/context/local"
import { useMultiPane } from "@/context/multi-pane"
import { ClaudePluginsPanel } from "@/components/settings/claude-plugins-panel"
import { OpenCodePluginsPanel } from "@/components/settings/opencode-plugins-panel"

function PluginsContent() {
  const [activeTab, setActiveTab] = createSignal("claude")

  return (
    <div class="w-96 max-h-96 overflow-y-auto">
      <Tabs value={activeTab()} onChange={setActiveTab}>
        <Tabs.List class="mb-2">
          <Tabs.Trigger value="claude">Claude Plugins</Tabs.Trigger>
          <Tabs.Trigger value="opencode">OpenCode Plugins</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="claude">
          <ClaudePluginsPanel variant="dialog" />
        </Tabs.Content>
        <Tabs.Content value="opencode">
          <OpenCodePluginsPanel />
        </Tabs.Content>
      </Tabs>
    </div>
  )
}

function PluginsPopoverInner(props: ParentProps) {
  return (
    <Kobalte gutter={8} placement="top-end" modal={false}>
      <Kobalte.Trigger as="div" class="cursor-pointer">
        {props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content class="z-50 rounded-lg border border-border-base bg-background-base shadow-lg p-3 animate-in fade-in-0 zoom-in-95">
          <div class="flex items-center justify-between pb-2 border-b border-border-weak-base mb-2">
            <span class="text-13-medium text-text-strong">Plugins</span>
            <Kobalte.CloseButton as={IconButton} icon="close" variant="ghost" />
          </div>
          <PluginsContent />
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}

export function PluginsPopover(props: ParentProps) {
  const multiPane = useMultiPane()
  const focusedDirectory = createMemo(() => {
    const pane = multiPane.focusedPane()
    if (!pane) return undefined
    return pane.worktree ?? pane.directory
  })

  return (
    <Show when={focusedDirectory()} fallback={props.children}>
      {(directory) => (
        <SDKProvider directory={directory()}>
          <SyncProvider>
            <LocalProvider>
              <PluginsPopoverInner>{props.children}</PluginsPopoverInner>
            </LocalProvider>
          </SyncProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
