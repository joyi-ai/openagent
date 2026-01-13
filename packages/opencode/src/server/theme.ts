import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { Instance } from "../project/instance"
import z from "zod"
import { errors } from "./error"
import path from "path"

const GradientThemeSchema = z.object({
  name: z.string(),
  saturation: z.number().min(0).max(200),
  brightness: z.number().min(0).max(200),
  contrast: z.number().min(0).max(200),
  blur: z.number().min(0).max(200),
  noise: z.number().min(0).max(200),
  colors: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
})

type GradientTheme = z.infer<typeof GradientThemeSchema>

async function getThemesDir(): Promise<string> {
  const dir = path.join(Instance.directory, ".opencode", "themes")
  await Bun.file(dir).exists().catch(() => false)
  try {
    await Bun.$`mkdir -p ${dir}`.quiet()
  } catch {}
  return dir
}

export const ThemeRoute = new Hono()
  .get(
    "/gradient",
    describeRoute({
      summary: "List gradient themes",
      description: "Get a list of custom gradient themes saved in the project.",
      operationId: "theme.gradient.list",
      responses: {
        200: {
          description: "List of gradient themes",
          content: {
            "application/json": {
              schema: resolver(
                z.array(
                  z.object({
                    name: z.string(),
                    theme: GradientThemeSchema,
                  })
                )
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const themesDir = await getThemesDir()
      const results: { name: string; theme: GradientTheme }[] = []
      try {
        const files = await Bun.$`ls ${themesDir}`.quiet().text()
        const gradientFiles = files.split("\n").filter((f) => f.endsWith(".gradient.json"))
        for (const file of gradientFiles) {
          const filepath = path.join(themesDir, file)
          const content = await Bun.file(filepath).text()
          const parsed = GradientThemeSchema.safeParse(JSON.parse(content))
          if (parsed.success) {
            const name = file.replace(".gradient.json", "")
            results.push({ name, theme: parsed.data })
          }
        }
      } catch {}
      return c.json(results)
    }
  )
  .put(
    "/gradient/:name",
    describeRoute({
      summary: "Save gradient theme",
      description: "Save a custom gradient theme to the project.",
      operationId: "theme.gradient.save",
      responses: {
        200: {
          description: "Theme saved successfully",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                  path: z.string(),
                })
              ),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator("param", z.object({ name: z.string() })),
    validator("json", GradientThemeSchema),
    async (c) => {
      const { name } = c.req.valid("param")
      const theme = c.req.valid("json")
      const themesDir = await getThemesDir()
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()
      const filepath = path.join(themesDir, `${safeName}.gradient.json`)
      await Bun.write(filepath, JSON.stringify(theme, null, 2))
      return c.json({ success: true, path: filepath })
    }
  )
  .delete(
    "/gradient/:name",
    describeRoute({
      summary: "Delete gradient theme",
      description: "Delete a custom gradient theme from the project.",
      operationId: "theme.gradient.delete",
      responses: {
        200: {
          description: "Theme deleted successfully",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  success: z.boolean(),
                })
              ),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ name: z.string() })),
    async (c) => {
      const { name } = c.req.valid("param")
      const themesDir = await getThemesDir()
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()
      const filepath = path.join(themesDir, `${safeName}.gradient.json`)
      const file = Bun.file(filepath)
      if (!(await file.exists())) {
        return c.json({ error: "Theme not found" }, 404)
      }
      await Bun.$`rm ${filepath}`.quiet()
      return c.json({ success: true })
    }
  )
