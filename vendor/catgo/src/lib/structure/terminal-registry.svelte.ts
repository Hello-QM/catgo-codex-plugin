/**
 * In-process registry bridging CatBot tools <-> the visible terminal PTYs.
 * Each TerminalPanel registers a handle on mount and marks itself active on
 * focus; CatBot tools call ensure_active_terminal(). Renderer-global handles
 * remain local, while a small request/response channel lets a CatBot popout
 * address the visible PTY in the originating tab. No Svelte $state needed:
 * callers read at call time, not in a reactive context.
 */

export interface TerminalHandle {
  id: string
  /** Owning CatGo workspace tab. Never selected by model input. */
  owner_tab_id?: string
  session_id: string // '' for local, HPC session id for remote
  host?: string
  username?: string
  is_remote: boolean
  run_command: (cmd: string, opts?: { timeout_ms?: number }) =>
    Promise<{ output: string; exit_code: number | null; running: boolean }>
  send_keys: (data: string) => Promise<void>
  interrupt: () => Promise<void>
  read_buffer: (lines?: number) => string | Promise<string>
}

type TerminalRpcAction = `ping` | `read` | `run` | `send_keys` | `interrupt`

interface TerminalRpcRequest {
  kind: `request`
  request_id: string
  owner_tab_id: string
  action: TerminalRpcAction
  input: Record<string, unknown>
}

interface TerminalRpcResponse {
  kind: `response`
  request_id: string
  ok: boolean
  value?: unknown
  error?: string
}

type TerminalRpcMessage = TerminalRpcRequest | TerminalRpcResponse

const TERMINAL_RPC_CHANNEL = `catgo-terminal-rpc-v1`
const TERMINAL_RPC_EVENT = `catgo-terminal-rpc-v1`
const _processed_requests = new Set<string>()
let _rpc_host_channel: BroadcastChannel | null = null
let _rpc_tauri_unlisten: (() => void) | null = null
let _rpc_tauri_starting = false

const _handles = new Map<string, TerminalHandle>()
const _order: string[] = [] // registration order; last = most recent
let _active_id: string | null = null

export function register_terminal(h: TerminalHandle): void {
  _handles.set(h.id, h)
  const i = _order.indexOf(h.id)
  if (i >= 0) _order.splice(i, 1)
  _order.push(h.id)
  ensure_rpc_host()
}

export function unregister_terminal(id: string): void {
  _handles.delete(id)
  const i = _order.indexOf(id)
  if (i >= 0) _order.splice(i, 1)
  if (_active_id === id) _active_id = null
}

export function mark_terminal_active(id: string): void {
  if (_handles.has(id)) _active_id = id
}

function belongs_to_tab(handle: TerminalHandle, owner_tab_id?: string): boolean {
  if (!owner_tab_id) return true
  return (handle.owner_tab_id ?? `default`) === owner_tab_id
}

export function get_active_terminal(owner_tab_id?: string): TerminalHandle | null {
  if (_active_id && _handles.has(_active_id)) {
    const active = _handles.get(_active_id)!
    if (belongs_to_tab(active, owner_tab_id)) return active
  }
  for (let i = _order.length - 1; i >= 0; i--) {
    const h = _handles.get(_order[i])
    if (h && belongs_to_tab(h, owner_tab_id)) return h
  }
  return null
}

export function has_active_terminal(owner_tab_id?: string): boolean {
  return get_active_terminal(owner_tab_id) !== null
}

/**
 * App registers an opener so the tools can auto-spawn a local terminal when none
 * exists. Returns the new handle once it has registered.
 */
let _opener: ((owner_tab_id?: string) => Promise<TerminalHandle | null>) | null = null
export function set_terminal_opener(
  fn: ((owner_tab_id?: string) => Promise<TerminalHandle | null>) | null,
): void {
  _opener = fn
}
export async function ensure_active_terminal(owner_tab_id?: string): Promise<TerminalHandle | null> {
  const existing = get_active_terminal(owner_tab_id)
  if (existing) return existing
  if (_opener) {
    const opened = await _opener(owner_tab_id)
    if (opened) return opened
  }
  if (!owner_tab_id) return null
  return await remote_terminal(owner_tab_id)
}

function terminal_info(handle: TerminalHandle): Record<string, unknown> {
  return {
    id: handle.id,
    owner_tab_id: handle.owner_tab_id ?? `default`,
    session_id: handle.session_id,
    host: handle.host,
    username: handle.username,
    is_remote: handle.is_remote,
  }
}

function is_tauri_window(): boolean {
  return typeof window !== `undefined` && `__TAURI_INTERNALS__` in window
}

function post_rpc(message: TerminalRpcMessage, channel?: BroadcastChannel): void {
  try { (channel ?? _rpc_host_channel)?.postMessage(message) } catch { /* unavailable */ }
  if (is_tauri_window()) {
    void import(`@tauri-apps/api/event`)
      .then(({ emit }) => emit(TERMINAL_RPC_EVENT, message))
      .catch(() => {})
  }
}

async function handle_rpc_request(request: TerminalRpcRequest): Promise<void> {
  if (_processed_requests.has(request.request_id)) return
  const handle = get_active_terminal(request.owner_tab_id)
  if (!handle) return
  _processed_requests.add(request.request_id)
  if (_processed_requests.size > 256) {
    const oldest = _processed_requests.values().next().value
    if (oldest) _processed_requests.delete(oldest)
  }
  try {
    let value: unknown
    if (request.action === `ping`) value = terminal_info(handle)
    else if (request.action === `read`) {
      value = await handle.read_buffer(Number(request.input.lines ?? 40))
    } else if (request.action === `run`) {
      const timeout = Number(request.input.timeout_ms)
      value = await handle.run_command(
        String(request.input.command ?? ``),
        Number.isFinite(timeout) ? { timeout_ms: timeout } : undefined,
      )
    } else if (request.action === `send_keys`) {
      await handle.send_keys(String(request.input.data ?? ``))
      value = null
    } else {
      await handle.interrupt()
      value = null
    }
    post_rpc({ kind: `response`, request_id: request.request_id, ok: true, value })
  } catch (error) {
    post_rpc({
      kind: `response`,
      request_id: request.request_id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function receive_rpc(message: unknown): void {
  const request = message as Partial<TerminalRpcRequest>
  if (request?.kind !== `request` || typeof request.request_id !== `string`
    || typeof request.owner_tab_id !== `string`) return
  if (![ `ping`, `read`, `run`, `send_keys`, `interrupt` ].includes(String(request.action))) return
  void handle_rpc_request(request as TerminalRpcRequest)
}

function ensure_rpc_host(): void {
  if (!_rpc_host_channel && typeof BroadcastChannel !== `undefined`) {
    try {
      _rpc_host_channel = new BroadcastChannel(TERMINAL_RPC_CHANNEL)
      _rpc_host_channel.onmessage = (event) => receive_rpc(event.data)
    } catch { _rpc_host_channel = null }
  }
  if (!is_tauri_window() || _rpc_tauri_unlisten || _rpc_tauri_starting) return
  _rpc_tauri_starting = true
  void import(`@tauri-apps/api/event`).then(({ listen }) => (
    listen<TerminalRpcMessage>(TERMINAL_RPC_EVENT, (event) => receive_rpc(event.payload))
  )).then((unlisten) => { _rpc_tauri_unlisten = unlisten })
    .catch(() => {})
    .finally(() => { _rpc_tauri_starting = false })
}

async function rpc_request(
  owner_tab_id: string,
  action: TerminalRpcAction,
  input: Record<string, unknown>,
  timeout_ms: number,
): Promise<unknown> {
  const request_id = typeof crypto !== `undefined` && typeof crypto.randomUUID === `function`
    ? crypto.randomUUID()
    : `terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`
  let channel: BroadcastChannel | null = null
  let unlisten: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  return await new Promise<unknown>(async (resolve, reject) => {
    let settled = false
    const finish = (response?: TerminalRpcResponse, error?: Error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      channel?.close()
      unlisten?.()
      if (error) reject(error)
      else if (!response?.ok) reject(new Error(response?.error || `Visible terminal request failed.`))
      else resolve(response.value)
    }
    const receive = (message: unknown) => {
      const response = message as Partial<TerminalRpcResponse>
      if (response?.kind === `response` && response.request_id === request_id) {
        finish(response as TerminalRpcResponse)
      }
    }
    if (typeof BroadcastChannel !== `undefined`) {
      try {
        channel = new BroadcastChannel(TERMINAL_RPC_CHANNEL)
        channel.onmessage = (event) => receive(event.data)
      } catch { channel = null }
    }
    if (is_tauri_window()) {
      try {
        const { listen } = await import(`@tauri-apps/api/event`)
        unlisten = await listen<TerminalRpcMessage>(TERMINAL_RPC_EVENT, (event) => receive(event.payload))
      } catch { /* BroadcastChannel may still be available */ }
    }
    timer = setTimeout(() => finish(undefined, new Error(`No visible terminal is available in this CatGo tab.`)), timeout_ms)
    post_rpc({ kind: `request`, request_id, owner_tab_id, action, input }, channel ?? undefined)
  })
}

async function remote_terminal(owner_tab_id: string): Promise<TerminalHandle | null> {
  let info: Record<string, unknown>
  try {
    info = await rpc_request(owner_tab_id, `ping`, {}, 2_500) as Record<string, unknown>
  } catch {
    return null
  }
  return {
    id: String(info.id ?? `remote-terminal`),
    owner_tab_id,
    session_id: String(info.session_id ?? ``),
    host: typeof info.host === `string` ? info.host : undefined,
    username: typeof info.username === `string` ? info.username : undefined,
    is_remote: info.is_remote === true,
    run_command: async (command, options) => await rpc_request(
      owner_tab_id,
      `run`,
      { command, ...(options?.timeout_ms === undefined ? {} : { timeout_ms: options.timeout_ms }) },
      (options?.timeout_ms ?? 15_000) + 5_000,
    ) as { output: string; exit_code: number | null; running: boolean },
    send_keys: async (data) => { await rpc_request(owner_tab_id, `send_keys`, { data }, 10_000) },
    interrupt: async () => { await rpc_request(owner_tab_id, `interrupt`, {}, 10_000) },
    read_buffer: async (lines) => String(await rpc_request(owner_tab_id, `read`, { lines }, 10_000)),
  }
}

/** Test-only: clear all state. */
export function _reset_registry_for_test(): void {
  _handles.clear()
  _order.length = 0
  _active_id = null
  _opener = null
  _processed_requests.clear()
  _rpc_host_channel?.close()
  _rpc_host_channel = null
  _rpc_tauri_unlisten?.()
  _rpc_tauri_unlisten = null
  _rpc_tauri_starting = false
}
