import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Identifier } from "@/id/id"
import { Log } from "@/util/log"
import z from "zod"

export namespace AskUserQuestion {
  const log = Log.create({ service: "ask-user-question" })

  export const Option = z.object({
    label: z.string(),
    description: z.string(),
  })
  export type Option = z.infer<typeof Option>

  export const Question = z.object({
    question: z.string(),
    header: z.string(),
    options: Option.array(),
    multiSelect: z.boolean(),
  })
  export type Question = z.infer<typeof Question>

  export const Request = z.object({
    id: Identifier.schema("askuser"),
    sessionID: z.string(),
    messageID: z.string(),
    callID: z.string(),
    questions: Question.array(),
  })
  export type Request = z.infer<typeof Request>

  export const Response = z.object({
    requestID: z.string(),
    answers: z.record(z.string(), z.string()),
  })
  export type Response = z.infer<typeof Response>

  export const Event = {
    Asked: BusEvent.define("askuser.asked", Request),
    Replied: BusEvent.define("askuser.replied", Response),
    Cancelled: BusEvent.define("askuser.cancelled", z.object({ requestID: z.string(), sessionID: z.string() })),
  }

  interface PendingQuestion {
    info: Request
    resolve: (answers: Record<string, string>) => void
    reject: (e: Error) => void
  }

  const pending: Map<string, PendingQuestion> = new Map()

  /**
   * Create a pending question and wait for user response
   */
  export async function ask(input: {
    sessionID: string
    messageID: string
    callID: string
    questions: Question[]
  }): Promise<Record<string, string>> {
    const id = Identifier.ascending("askuser")
    const request: Request = {
      id,
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
      questions: input.questions,
    }

    log.info("creating ask user question request", { id, sessionID: input.sessionID })

    return new Promise((resolve, reject) => {
      pending.set(id, {
        info: request,
        resolve,
        reject,
      })
      Bus.publish(Event.Asked, request)
    })
  }

  /**
   * Reply to a pending question with answers
   */
  export function reply(input: { requestID: string; answers: Record<string, string> }): boolean {
    const pendingQuestion = pending.get(input.requestID)
    if (!pendingQuestion) {
      log.warn("no pending question found", { requestID: input.requestID })
      return false
    }

    log.info("replying to ask user question", { requestID: input.requestID, answers: input.answers })

    pending.delete(input.requestID)
    Bus.publish(Event.Replied, {
      requestID: input.requestID,
      answers: input.answers,
    })
    pendingQuestion.resolve(input.answers)
    return true
  }

  /**
   * Cancel a pending question (e.g., on session abort)
   */
  export function cancel(requestID: string): boolean {
    const pendingQuestion = pending.get(requestID)
    if (!pendingQuestion) return false

    log.info("cancelling ask user question", { requestID })
    pending.delete(requestID)
    Bus.publish(Event.Cancelled, { requestID, sessionID: pendingQuestion.info.sessionID })
    pendingQuestion.reject(new Error("The user dismissed this question"))
    return true
  }

  /**
   * Cancel all pending questions for a session
   */
  export function cancelSession(sessionID: string): void {
    for (const [id, question] of pending) {
      if (question.info.sessionID === sessionID) {
        log.info("cancelling ask user question for session", { id, sessionID })
        pending.delete(id)
        question.reject(new Error("Session cancelled"))
      }
    }
  }

  /**
   * List all pending questions
   */
  export function list(): Request[] {
    return Array.from(pending.values()).map((p) => p.info)
  }

  /**
   * List pending questions for a specific session
   */
  export function listForSession(sessionID: string): Request[] {
    return Array.from(pending.values())
      .filter((p) => p.info.sessionID === sessionID)
      .map((p) => p.info)
  }
}
