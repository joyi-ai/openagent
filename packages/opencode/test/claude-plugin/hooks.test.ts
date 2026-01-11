import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { ClaudePluginHooks } from "../../src/claude-plugin/hooks"
import { ClaudePluginLoader } from "../../src/claude-plugin/loader"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

async function withInstance<R>(fn: () => R) {
  await using tmp = await tmpdir({ git: true })
  return await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const result = await fn()
      await Instance.dispose()
      return result
    },
  })
}

describe("claude-plugin.hooks", () => {
  beforeEach(() => {
    ClaudePluginHooks.clear()
  })

  afterEach(() => {
    ClaudePluginHooks.clear()
  })

  describe("register", () => {
    test("should register hooks to registry", () => {
      const hooks: ClaudePluginLoader.LoadedHook[] = [
        {
          pluginId: "test-plugin@1.0.0",
          event: "PreToolUse",
          type: "command",
          command: "echo test",
        },
      ]

      ClaudePluginHooks.register(hooks)

      const registered = ClaudePluginHooks.getHooks("PreToolUse")
      expect(registered).toHaveLength(1)
      expect(registered[0].pluginId).toBe("test-plugin@1.0.0")
    })

    test("should register multiple hooks for same event", () => {
      const hooks: ClaudePluginLoader.LoadedHook[] = [
        {
          pluginId: "plugin-a@1.0.0",
          event: "PreToolUse",
          type: "command",
          command: "echo a",
        },
        {
          pluginId: "plugin-b@1.0.0",
          event: "PreToolUse",
          type: "command",
          command: "echo b",
        },
      ]

      ClaudePluginHooks.register(hooks)

      const registered = ClaudePluginHooks.getHooks("PreToolUse")
      expect(registered).toHaveLength(2)
    })

    test("should register hooks for different events", () => {
      const hooks: ClaudePluginLoader.LoadedHook[] = [
        {
          pluginId: "test-plugin@1.0.0",
          event: "PreToolUse",
          type: "command",
          command: "echo pre",
        },
        {
          pluginId: "test-plugin@1.0.0",
          event: "PostToolUse",
          type: "command",
          command: "echo post",
        },
      ]

      ClaudePluginHooks.register(hooks)

      expect(ClaudePluginHooks.getHooks("PreToolUse")).toHaveLength(1)
      expect(ClaudePluginHooks.getHooks("PostToolUse")).toHaveLength(1)
    })
  })

  describe("getHooks", () => {
    test("should return empty array for unregistered event", () => {
      const hooks = ClaudePluginHooks.getHooks("SessionStart")
      expect(hooks).toEqual([])
    })

    test("should return registered hooks", () => {
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "UserPromptSubmit",
          type: "prompt",
          prompt: "Test prompt",
        },
      ])

      const hooks = ClaudePluginHooks.getHooks("UserPromptSubmit")
      expect(hooks).toHaveLength(1)
      expect(hooks[0].type).toBe("prompt")
    })
  })

  describe("clear", () => {
    test("should clear all registered hooks", () => {
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "command",
          command: "echo test",
        },
        {
          pluginId: "test@1.0.0",
          event: "PostToolUse",
          type: "command",
          command: "echo test",
        },
      ])

      expect(ClaudePluginHooks.getHooks("PreToolUse")).toHaveLength(1)
      expect(ClaudePluginHooks.getHooks("PostToolUse")).toHaveLength(1)

      ClaudePluginHooks.clear()

      expect(ClaudePluginHooks.getHooks("PreToolUse")).toHaveLength(0)
      expect(ClaudePluginHooks.getHooks("PostToolUse")).toHaveLength(0)
    })
  })

  describe("registerPluginPath", () => {
    test("should register and retrieve plugin path", () => {
      ClaudePluginHooks.registerPluginPath("my-plugin@1.0.0", "/path/to/plugin")

      const path = ClaudePluginHooks.getPluginPath("my-plugin@1.0.0")
      expect(path).toBe("/path/to/plugin")
    })

    test("should return empty string for unknown plugin", () => {
      const path = ClaudePluginHooks.getPluginPath("unknown-plugin@1.0.0")
      expect(path).toBe("")
    })
  })

  describe("trigger", () => {
    test("should return empty array when no hooks registered", async () => {
      const results = await withInstance(() =>
        ClaudePluginHooks.trigger("PreToolUse", {
          sessionID: "test-session",
          toolName: "Bash",
          toolArgs: { command: "ls" },
        }),
      )

      expect(results).toEqual([])
    })

    test("should execute prompt hooks and return output", async () => {
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "prompt",
          prompt: "This is a test prompt",
        },
      ])

      const results = await withInstance(() =>
        ClaudePluginHooks.trigger("PreToolUse", {
          sessionID: "test-session",
          toolName: "Bash",
          toolArgs: { command: "ls" },
        }),
      )

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      expect(results[0].output).toBe("This is a test prompt")
    })

    test("should filter hooks by matcher", async () => {
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "prompt",
          prompt: "Bash hook",
          matcher: "Bash",
        },
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "prompt",
          prompt: "Read hook",
          matcher: "Read",
        },
      ])

      const results = await withInstance(() =>
        ClaudePluginHooks.trigger("PreToolUse", {
          sessionID: "test-session",
          toolName: "bash", // lowercase, should match Bash
          toolArgs: {},
        }),
      )

      expect(results).toHaveLength(1)
      expect(results[0].output).toBe("Bash hook")
    })

    test("should match wildcard patterns", async () => {
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "prompt",
          prompt: "Web hook triggered",
          matcher: "Web*",
        },
      ])

      const results = await withInstance(() =>
        ClaudePluginHooks.trigger("PreToolUse", {
          sessionID: "test-session",
          toolName: "webfetch", // should become WebFetch and match Web*
          toolArgs: {},
        }),
      )

      expect(results).toHaveLength(1)
      expect(results[0].output).toBe("Web hook triggered")
    })

    test("should resolve ${CLAUDE_PLUGIN_ROOT} in prompt", async () => {
      ClaudePluginHooks.registerPluginPath("test@1.0.0", "/my/plugin/path")
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "prompt",
          prompt: "Plugin root: ${CLAUDE_PLUGIN_ROOT}",
        },
      ])

      const results = await withInstance(() =>
        ClaudePluginHooks.trigger("PreToolUse", {
          sessionID: "test-session",
          toolName: "Bash",
          toolArgs: {},
        }),
      )

      expect(results).toHaveLength(1)
      expect(results[0].output).toBe("Plugin root: /my/plugin/path")
    })
  })

  describe("HookContext interface", () => {
    test("should accept all context fields", async () => {
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "prompt",
          prompt: "test",
        },
      ])

      // This tests that the context interface accepts all expected fields
      const context: ClaudePluginHooks.HookContext = {
        sessionID: "session-123",
        messageID: "message-456",
        toolName: "Bash",
        toolArgs: { command: "ls -la" },
        toolResult: { output: "result" },
        toolUseId: "tool-use-789",
        error: new Error("test error"),
        permissionMode: "default",
        prompt: "user prompt",
        permission: "bash",
        patterns: ["*"],
        stopHookActive: false,
      }

      const results = await withInstance(() => ClaudePluginHooks.trigger("PreToolUse", context))
      expect(results).toHaveLength(1)
    })
  })

  describe("HookResult interface", () => {
    test("should include all Claude Code compatible fields", async () => {
      ClaudePluginHooks.register([
        {
          pluginId: "test@1.0.0",
          event: "PreToolUse",
          type: "prompt",
          prompt: "test output",
        },
      ])

      const results = await withInstance(() =>
        ClaudePluginHooks.trigger("PreToolUse", {
          sessionID: "test",
          toolName: "Bash",
        }),
      )

      const result = results[0]
      expect(result).toHaveProperty("success")
      expect(result).toHaveProperty("duration")
      expect(result.success).toBe(true)
      expect(typeof result.duration).toBe("number")
    })
  })
})
