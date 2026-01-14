import { Database } from "bun:sqlite"
import path from "path"
import { Global } from "../global"
import { lazy } from "../util/lazy"

export namespace StorageSqlite {
  export type SessionRecord = {
    id: string
    projectID: string
    parentID?: string
    time?: { created?: number; updated?: number }
  } & Record<string, unknown>

  export type SessionIndexRecord = {
    id: string
    projectID: string
    parentID: string | null
    title: string
    directory: string
    version: string | null
    created_at: number | null
    updated_at: number | null
    archived_at: number | null
    additions: number
    deletions: number
    files_changed: number
    share_url: string | null
    worktree_path: string | null
    worktree_branch: string | null
    data: string | null
  }

  export type SessionIndexRow = SessionIndexRecord

  type SessionIndexInput = SessionRecord & {
    title?: string
    directory?: string
    version?: string
    summary?: { additions?: number; deletions?: number; files?: number }
    share?: { url?: string }
    worktree?: { path?: string; branch?: string }
    mode?: unknown
    agent?: string
    model?: unknown
    variant?: string | null
    thinking?: boolean
    worktreeRequested?: boolean
    worktreeCleanup?: unknown
    time?: { created?: number; updated?: number; archived?: number }
  }

  export type MessageRecord = {
    info: {
      id: string
      sessionID: string
      role?: string
      parentID?: string
      time?: { created?: number; completed?: number }
    }
  } & Record<string, unknown>

  export type PartRecord = {
    id: string
  } & Record<string, unknown>

  export type MessageWithParts = {
    info: MessageRecord["info"]
    parts: PartRecord[]
  }

  export type MessageListInput = {
    sessionID: string
    limit?: number
    afterID?: string
  }

  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      projectID TEXT NOT NULL,
      parentID TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project_updated ON sessions(projectID, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parentID);

    CREATE TABLE IF NOT EXISTS session_index (
      id TEXT PRIMARY KEY,
      projectID TEXT NOT NULL,
      parentID TEXT,
      title TEXT NOT NULL,
      directory TEXT NOT NULL,
      version TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      archived_at INTEGER,
      additions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0,
      share_url TEXT,
      worktree_path TEXT,
      worktree_branch TEXT,
      data TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_session_index_project_updated ON session_index(projectID, updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_session_index_parent ON session_index(parentID);
    CREATE INDEX IF NOT EXISTS idx_session_index_project_archived ON session_index(projectID, archived_at);
    CREATE INDEX IF NOT EXISTS idx_session_index_project_title ON session_index(projectID, title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_session_index_project_directory_updated ON session_index(projectID, directory, updated_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sessionID TEXT NOT NULL,
      created_at INTEGER,
      data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(sessionID, id);
    CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(sessionID, created_at);

    CREATE TABLE IF NOT EXISTS message_parts (
      sessionID TEXT NOT NULL,
      messageID TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (sessionID, messageID, id)
    );

    CREATE INDEX IF NOT EXISTS idx_message_parts_message_id ON message_parts(sessionID, messageID, id);

    CREATE TABLE IF NOT EXISTS session_diff (
      sessionID TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `

  const state = lazy(() => {
    const file = path.join(Global.Path.data, "storage-v2.db")
    const db = new Database(file, { create: true })
    db.run("PRAGMA journal_mode = WAL")
    db.run("PRAGMA synchronous = NORMAL")
    db.run("PRAGMA cache_size = -64000")
    db.run("PRAGMA temp_store = MEMORY")
    db.run(SCHEMA)
    return db
  })

  function db() {
    return state()
  }

  export function metaGet(key: string) {
    const row = db().query<{ value: string }, [string]>("SELECT value FROM meta WHERE key = ?").get(key)
    if (!row) return
    return row.value
  }

  export function metaSet(key: string, value: string) {
    db().run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value])
  }

  function sessionIndexData(session: SessionIndexInput) {
    const data = {
      ...(session.mode ? { mode: session.mode } : {}),
      ...(session.agent ? { agent: session.agent } : {}),
      ...(session.model ? { model: session.model } : {}),
      ...(session.variant !== undefined ? { variant: session.variant } : {}),
      ...(session.thinking !== undefined ? { thinking: session.thinking } : {}),
      ...(session.worktreeRequested ? { worktreeRequested: true } : {}),
      ...(session.worktreeCleanup ? { worktreeCleanup: session.worktreeCleanup } : {}),
    }
    const has =
      data.mode !== undefined ||
      data.agent !== undefined ||
      data.model !== undefined ||
      data.variant !== undefined ||
      data.thinking !== undefined ||
      data.worktreeRequested !== undefined ||
      data.worktreeCleanup !== undefined
    if (!has) return
    return data
  }

  function sessionIndexRow(session: SessionIndexInput) {
    const title = typeof session.title === "string" ? session.title : ""
    if (!title) return
    const directory = typeof session.directory === "string" ? session.directory : ""
    if (!directory) return
    const summary = session.summary
    const share = session.share
    const worktree = session.worktree
    const data = sessionIndexData(session)
    const version = typeof session.version === "string" ? session.version : null
    const createdAt = session.time?.created ?? null
    const updatedAt = session.time?.updated ?? createdAt
    const row: SessionIndexRecord = {
      id: session.id,
      projectID: session.projectID,
      parentID: session.parentID ?? null,
      title,
      directory,
      version,
      created_at: createdAt,
      updated_at: updatedAt,
      archived_at: session.time?.archived ?? null,
      additions: summary?.additions ?? 0,
      deletions: summary?.deletions ?? 0,
      files_changed: summary?.files ?? 0,
      share_url: share?.url ?? null,
      worktree_path: worktree?.path ?? null,
      worktree_branch: worktree?.branch ?? null,
      data: data ? JSON.stringify(data) : null,
    }
    return row
  }

  function writeSessionIndexWithDb(handle: Database, session: SessionIndexInput) {
    const row = sessionIndexRow(session)
    if (!row) return
    handle.run(
      `INSERT INTO session_index
       (id, projectID, parentID, title, directory, version,
        created_at, updated_at, archived_at,
        additions, deletions, files_changed,
        share_url, worktree_path, worktree_branch, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        projectID = excluded.projectID,
        parentID = excluded.parentID,
        title = excluded.title,
        directory = excluded.directory,
        version = excluded.version,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at,
        additions = excluded.additions,
        deletions = excluded.deletions,
        files_changed = excluded.files_changed,
        share_url = excluded.share_url,
        worktree_path = excluded.worktree_path,
        worktree_branch = excluded.worktree_branch,
        data = excluded.data`,
      [
        row.id,
        row.projectID,
        row.parentID,
        row.title,
        row.directory,
        row.version,
        row.created_at,
        row.updated_at,
        row.archived_at,
        row.additions,
        row.deletions,
        row.files_changed,
        row.share_url,
        row.worktree_path,
        row.worktree_branch,
        row.data,
      ],
    )
  }

  export function writeSessionIndex(session: SessionIndexInput) {
    writeSessionIndexWithDb(db(), session)
  }

  export function readSessionIndexRow(id: string) {
    ensureSessionIndex()
    return db().query<SessionIndexRecord, [string]>("SELECT * FROM session_index WHERE id = ?").get(id)
  }

  export function readSession(id: string) {
    const row = db().query<{ data: string }, [string]>("SELECT data FROM sessions WHERE id = ?").get(id)
    if (!row) return
    return JSON.parse(row.data)
  }

  export function writeSession(input: SessionRecord) {
    const handle = db()
    const insert = handle.transaction((payload: SessionRecord) => {
      const createdAt = payload.time?.created ?? null
      const updatedAt = payload.time?.updated ?? null
      handle.run(
        "INSERT OR REPLACE INTO sessions (id, projectID, parentID, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)",
        [payload.id, payload.projectID, payload.parentID ?? null, createdAt, updatedAt, JSON.stringify(payload)],
      )
      writeSessionIndexWithDb(handle, payload)
    })
    insert(input)
  }

  export function listSessions(projectID: string) {
    const rows = db()
      .query<{ id: string }, [string]>("SELECT id FROM sessions WHERE projectID = ? ORDER BY id ASC")
      .all(projectID)
    return rows.map((row) => row.id)
  }

  export function removeSession(id: string) {
    db().run("DELETE FROM sessions WHERE id = ?", [id])
    db().run("DELETE FROM session_index WHERE id = ?", [id])
  }

  export type SessionIndexQuery = {
    projectID: string
    limit?: number
    start?: number
    afterID?: string
    search?: string
    directory?: string
    includeArchived?: boolean
  }

  export function listSessionIndex(input: SessionIndexQuery) {
    ensureSessionIndex()
    const clauses = ["projectID = ?"] as string[]
    const params = [input.projectID] as Array<string | number | null>

    if (input.start !== undefined) {
      clauses.push("updated_at >= ?")
      params.push(input.start)
    }
    const afterID = input.afterID
    if (afterID) {
      const after = readSessionIndexRow(afterID)
      if (after) {
        const cursor = after.updated_at ?? after.created_at ?? 0
        clauses.push("(COALESCE(updated_at, 0) < ? OR (COALESCE(updated_at, 0) = ? AND id < ?))")
        params.push(cursor, cursor, after.id)
      }
    }
    if (input.search) {
      clauses.push("title LIKE ? COLLATE NOCASE")
      params.push(`%${input.search}%`)
    }
    if (input.directory) {
      clauses.push("directory = ?")
      params.push(input.directory)
    }
    const includeArchived = input.includeArchived ?? true
    if (!includeArchived) {
      clauses.push("archived_at IS NULL")
    }

    const limit = input.limit
    const suffix = limit !== undefined ? " LIMIT ?" : ""
    if (limit !== undefined) params.push(limit)

    const sql = `SELECT * FROM session_index WHERE ${clauses.join(
      " AND ",
    )} ORDER BY updated_at DESC, id DESC${suffix}`

    return db().query<SessionIndexRecord, (string | number | null)[]>(sql).all(...params)
  }

  export function listSessionIndexChildren(parentID: string) {
    ensureSessionIndex()
    return db()
      .query<SessionIndexRecord, [string]>(
        "SELECT * FROM session_index WHERE parentID = ? ORDER BY updated_at DESC, id DESC",
      )
      .all(parentID)
  }

  export function ensureSessionIndex() {
    const seeded = metaGet("session-index-seeded")
    if (seeded) return
    const rows = db().query<{ data: string }, []>("SELECT data FROM sessions").all()
    for (const row of rows) {
      const session = JSON.parse(row.data) as SessionIndexInput
      writeSessionIndex(session)
    }
    metaSet("session-index-seeded", "1")
  }

  function messageInfoFromData(data: string) {
    const parsed = JSON.parse(data) as unknown
    if (!parsed || typeof parsed !== "object") return
    const record = parsed as { info?: MessageRecord["info"] }
    const info = record.info ?? (parsed as MessageRecord["info"])
    if (!info) return
    if (typeof info.id !== "string") return
    if (typeof info.sessionID !== "string") return
    return info
  }

  export function readMessage(sessionID: string, messageID: string) {
    const row = db()
      .query<{ data: string }, [string, string]>("SELECT data FROM messages WHERE sessionID = ? AND id = ?")
      .get(sessionID, messageID)
    if (!row) return
    return JSON.parse(row.data)
  }

  export function writeMessage(input: MessageRecord) {
    const info = input.info
    if (!info) return
    const created = info.time?.created ?? null
    db().run("INSERT OR REPLACE INTO messages (id, sessionID, created_at, data) VALUES (?, ?, ?, ?)", [
      info.id,
      info.sessionID,
      created,
      JSON.stringify({ info }),
    ])
  }

  export function listMessages(sessionID: string) {
    const rows = db()
      .query<{ id: string }, [string]>("SELECT id FROM messages WHERE sessionID = ? ORDER BY id ASC")
      .all(sessionID)
    return rows.map((row) => row.id)
  }

  export function readParts(sessionID: string, messageID: string) {
    const rows = db()
      .query<
        { data: string },
        [string, string]
      >("SELECT data FROM message_parts WHERE sessionID = ? AND messageID = ? ORDER BY id ASC")
      .all(sessionID, messageID)
    return rows.map((row) => JSON.parse(row.data))
  }

  export function writeParts(sessionID: string, messageID: string, parts: PartRecord[]) {
    if (parts.length === 0) return
    const tx = db().transaction((rows: PartRecord[]) => {
      for (const part of rows) {
        db().run("INSERT OR REPLACE INTO message_parts (sessionID, messageID, id, data) VALUES (?, ?, ?, ?)", [
          sessionID,
          messageID,
          part.id,
          JSON.stringify(part),
        ])
      }
    })
    tx(parts)
  }

  export function removeParts(sessionID: string, messageID: string, partIDs: string[]) {
    if (partIDs.length === 0) return
    const tx = db().transaction((ids: string[]) => {
      for (const id of ids) {
        db().run("DELETE FROM message_parts WHERE sessionID = ? AND messageID = ? AND id = ?", [
          sessionID,
          messageID,
          id,
        ])
      }
    })
    tx(partIDs)
  }

  export function removeMessageParts(sessionID: string, messageID: string) {
    db().run("DELETE FROM message_parts WHERE sessionID = ? AND messageID = ?", [sessionID, messageID])
  }

  export function listMessagesPage(input: MessageListInput) {
    const limit = input.limit
    const afterID = input.afterID
    if (afterID && limit !== undefined) {
      const rows = db()
        .query<
          { id: string },
          [string, string, number]
        >("SELECT id FROM messages WHERE sessionID = ? AND id < ? ORDER BY id DESC LIMIT ?")
        .all(input.sessionID, afterID, limit)
      return rows.map((row) => row.id)
    }
    if (afterID) {
      const rows = db()
        .query<
          { id: string },
          [string, string]
        >("SELECT id FROM messages WHERE sessionID = ? AND id < ? ORDER BY id DESC")
        .all(input.sessionID, afterID)
      return rows.map((row) => row.id)
    }
    if (limit !== undefined) {
      const rows = db()
        .query<{ id: string }, [string, number]>("SELECT id FROM messages WHERE sessionID = ? ORDER BY id DESC LIMIT ?")
        .all(input.sessionID, limit)
      return rows.map((row) => row.id)
    }
    const rows = db()
      .query<{ id: string }, [string]>("SELECT id FROM messages WHERE sessionID = ? ORDER BY id DESC")
      .all(input.sessionID)
    return rows.map((row) => row.id)
  }

  export function listMessagesInfoPage(input: MessageListInput) {
    const afterID = input.afterID
    const limit = input.limit

    const parseRows = (rows: Array<{ data: string }>) => {
      const items: MessageWithParts[] = []
      for (const row of rows) {
        const info = messageInfoFromData(row.data)
        if (!info) continue
        items.push({ info, parts: [] })
      }
      return items
    }

    if (afterID && limit !== undefined) {
      const rows = db()
        .query<{ data: string }, [string, string, string, number]>(
          `
          SELECT data
          FROM messages
          WHERE sessionID = ? AND id IN (
            SELECT id FROM messages WHERE sessionID = ? AND id < ? ORDER BY id DESC LIMIT ?
          )
          ORDER BY id DESC
          `,
        )
        .all(input.sessionID, input.sessionID, afterID, limit)
      return parseRows(rows)
    }

    if (afterID) {
      const rows = db()
        .query<{ data: string }, [string, string, string]>(
          `
          SELECT data
          FROM messages
          WHERE sessionID = ? AND id IN (
            SELECT id FROM messages WHERE sessionID = ? AND id < ? ORDER BY id DESC
          )
          ORDER BY id DESC
          `,
        )
        .all(input.sessionID, input.sessionID, afterID)
      return parseRows(rows)
    }

    if (limit !== undefined) {
      const rows = db()
        .query<{ data: string }, [string, string, number]>(
          `
          SELECT data
          FROM messages
          WHERE sessionID = ? AND id IN (
            SELECT id FROM messages WHERE sessionID = ? ORDER BY id DESC LIMIT ?
          )
          ORDER BY id DESC
          `,
        )
        .all(input.sessionID, input.sessionID, limit)
      return parseRows(rows)
    }

    const rows = db()
      .query<{ data: string }, [string]>("SELECT data FROM messages WHERE sessionID = ? ORDER BY id DESC")
      .all(input.sessionID)
    return parseRows(rows)
  }

  export function listMessagesWithPartsPage(input: MessageListInput) {
    const afterID = input.afterID
    const limit = input.limit

    const groupRows = (rows: Array<{ messageID: string; message: string; part: string | null }>) => {
      const result: MessageWithParts[] = []
      const current = { value: undefined as MessageWithParts | undefined }
      for (const row of rows) {
        const last = current.value
        if (!last || last.info.id !== row.messageID) {
          const parsed = JSON.parse(row.message) as { info?: MessageRecord["info"] }
          const info = parsed.info ?? (parsed as MessageRecord["info"])
          const entry = { info, parts: [] as PartRecord[] }
          result.push(entry)
          current.value = entry
        }
        if (!row.part) continue
        current.value?.parts.push(JSON.parse(row.part) as PartRecord)
      }
      return result
    }

    if (afterID && limit !== undefined) {
      const rows = db()
        .query<{ messageID: string; message: string; part: string | null }, [string, string, string, number]>(
          `
          SELECT m.id as messageID, m.data as message, p.data as part
          FROM messages m
          LEFT JOIN message_parts p
            ON p.sessionID = m.sessionID AND p.messageID = m.id
          WHERE m.sessionID = ? AND m.id IN (
            SELECT id FROM messages WHERE sessionID = ? AND id < ? ORDER BY id DESC LIMIT ?
          )
          ORDER BY m.id DESC, p.id ASC
          `,
        )
        .all(input.sessionID, input.sessionID, afterID, limit)
      return groupRows(rows)
    }

    if (afterID) {
      const rows = db()
        .query<{ messageID: string; message: string; part: string | null }, [string, string, string]>(
          `
          SELECT m.id as messageID, m.data as message, p.data as part
          FROM messages m
          LEFT JOIN message_parts p
            ON p.sessionID = m.sessionID AND p.messageID = m.id
          WHERE m.sessionID = ? AND m.id IN (
            SELECT id FROM messages WHERE sessionID = ? AND id < ? ORDER BY id DESC
          )
          ORDER BY m.id DESC, p.id ASC
          `,
        )
        .all(input.sessionID, input.sessionID, afterID)
      return groupRows(rows)
    }

    if (limit !== undefined) {
      const rows = db()
        .query<{ messageID: string; message: string; part: string | null }, [string, string, number]>(
          `
          SELECT m.id as messageID, m.data as message, p.data as part
          FROM messages m
          LEFT JOIN message_parts p
            ON p.sessionID = m.sessionID AND p.messageID = m.id
          WHERE m.sessionID = ? AND m.id IN (
            SELECT id FROM messages WHERE sessionID = ? ORDER BY id DESC LIMIT ?
          )
          ORDER BY m.id DESC, p.id ASC
          `,
        )
        .all(input.sessionID, input.sessionID, limit)
      return groupRows(rows)
    }

    const rows = db()
      .query<{ messageID: string; message: string; part: string | null }, [string, string]>(
        `
        SELECT m.id as messageID, m.data as message, p.data as part
        FROM messages m
        LEFT JOIN message_parts p
          ON p.sessionID = m.sessionID AND p.messageID = m.id
        WHERE m.sessionID = ? AND m.id IN (
          SELECT id FROM messages WHERE sessionID = ? ORDER BY id DESC
        )
        ORDER BY m.id DESC, p.id ASC
        `,
      )
      .all(input.sessionID, input.sessionID)
    return groupRows(rows)
  }

  export function removeMessage(sessionID: string, messageID: string) {
    db().run("DELETE FROM messages WHERE sessionID = ? AND id = ?", [sessionID, messageID])
    removeMessageParts(sessionID, messageID)
  }

  export function removeMessages(sessionID: string) {
    db().run("DELETE FROM messages WHERE sessionID = ?", [sessionID])
    db().run("DELETE FROM message_parts WHERE sessionID = ?", [sessionID])
  }

  export function countMessages(sessionID: string) {
    const row = db()
      .query<{ count: number }, [string]>("SELECT COUNT(*) as count FROM messages WHERE sessionID = ?")
      .get(sessionID)
    return row?.count ?? 0
  }

  export function readDiff(sessionID: string) {
    const row = db()
      .query<{ data: string }, [string]>("SELECT data FROM session_diff WHERE sessionID = ?")
      .get(sessionID)
    if (!row) return
    return JSON.parse(row.data)
  }

  export function writeDiff(sessionID: string, value: unknown) {
    db().run("INSERT OR REPLACE INTO session_diff (sessionID, data) VALUES (?, ?)", [sessionID, JSON.stringify(value)])
  }

  export function removeDiff(sessionID: string) {
    db().run("DELETE FROM session_diff WHERE sessionID = ?", [sessionID])
  }
}
