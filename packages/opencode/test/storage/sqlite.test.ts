import { describe, expect, test } from "bun:test"
import { Identifier } from "../../src/id/id"
import { StorageSqlite } from "../../src/storage/sqlite"

describe("StorageSqlite.listMessagesPage", () => {
  test("paginates newest-first and supports cursors", () => {
    const sessionID = Identifier.ascending("session")
    const ids = [
      Identifier.ascending("message"),
      Identifier.ascending("message"),
      Identifier.ascending("message"),
      Identifier.ascending("message"),
    ]

    for (const id of ids) {
      StorageSqlite.writeMessage({
        info: {
          id,
          sessionID,
          time: { created: Date.now() },
        },
        parts: [],
      })
    }

    const first = StorageSqlite.listMessagesPage({ sessionID, limit: 2 })
    expect(first).toStrictEqual([ids[3], ids[2]])

    const second = StorageSqlite.listMessagesPage({ sessionID, limit: 2, afterID: ids[2] })
    expect(second).toStrictEqual([ids[1], ids[0]])

    expect(StorageSqlite.countMessages(sessionID)).toBe(ids.length)
  })
})

describe("StorageSqlite.listSessionIndex", () => {
  test("filters by directory", () => {
    const projectID = `project_${Identifier.ascending("session")}`
    const firstID = Identifier.ascending("session")
    const secondID = Identifier.ascending("session")
    const now = Date.now()
    const later = now + 1

    StorageSqlite.writeSession({
      id: firstID,
      projectID,
      title: "First session",
      directory: "/repo/a",
      version: "v1",
      time: { created: now, updated: now },
    })
    StorageSqlite.writeSession({
      id: secondID,
      projectID,
      title: "Second session",
      directory: "/repo/b",
      version: "v1",
      time: { created: later, updated: later },
    })

    const rows = StorageSqlite.listSessionIndex({ projectID, directory: "/repo/a" })
    const ids = rows.map((row) => row.id)
    expect(ids).toStrictEqual([firstID])
  })
})
