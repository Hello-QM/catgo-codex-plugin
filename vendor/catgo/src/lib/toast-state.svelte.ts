/**
 * Toast notification state — global queue.
 *
 * Producers call `show_toast({ message, action?, duration? })`.
 * The Toast.svelte component reads `toasts` and renders them.
 *
 * Toasts auto-dismiss after `duration` ms (default 8000).
 * `duration: 0` means sticky (only dismissable manually).
 */

export interface ToastAction {
  label: string
  onclick: () => void
}

export interface ToastItem {
  id: number
  message: string
  action?: ToastAction
  variant?: 'info' | 'success' | 'warning' | 'error'
}

let next_id = 1

const toasts = $state<ToastItem[]>([])

export function get_toasts(): ToastItem[] {
  return toasts
}

export function show_toast(item: Omit<ToastItem, 'id'> & { duration?: number }): number {
  const id = next_id++
  const { duration = 8000, ...rest } = item
  toasts.push({ ...rest, id })
  if (duration > 0) {
    setTimeout(() => dismiss_toast(id), duration)
  }
  return id
}

export function dismiss_toast(id: number): void {
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx >= 0) toasts.splice(idx, 1)
}

export function clear_toasts(): void {
  toasts.length = 0
}
