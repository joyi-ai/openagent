import { createMemo, createSignal, Show, type ParentProps } from "solid-js"
import { useParams } from "@solidjs/router"
import { SDKProvider, useSDK } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { LocalProvider, useLocal } from "@/context/local"

import { base64Decode } from "@opencode-ai/util/encode"
import { DataProvider } from "@opencode-ai/ui/context"
import { iife } from "@opencode-ai/util/iife"
import { useGlobalSDK } from "@/context/global-sdk"

// Bridge component to connect LocalProvider's agent setter to DataProvider
function AgentBridge(props: { setAgentRef: (fn: (name: string) => void) => void; children: any }) {
  const local = useLocal()
  props.setAgentRef((name: string) => local.agent.set(name))
  return props.children
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const directory = createMemo(() => {
    return base64Decode(params.dir!)
  })
  return (
    <Show when={params.dir}>
      <SDKProvider directory={directory()}>
        <SyncProvider>
          {iife(() => {
            const sync = useSync()
            const sdk = useSDK()
            const globalSDK = useGlobalSDK()

            const respondToPermission = (input: {
              sessionID: string
              permissionID: string
              response: "once" | "always" | "reject"
            }) => sdk.client.permission.respond(input)

            const findAskUserRequest = (requestID: string, sessionID?: string) => {
              const store = sync.data.askuser ?? {}
              if (sessionID && store[sessionID]) {
                return store[sessionID].find((req) => req.id === requestID)
              }
              for (const requests of Object.values(store)) {
                const match = requests.find((req) => req.id === requestID)
                if (match) return match
              }
              return undefined
            }

            const buildQuestionAnswers = (
              input: { answers: Record<string, string>; answerSets?: string[][] },
              request: { questions?: Array<{ question: string }> } | undefined,
            ) => {
              if (input.answerSets) return input.answerSets
              if (!request?.questions) return []
              return request.questions.map((question) => {
                const value = input.answers[question.question] ?? ""
                return value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              })
            }

            const respondToAskUser = async (input: {
              requestID: string
              answers: Record<string, string>
              answerSets?: string[][]
              sessionID?: string
              source?: "askuser" | "question"
              reject?: boolean
            }) => {
              const request = findAskUserRequest(input.requestID, input.sessionID) as
                | { source?: "askuser" | "question"; questions?: Array<{ question: string }> }
                | undefined
              const source = input.source ?? request?.source ?? "askuser"

              if (source === "question") {
                if (input.reject) {
                  const response = await fetch(`${globalSDK.url}/question/${input.requestID}/reject`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "x-opencode-directory": directory(),
                    },
                  })
                  return response.json()
                }
                const response = await fetch(`${globalSDK.url}/question/${input.requestID}/reply`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-opencode-directory": directory(),
                  },
                  body: JSON.stringify({ answers: buildQuestionAnswers(input, request) }),
                })
                return response.json()
              }

              if (input.reject) {
                const response = await fetch(`${globalSDK.url}/askuser/${input.requestID}/cancel`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-opencode-directory": directory(),
                  },
                })
                return response.json()
              }

              const response = await fetch(`${globalSDK.url}/askuser/${input.requestID}/reply`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-opencode-directory": directory(),
                },
                body: JSON.stringify({ answers: input.answers }),
              })
              return response.json()
            }

            const respondToPlanMode = async (input: { requestID: string; approved: boolean }) => {
              const response = await fetch(`${globalSDK.url}/planmode/${input.requestID}/reply`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-opencode-directory": directory(),
                },
                body: JSON.stringify({ approved: input.approved }),
              })
              return response.json()
            }

            // Use a signal to capture the agent setter from inside LocalProvider
            let setAgentFn: ((name: string) => void) | undefined

            return (
              <DataProvider
                data={sync.data}
                directory={directory()}
                onPermissionRespond={respondToPermission}
                onAskUserRespond={respondToAskUser}
                onPlanModeRespond={respondToPlanMode}
                onSetAgent={(name) => setAgentFn?.(name)}
                onReasoningPrefetch={(input) => sync.session.prefetchReasoning(input.sessionID, input.messageID)}
              >
                <LocalProvider>
                  <AgentBridge setAgentRef={(fn) => (setAgentFn = fn)}>{props.children}</AgentBridge>
                </LocalProvider>
              </DataProvider>
            )
          })}
        </SyncProvider>
      </SDKProvider>
    </Show>
  )
}
