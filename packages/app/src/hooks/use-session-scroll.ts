import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"

/** Breathing room below header when snapping new message to top */
const HEADER_BREATHING_ROOM = 48
/** Distance from bottom to consider "near bottom" for auto-scroll re-engagement */
const NEAR_BOTTOM_THRESHOLD = 50

export interface UseSessionScrollOptions {
  /** Whether the session is currently streaming/working */
  working: Accessor<boolean>
  /** Current composer height in pixels */
  composerHeight: Accessor<number>
  /** Signal indicating snap was requested */
  snapRequested: Accessor<boolean>
  /** Clear the snap request after handling */
  clearSnapRequest: () => void
  /** Callback when user scrolls away during streaming */
  onUserScrolledAway: (value: boolean) => void
  /** Optional callback when content height changes */
  onContentResize?: () => void
}

export interface UseSessionScrollResult {
  /** Ref setter for the scroll container */
  scrollRef: (el: HTMLElement | undefined) => void
  /** Ref setter for the content container (observed for resize) */
  contentRef: (el: HTMLElement | undefined) => void
  /** Handle scroll events (call from onScroll) */
  handleScroll: (e: Event) => void
  /** Current height of the scroll container viewport */
  containerHeight: Accessor<number>
}

export function useSessionScroll(options: UseSessionScrollOptions): UseSessionScrollResult {
  let scrollEl: HTMLElement | undefined
  let contentEl: HTMLElement | undefined
  let resizeObserver: ResizeObserver | undefined
  let containerResizeObserver: ResizeObserver | undefined
  let mutationObserver: MutationObserver | undefined
  let userScrolled = false
  let lastContentHeight = 0
  let pendingSnap = false
  let lastMessageCount = 0
  let messageCount = 0
  let mutationFrame = 0
  let resizeFrame = 0
  const lastMessageId = { value: "" }
  const lastMessageIdAtSnap = { value: "" }
  const [containerHeight, setContainerHeight] = createSignal(0)

  function isNearBottom() {
    if (!scrollEl) return true
    const threshold = NEAR_BOTTOM_THRESHOLD
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold
  }

  function scrollToBottom() {
    if (!scrollEl) return
    requestAnimationFrame(() => {
      if (!scrollEl) return
      scrollEl.scrollTop = scrollEl.scrollHeight
    })
  }

  function getMessageElements() {
    if (!scrollEl) return []
    return scrollEl.querySelectorAll("[data-message-id]")
  }

  function updateMessageState() {
    const messages = getMessageElements()
    const currentCount = messages.length
    const lastMessage = messages[messages.length - 1] as HTMLElement | undefined
    const currentId = lastMessage?.dataset.messageId ?? ""
    const countChanged = currentCount !== messageCount
    const idChanged = currentId !== lastMessageId.value
    if (!countChanged && !idChanged) return
    if (countChanged) {
      messageCount = currentCount
    }
    if (idChanged) lastMessageId.value = currentId
  }

  function snapNewMessageToTop() {
    if (!scrollEl) return
    // Find the last message element
    const messages = scrollEl.querySelectorAll("[data-message-id]")
    const lastMessage = messages[messages.length - 1] as HTMLElement | undefined
    if (!lastMessage) {
      scrollToBottom()
      return
    }
    // Calculate position to place message near top with breathing room
    const messageTop = lastMessage.offsetTop
    const targetScroll = Math.max(0, messageTop - HEADER_BREATHING_ROOM)
    scrollEl.scrollTo({
      top: targetScroll,
      behavior: "smooth"
    })
  }

  function checkForNewMessageAndSnap() {
    if (!pendingSnap) return
    if (!scrollEl) return

    const currentCount = messageCount
    const countAdvanced = currentCount > lastMessageCount
    const idChanged = lastMessageId.value !== lastMessageIdAtSnap.value
    if (!countAdvanced && !idChanged) return

    // Wait until we have more messages or the last message id changes
    if (countAdvanced || idChanged) {
      // Set pendingSnap false immediately to prevent double-snap from multiple observers
      pendingSnap = false
      userScrolled = false
      options.onUserScrolledAway(false)
      // Use double RAF to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          snapNewMessageToTop()
        })
      })
    }
  }

  function handleContentResize(entries: ResizeObserverEntry[]) {
    const entry = entries[0]
    if (!entry) return
    const newHeight = entry.contentRect.height
    const heightGrew = newHeight > lastContentHeight
    lastContentHeight = newHeight

    // Check if we should snap to new message
    if (pendingSnap && heightGrew) {
      checkForNewMessageAndSnap()
    }

    // Throttle resize callbacks to one per animation frame
    if (resizeFrame) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      options.onContentResize?.()
    })
  }

  function handleMutation() {
    // Throttle mutations to one update per animation frame
    if (mutationFrame) return
    mutationFrame = requestAnimationFrame(() => {
      mutationFrame = 0
      // Check for new messages when DOM changes
      updateMessageState()
      if (pendingSnap) {
        checkForNewMessageAndSnap()
      }
    })
  }

  function handleScroll(e: Event) {
    if (!scrollEl) return
    const el = e.target as HTMLElement
    if (el !== scrollEl) return

    // Check if user scrolled away during streaming
    if (options.working()) {
      if (!isNearBottom()) {
        if (!userScrolled) {
          userScrolled = true
          options.onUserScrolledAway(true)
        }
      } else if (userScrolled) {
        // User scrolled back to bottom, re-engage auto-scroll
        userScrolled = false
        options.onUserScrolledAway(false)
      }
    }
  }

  function handleWheel(e: WheelEvent) {
    // Detect intentional scroll up during streaming
    if (options.working() && e.deltaY < 0 && !userScrolled) {
      userScrolled = true
      options.onUserScrolledAway(true)
    }
  }

  function scrollRef(el: HTMLElement | undefined) {
    // Cleanup old listeners
    if (scrollEl) {
      scrollEl.removeEventListener("wheel", handleWheel)
    }
    if (mutationObserver) {
      mutationObserver.disconnect()
      mutationObserver = undefined
    }
    if (containerResizeObserver) {
      containerResizeObserver.disconnect()
      containerResizeObserver = undefined
    }

    scrollEl = el

    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: true })
      // Watch for DOM changes to detect new messages
      mutationObserver = new MutationObserver(handleMutation)
      mutationObserver.observe(el, { childList: true, subtree: true })
      // Initialize message state
      const messages = getMessageElements()
      messageCount = messages.length
      lastMessageCount = messageCount
      const lastMsg = messages[messages.length - 1] as HTMLElement | undefined
      lastMessageId.value = lastMsg?.dataset.messageId ?? ""
      // Track container height for spacer calculation
      setContainerHeight(el.clientHeight)
      containerResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) {
          setContainerHeight(entry.contentRect.height)
        }
      })
      containerResizeObserver.observe(el)
    }
  }

  function contentRef(el: HTMLElement | undefined) {
    // Cleanup old observer
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = undefined
    }
    contentEl = el
    if (el) {
      resizeObserver = new ResizeObserver(handleContentResize)
      resizeObserver.observe(el)
      lastContentHeight = el.getBoundingClientRect().height
    }
  }

  // Watch for snap requests reactively
  createEffect(() => {
    const requested = options.snapRequested()
    if (requested) {
      // Clear the request immediately so we don't process it again
      options.clearSnapRequest()
      // Snapshot current message state so we only snap on the next new message
      updateMessageState()
      lastMessageCount = messageCount
      lastMessageIdAtSnap.value = lastMessageId.value
      pendingSnap = true
      userScrolled = false
      options.onUserScrolledAway(false)
      checkForNewMessageAndSnap()
    }
  })

  // Reset user scrolled state when streaming ends
  createEffect(
    on(
      () => options.working(),
      (isWorking, wasWorking) => {
        if (!isWorking && wasWorking) {
          userScrolled = false
          options.onUserScrolledAway(false)
          pendingSnap = false
        }
      },
    ),
  )

  onCleanup(() => {
    if (scrollEl) {
      scrollEl.removeEventListener("wheel", handleWheel)
    }
    if (resizeObserver) {
      resizeObserver.disconnect()
    }
    if (mutationObserver) {
      mutationObserver.disconnect()
    }
    if (containerResizeObserver) {
      containerResizeObserver.disconnect()
    }
    if (mutationFrame) {
      cancelAnimationFrame(mutationFrame)
    }
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame)
    }
  })

  return {
    scrollRef,
    contentRef,
    handleScroll,
    containerHeight,
  }
}
