import { Show, createSignal, onCleanup, splitProps, type ComponentProps } from "solid-js"
import { IconButton } from "./icon-button"

export type MessageActionHandlers = {
  onEdit?: () => void
  onRestore?: () => void
  onRetry?: () => void
  onDelete?: () => void
}

export function MessageActions(props: ComponentProps<"div"> & MessageActionHandlers) {
  const [local, others] = splitProps(props, ["onEdit", "onRestore", "onRetry", "onDelete", "class", "classList"])
  const hasEdit = () => !!local.onEdit
  const hasRestore = () => !!local.onRestore
  const hasRetry = () => !!local.onRetry
  const hasDelete = () => !!local.onDelete
  const hasActions = () => hasEdit() || hasRestore() || hasRetry() || hasDelete()
  const [confirmAction, setConfirmAction] = createSignal<"delete" | "restore" | undefined>()
  const confirmTimeout = {
    current: undefined as ReturnType<typeof setTimeout> | undefined,
  }

  const clearConfirm = () => {
    const current = confirmTimeout.current
    if (current) {
      clearTimeout(current)
      confirmTimeout.current = undefined
    }
    setConfirmAction(undefined)
  }

  onCleanup(() => {
    const current = confirmTimeout.current
    if (current) clearTimeout(current)
  })

  const armConfirm = (action: "delete" | "restore") => {
    setConfirmAction(action)
    const current = confirmTimeout.current
    if (current) clearTimeout(current)
    confirmTimeout.current = setTimeout(() => {
      confirmTimeout.current = undefined
      setConfirmAction(undefined)
    }, 2000)
  }

  const isConfirming = (action: "delete" | "restore") => confirmAction() === action

  const handleRestore = () => {
    if (!local.onRestore) return
    if (isConfirming("restore")) {
      clearConfirm()
      local.onRestore()
      return
    }
    armConfirm("restore")
  }

  const handleDelete = () => {
    if (!local.onDelete) return
    if (isConfirming("delete")) {
      clearConfirm()
      local.onDelete()
      return
    }
    armConfirm("delete")
  }

  return (
    <Show when={hasActions()}>
      <div
        {...others}
        data-component="message-actions"
        classList={{
          ...(local.classList ?? {}),
          [local.class ?? ""]: !!local.class,
        }}
      >
        <Show when={hasEdit()}>
          <IconButton
            variant="ghost"
            icon="edit-small-2"
            aria-label="Edit message"
            title="Edit"
            onClick={() => local.onEdit?.()}
          />
        </Show>
        <Show when={hasRestore()}>
          <IconButton
            variant="ghost"
            icon="arrow-left"
            aria-label={isConfirming("restore") ? "Confirm restore checkpoint" : "Restore checkpoint"}
            title={isConfirming("restore") ? "Confirm restore" : "Restore"}
            data-slot="message-action-restore"
            data-confirm={isConfirming("restore") ? "true" : undefined}
            onClick={handleRestore}
          />
        </Show>
        <Show when={hasRetry()}>
          <IconButton
            variant="ghost"
            icon="arrow-up"
            aria-label="Retry message"
            title="Retry"
            onClick={() => local.onRetry?.()}
          />
        </Show>
        <Show when={hasDelete()}>
          <IconButton
            variant="ghost"
            icon="circle-x"
            aria-label={isConfirming("delete") ? "Confirm delete message" : "Delete message"}
            title={isConfirming("delete") ? "Confirm delete" : "Delete"}
            data-slot="message-action-delete"
            data-confirm={isConfirming("delete") ? "true" : undefined}
            onClick={handleDelete}
          />
        </Show>
      </div>
    </Show>
  )
}
