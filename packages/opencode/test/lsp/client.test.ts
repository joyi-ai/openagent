import { describe, expect, test, beforeEach } from "bun:test"
import { PassThrough } from "stream"
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node"
import { LSPClient } from "../../src/lsp/client"
import { LSPServer } from "../../src/lsp/server"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"

// Minimal fake LSP server that speaks JSON-RPC over in-memory streams
function spawnFakeServer() {
  const clientToServer = new PassThrough()
  const serverToClient = new PassThrough()

  const connection = createMessageConnection(
    new StreamMessageReader(clientToServer),
    new StreamMessageWriter(serverToClient),
  )

  connection.onRequest("initialize", async () => ({ capabilities: {} }))
  connection.onNotification("initialized", () => {})
  connection.onNotification("workspace/didChangeConfiguration", () => {})
  connection.onNotification("test/trigger", (params) => {
    if (!params || typeof params !== "object") return
    if (!("method" in params)) return
    const method = (params as { method?: unknown }).method
    if (typeof method !== "string") return
    void connection.sendRequest(method, {})
  })

  connection.listen()

  return {
    process: {
      stdin: clientToServer,
      stdout: serverToClient,
      pid: process.pid,
      kill: () => {
        connection.dispose()
        clientToServer.destroy()
        serverToClient.destroy()
        return true
      },
    },
  }
}

describe("LSPClient interop", () => {
  beforeEach(async () => {
    await Log.init({ print: true })
  })

  test("handles workspace/workspaceFolders request", async () => {
    const handle = spawnFakeServer() as any

    const client = await Instance.provide({
      directory: process.cwd(),
      fn: () =>
        LSPClient.create({
          serverID: "fake",
          server: handle as unknown as LSPServer.Handle,
          root: process.cwd(),
        }),
    })

    await client.connection.sendNotification("test/trigger", {
      method: "workspace/workspaceFolders",
    })

    await new Promise((r) => setTimeout(r, 100))

    expect(client.connection).toBeDefined()

    await client.shutdown()
  })

  test("handles client/registerCapability request", async () => {
    const handle = spawnFakeServer() as any

    const client = await Instance.provide({
      directory: process.cwd(),
      fn: () =>
        LSPClient.create({
          serverID: "fake",
          server: handle as unknown as LSPServer.Handle,
          root: process.cwd(),
        }),
    })

    await client.connection.sendNotification("test/trigger", {
      method: "client/registerCapability",
    })

    await new Promise((r) => setTimeout(r, 100))

    expect(client.connection).toBeDefined()

    await client.shutdown()
  })

  test("handles client/unregisterCapability request", async () => {
    const handle = spawnFakeServer() as any

    const client = await Instance.provide({
      directory: process.cwd(),
      fn: () =>
        LSPClient.create({
          serverID: "fake",
          server: handle as unknown as LSPServer.Handle,
          root: process.cwd(),
        }),
    })

    await client.connection.sendNotification("test/trigger", {
      method: "client/unregisterCapability",
    })

    await new Promise((r) => setTimeout(r, 100))

    expect(client.connection).toBeDefined()

    await client.shutdown()
  })
})
