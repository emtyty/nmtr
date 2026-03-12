/**
 * Scroll gate — tracks whether the user is actively scrolling.
 * HopTable notifies on scroll; useTraceSession defers state updates
 * while scrolling to keep the main thread free for smooth scrolling.
 */

let scrolling = false
let timer: ReturnType<typeof setTimeout> | null = null

const IDLE_MS = 180 // consider scroll "done" after 180ms of no events

export const scrollGate = {
  notify(): void {
    scrolling = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      scrolling = false
    }, IDLE_MS)
  },

  isScrolling(): boolean {
    return scrolling
  }
}
