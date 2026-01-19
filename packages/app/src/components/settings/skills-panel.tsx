import { Show, createMemo, createSignal, type Component } from "solid-js"
import { List } from "@opencode-ai/ui/list"
import { Switch } from "@opencode-ai/ui/switch"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"

function inferSource(location: string): string {
  const normalized = location.replace(/\\\\/g, "/")
  if (normalized.includes("/.claude/skills/")) return "claude"
  if (
    normalized.includes("/.opencode/skill/") ||
    normalized.includes("/.opencode/skills/") ||
    normalized.includes("/.config/opencode/skill/") ||
    normalized.includes("/.config/opencode/skills/")
  )
    return "opencode"
  if (normalized.includes("/.claude-plugin/")) return "claude-plugin"
  return "custom"
}

export const SkillsPanel: Component = () => {
  const sdk = useSDK()
  const sync = useSync()
  const [saving, setSaving] = createSignal<string | null>(null)

  // Read disabled skills directly from config (same pattern as opencode-plugins-panel)
  const disabledList = () => (sync.data.config as { disabled_skills?: string[] }).disabled_skills ?? []

  const updateDisabledSkills = async (nextDisabled: string[]) => {
    const result = await sdk.client.config
      .update({ config: { disabled_skills: nextDisabled } as Record<string, unknown> })
      .then((res) => ({ success: true as const, data: res.data }))
      .catch((err) => ({ success: false as const, error: err as Error }))

    if (!result.success) {
      showToast({
        variant: "error",
        title: "Failed to update skills",
        description: result.error.message,
      })
      return false
    }

    sync.set("config", "disabled_skills" as never, nextDisabled as never)
    return true
  }

  const toggleSkill = async (name: string, nextEnabled: boolean) => {
    if (saving()) return
    setSaving(name)

    // Compute the next disabled list from current config (same pattern as opencode-plugins)
    const disabled = new Set(disabledList())
    if (nextEnabled) {
      disabled.delete(name)
    } else {
      disabled.add(name)
    }

    const success = await updateDisabledSkills(Array.from(disabled))
    if (success) {
      showToast({
        variant: "success",
        title: nextEnabled ? "Skill enabled" : "Skill disabled",
        description: name,
      })
    }
    setSaving(null)
  }

  // Build items list from skills and disabled list
  const items = createMemo(() => {
    const disabled = new Set(disabledList())
    const skillList = sync.data.skill ?? []
    return skillList
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((skill) => ({
        ...skill,
        enabled: !disabled.has(skill.name),
        source: inferSource(skill.location),
      }))
  })

  return (
    <div class="flex flex-col gap-2">
      <List
        search={{ placeholder: "Search skills", autofocus: false }}
        emptyMessage="No skills found"
        key={(x) => x?.name ?? ""}
        items={items}
        filterKeys={["name", "description", "source"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        onSelect={(x) => {
          if (x) toggleSkill(x.name, !x.enabled)
        }}
      >
        {(skill) => (
          <div class="w-full flex items-center justify-between gap-x-3">
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="truncate text-13-regular text-text-strong">{skill.name}</span>
              <Show when={skill.description}>
                <span class="text-12-regular text-text-weak truncate">{skill.description}</span>
              </Show>
            </div>
            <Switch checked={skill.enabled} disabled={saving() === skill.name} onChange={() => toggleSkill(skill.name, !skill.enabled)} />
          </div>
        )}
      </List>
    </div>
  )
}
