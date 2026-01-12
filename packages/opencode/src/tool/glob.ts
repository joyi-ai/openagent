import z from "zod"
import path from "path"
import { Tool } from "./tool"
import DESCRIPTION from "./glob.txt"
import { Ripgrep } from "../file/ripgrep"
import { Instance } from "../project/instance"
import { File } from "../file"

export const GlobTool = Tool.define("glob", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("The glob pattern to match files against"),
    path: z
      .string()
      .optional()
      .describe(
        `The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.`,
      ),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "glob",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
      },
    })

    const base = params.path ?? Instance.directory
    const search = path.isAbsolute(base) ? base : path.resolve(Instance.directory, base)

    const limit = 100
    const files: string[] = []
    const state = { truncated: false }
    const matcher = globToRegExp(params.pattern)
    const indexed = await File.indexPaths({
      root: search,
    })
    if (indexed) {
      for (const file of indexed.files) {
        const normalized = file.replaceAll("\\", "/")
        if (!matcher.test(normalized)) continue
        files.push(path.resolve(search, file))
        if (files.length >= limit) {
          state.truncated = true
          break
        }
      }
    }
    if (!indexed) {
      for await (const file of Ripgrep.files({
        cwd: search,
        glob: [params.pattern],
      })) {
        if (files.length >= limit) {
          state.truncated = true
          break
        }
        files.push(path.resolve(search, file))
      }
    }

    const output = []
    if (files.length === 0) output.push("No files found")
    if (files.length > 0) {
      output.push(...files)
      if (state.truncated) {
        output.push("")
        output.push("(Results are truncated. Consider using a more specific path or pattern.)")
      }
    }

    return {
      title: path.relative(Instance.worktree, search),
      metadata: {
        count: files.length,
        truncated: state.truncated,
      },
      output: output.join("\n"),
    }
  },
})

function globToRegExp(pattern: string) {
  const normalized = pattern.replaceAll("\\", "/")
  const parts: string[] = []
  const state = { star: false }
  for (const char of normalized) {
    if (char === "*") {
      if (state.star) {
        parts.push(".*")
        state.star = false
        continue
      }
      state.star = true
      continue
    }
    if (state.star) {
      parts.push("[^/]*")
      state.star = false
    }
    if (char === "?") {
      parts.push("[^/]")
      continue
    }
    parts.push(escapeRegExp(char))
  }
  if (state.star) {
    parts.push("[^/]*")
  }
  return new RegExp("^" + parts.join("") + "$")
}

function escapeRegExp(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
}
