// Frontend SSE parser for the unified /api/agent/stream endpoint.
// Yields AgentEvent objects from the SSE stream.
//
// In `pnpm desktop:dev` the endpoint is served by vite-plugin-agent-bridge.ts
// against the dev origin, so a relative URL works. In production AppImage
// builds it is served by the `catgo-agent` sidecar (Bun-compiled Node binary)
// listening on 127.0.0.1. Every Tauri webview (including chat popouts) obtains
// the readiness-verified port and token through the managed Rust command;
// credentials are never copied through a main-window JavaScript global.

import type {
  AgentRuntime,
  AgentType,
  Attachment,
  DshCapabilityProfile,
  LLMProvider,
} from './types'
import { agent_from_provider } from './types'

interface AgentConnectionInfo {
  port: number
  token: string
}

function isTauriRuntime(): boolean {
  return typeof window !== `undefined`
    && (`__TAURI__` in window || `__TAURI_INTERNALS__` in window)
}

async function resolveAgentConnection(): Promise<AgentConnectionInfo | undefined> {
  if (!isTauriRuntime()) return undefined
  try {
    const { invoke } = await import(`@tauri-apps/api/core`)
    const value = await invoke<AgentConnectionInfo | null>(`get_agent_connection`)
    if (value === null) {
      if (import.meta.env.DEV) return undefined
      throw new Error(`Agent bridge is not ready.`)
    }
    if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65_535 ||
      typeof value.token !== `string` || value.token.length < 16) {
      throw new Error(`Tauri returned invalid agent connection credentials.`)
    }
    return value
  } catch (error) {
    // In desktop dev the bundled sidecar can be absent; the same-origin Vite
    // middleware remains the intended fallback in that case.
    if (import.meta.env.DEV) return undefined
    throw error
  }
}

async function agentRequest(path: string, json = false, requireAuthenticated = false): Promise<{
  url: string
  headers: Record<string, string>
}> {
  const headers: Record<string, string> = {}
  if (json) headers[`Content-Type`] = `application/json`
  const connection = await resolveAgentConnection()
  if (connection) {
    headers[`X-CatGo-Agent-Token`] = connection.token
    return {
      url: `http://127.0.0.1:${connection.port}${path}`,
      headers,
    }
  }
  if (requireAuthenticated) {
    throw new Error(`This provider credential requires the authenticated CatGo loopback bridge.`)
  }
  return { url: path, headers }
}

export interface AgentRuntimeStatusResponse {
  runtimes: {
    legacy: { available: boolean }
    dsh: {
      available: boolean
      enabled: boolean
      package_name: string
      expected_version?: string
      runtime_source_tag?: string
      profile_source_pin?: string
      native_bridge?: boolean
      provider_readiness?: `unchecked` | `ready` | `unavailable`
      /** Profile whose composition was probed for this status response. */
      profile?: DshCapabilityProfile
      availableProfiles?: DshCapabilityProfile[]
      capabilities?: string[]
      /** Exact model-facing registry reported by the selected composition. */
      tools?: { name: string; description: string }[]
      providers?: string[]
      skills?: { name: string; description: string }[]
      systemInstructionMode?: `catbot-only` | `catbot-with-capabilities`
      systemInstructionSummary?: string
      workspaceContext?: boolean
      harnessIdentity?: boolean
      runtimeContext?: boolean
      reason?: string
    }
  }
}

export async function fetch_agent_runtimes(
  profile: DshCapabilityProfile = `full`,
): Promise<AgentRuntimeStatusResponse> {
  const request = await agentRequest(`/api/agent/runtimes?profile=${encodeURIComponent(profile)}`)
  const response = await fetch(request.url, {
    headers: request.headers,
  })
  if (!response.ok) throw new Error(`Agent runtime discovery failed: HTTP ${response.status}`)
  return await response.json() as AgentRuntimeStatusResponse
}

export interface DshWebProfileStatus {
  state: `stopped` | `starting` | `running` | `failed`
  profile: `catbot-web`
  home: string
  runner?: string
  url?: string
  pid?: number
  reason?: string
}

function validate_dsh_web_profile_status(value: unknown): DshWebProfileStatus {
  if (value === null || typeof value !== `object` || Array.isArray(value)) {
    throw new Error(`DSH plugin center returned an invalid status.`)
  }
  const status = value as Partial<DshWebProfileStatus>
  if (![`stopped`, `starting`, `running`, `failed`].includes(status.state ?? ``)
    || status.profile !== `catbot-web`
    || typeof status.home !== `string`
    || status.home.trim() === ``) {
    throw new Error(`DSH plugin center returned an invalid status.`)
  }
  if (status.url !== undefined) {
    let url: URL
    try {
      url = new URL(status.url)
    } catch {
      throw new Error(`DSH plugin center returned an invalid URL.`)
    }
    if (url.protocol !== `http:` || url.hostname !== `127.0.0.1`
      || !/^\d+$/u.test(url.port) || url.username !== `` || url.password !== ``
      || url.pathname !== `/` || url.search !== `` || url.hash !== ``) {
      throw new Error(`DSH plugin center returned a non-loopback URL.`)
    }
  }
  if (status.state === `running` && status.url === undefined) {
    throw new Error(`DSH plugin center is running without a URL.`)
  }
  return status as DshWebProfileStatus
}

async function dsh_web_profile_request(
  action: `status` | `start` | `stop`,
): Promise<DshWebProfileStatus> {
  const method = action === `status` ? `GET` : `POST`
  const request = await agentRequest(`/api/agent/dsh-web/${action}`, method === `POST`)
  const response = await fetch(request.url, {
    method,
    headers: request.headers,
    ...(method === `POST` ? { body: `{}` } : {}),
  })
  const payload = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    const reason = payload !== null && typeof payload === `object` && !Array.isArray(payload)
      && typeof (payload as { error?: unknown }).error === `string`
      ? (payload as { error: string }).error
      : `HTTP ${response.status}`
    throw new Error(`DSH plugin center ${action} failed: ${reason}`)
  }
  return validate_dsh_web_profile_status(payload)
}

export function fetch_dsh_web_profile_status(): Promise<DshWebProfileStatus> {
  return dsh_web_profile_request(`status`)
}

export function start_dsh_web_profile(): Promise<DshWebProfileStatus> {
  return dsh_web_profile_request(`start`)
}

export function stop_dsh_web_profile(): Promise<DshWebProfileStatus> {
  return dsh_web_profile_request(`stop`)
}

export const DSH_SUBSCRIPTION_PROVIDER_IDS = [
  `codex`, `claude`, `grok`, `copilot`, `antigravity`,
  `openrouter`, `agnes`, `qwen`, `spark`, `ernie`, `kimi`,
] as const

export type DshSubscriptionProviderId = typeof DSH_SUBSCRIPTION_PROVIDER_IDS[number]

export interface DshSubscriptionProviderStatus {
  loggedIn: boolean
  busy: boolean
  accounts: { key: string; account?: string; isDefault: boolean }[]
  detail?: string
  serviceIssue?: `insufficient_balance` | `invalid_credential`
}

export interface DshSubscriptionStatus {
  providers: Record<DshSubscriptionProviderId, DshSubscriptionProviderStatus>
}

export interface DshSubscriptionLoginResult {
  provider: DshSubscriptionProviderId
  authorizeUrl?: string
  userCode?: string
}

export interface DshManualCompactionResult {
  kind: `success` | `error`
  text: string
  sourceEventSeq?: number
}

function responseError(payload: unknown, fallback: string): string {
  return payload !== null && typeof payload === `object` && !Array.isArray(payload)
    && typeof (payload as { error?: unknown }).error === `string`
    ? (payload as { error: string }).error
    : fallback
}

function validate_subscription_status(value: unknown): DshSubscriptionStatus {
  if (value === null || typeof value !== `object` || Array.isArray(value)) {
    throw new Error(`Account service returned an invalid status.`)
  }
  const providers = (value as { providers?: unknown }).providers
  if (providers === null || typeof providers !== `object` || Array.isArray(providers)) {
    throw new Error(`Account service returned an invalid status.`)
  }
  for (const provider of DSH_SUBSCRIPTION_PROVIDER_IDS) {
    const entry = (providers as Record<string, unknown>)[provider]
    if (entry === null || typeof entry !== `object` || Array.isArray(entry)) {
      throw new Error(`Account service returned an invalid ${provider} status.`)
    }
    const status = entry as Partial<DshSubscriptionProviderStatus>
    if (typeof status.loggedIn !== `boolean` || typeof status.busy !== `boolean`
      || !Array.isArray(status.accounts)) {
      throw new Error(`Account service returned an invalid ${provider} status.`)
    }
    if (status.serviceIssue !== undefined
      && status.serviceIssue !== `insufficient_balance`
      && status.serviceIssue !== `invalid_credential`) {
      throw new Error(`Account service returned an invalid ${provider} service issue.`)
    }
  }
  return value as DshSubscriptionStatus
}

export async function fetch_dsh_subscription_status(): Promise<DshSubscriptionStatus> {
  const request = await agentRequest(`/api/agent/subscriptions/status`)
  const response = await fetch(request.url, { headers: request.headers })
  const payload = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    throw new Error(responseError(payload, `Account status failed: HTTP ${response.status}`))
  }
  return validate_subscription_status(payload)
}

export async function start_dsh_subscription_login(
  provider: DshSubscriptionProviderId,
): Promise<DshSubscriptionLoginResult> {
  const request = await agentRequest(`/api/agent/subscriptions/login`, true)
  const response = await fetch(request.url, {
    method: `POST`,
    headers: request.headers,
    body: JSON.stringify({ provider }),
  })
  const payload = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    throw new Error(responseError(payload, `Account login failed: HTTP ${response.status}`))
  }
  if (payload === null || typeof payload !== `object` || Array.isArray(payload)
    || (payload as { provider?: unknown }).provider !== provider) {
    throw new Error(`Account service returned an invalid login response.`)
  }
  const result = payload as DshSubscriptionLoginResult
  if (result.authorizeUrl !== undefined) {
    const url = new URL(result.authorizeUrl)
    if (url.protocol !== `https:` || url.username !== `` || url.password !== ``) {
      throw new Error(`Account service returned an unsafe login URL.`)
    }
  }
  return result
}

export async function compact_dsh_conversation(params: {
  provider: LLMProvider
  sessionId: string
  runtimeProfile?: DshCapabilityProfile
  model?: string
  providerApiKey?: string
}): Promise<DshManualCompactionResult> {
  const transportsDeepSeekKey = params.provider === `deepseek`
  if (params.providerApiKey !== undefined && !transportsDeepSeekKey) {
    throw new Error(`A provider API key is accepted only by the DSH DeepSeek route.`)
  }
  const request = await agentRequest(`/api/agent/compact`, true, transportsDeepSeekKey)
  const response = await fetch(request.url, {
    method: `POST`,
    headers: request.headers,
    body: JSON.stringify({
      provider: params.provider,
      runtime: `dsh`,
      sessionId: params.sessionId,
      runtimeProfile: params.runtimeProfile ?? `full`,
      model: params.model,
      providerApiKey: transportsDeepSeekKey ? params.providerApiKey : undefined,
    }),
  })
  const payload = await response.json().catch(() => undefined) as unknown
  if (!response.ok) {
    throw new Error(responseError(payload, `Conversation compaction failed: HTTP ${response.status}`))
  }
  if (payload === null || typeof payload !== `object` || Array.isArray(payload)) {
    throw new Error(`Conversation compaction returned an invalid response.`)
  }
  const result = payload as Partial<DshManualCompactionResult>
  if ((result.kind !== `success` && result.kind !== `error`) || typeof result.text !== `string`) {
    throw new Error(`Conversation compaction returned an invalid response.`)
  }
  return result as DshManualCompactionResult
}

export interface AgentEvent {
  type: string
  [key: string]: unknown
}

function validate_dsh_control_event(event: AgentEvent): void {
  if (event.type === `client_bridge_ready`) {
    if (typeof event.streamId !== `string` || !event.streamId ||
      typeof event.resolveToken !== `string` || !event.resolveToken) {
      throw new Error(`Invalid DSH client_bridge_ready event.`)
    }
    return
  }
  if (event.type !== `client_tool_request`) return
  const inputIsObject = event.input !== null && typeof event.input === `object` && !Array.isArray(event.input)
  if (typeof event.streamId !== `string` || !event.streamId ||
    typeof event.callId !== `string` || !event.callId ||
    typeof event.toolName !== `string` || !event.toolName ||
    typeof event.tabId !== `string` || !event.tabId ||
    !Number.isFinite(Number(event.deadlineAt)) || !inputIsObject) {
    throw new Error(`Invalid DSH client_tool_request event.`)
  }
}

export interface ClientBridgeReadyEvent extends AgentEvent {
  type: `client_bridge_ready`
  streamId: string
  resolveToken: string
}

export interface StreamAgentParams {
  /** Provider identity is authoritative; `agent` remains a legacy-call shim. */
  provider?: LLMProvider
  agent?: AgentType
  runtime?: AgentRuntime
  runtimeProfile?: DshCapabilityProfile
  prompt: string
  sessionId?: string
  model?: string
  systemPrompt?: string
  /** Host-owned viewer state sent as user-turn context on DSH only. */
  turnContext?: string
  attachments?: Attachment[]
  signal?: AbortSignal
  /**
   * Per-tab identifier forwarded to the SvelteKit route, which passes it to
   * the SDK adapter. The adapter injects it as an `X-CatGo-Tab-Id` HTTP
   * header on MCP requests, so backend MCP tools push structures/workflows
   * back to the specific tab that issued the chat rather than a shared
   * "default" panel. Omit for legacy / popout contexts.
   */
  tabId?: string
  /**
   * When true, forwarded to the server and into the Claude adapter's
   * canUseTool so ALL non-CatGo tools are auto-allowed without a
   * PermissionCard for this stream. Mirrors the chat slice's session-scoped
   * skip_permission flag; never persisted.
   */
  skipPermissions?: boolean
  /**
   * Per-chat-thread key. Forwarded to the Gemini adapter's persistent ACP
   * process pool so repeat prompts in the same chat tab reuse one
   * `gemini --acp` process and keep cross-turn context. The Claude/Codex
   * adapters ignore it (their SDKs persist the subprocess themselves).
   */
  chatId?: string
  /** In-memory credential transported only for DSH's official DeepSeek route. */
  providerApiKey?: string
}

export async function* stream_sdk_agent(
  params: StreamAgentParams,
): AsyncGenerator<AgentEvent> {
  const {
    agent,
    runtime = `legacy`,
    runtimeProfile,
    prompt,
    sessionId,
    model,
    systemPrompt,
    turnContext,
    attachments,
    signal,
    tabId,
    skipPermissions,
    chatId,
    providerApiKey,
  } = params
  const provider = params.provider ?? (
    agent === `claude` ? `sdk-claude`
      : agent === `codex` ? `sdk-codex`
        : agent === `gemini` ? `sdk-gemini`
          : undefined
  )
  if (!provider) throw new Error(`Agent stream provider is required.`)
  const derivedAgent = agent_from_provider(provider)
  if (agent !== undefined && derivedAgent !== agent) {
    throw new Error(`Agent stream provider does not match the legacy agent.`)
  }
  const transportsDeepSeekKey = runtime === `dsh` && provider === `deepseek`
  if (providerApiKey !== undefined && !transportsDeepSeekKey) {
    throw new Error(`A provider API key is accepted only by the DSH DeepSeek route.`)
  }

  // Enforce the prompt boundary at the first transport hop as well as on the
  // server. A future caller cannot accidentally serialize the legacy
  // SDK/Codex developer prompt into a DSH request body.
  const transportedSystemPrompt = runtime === `dsh` ? undefined : systemPrompt
  const transportedTurnContext = runtime === `dsh` ? turnContext : undefined

  const request = await agentRequest(`/api/agent/stream`, true, transportsDeepSeekKey)
  const response = await fetch(request.url, {
    method: `POST`,
    headers: request.headers,
    body: JSON.stringify({
      provider,
      agent: derivedAgent,
      runtime,
      runtimeProfile: runtime === `dsh` ? runtimeProfile ?? `full` : undefined,
      prompt,
      sessionId,
      model,
      systemPrompt: transportedSystemPrompt,
      turnContext: transportedTurnContext,
      attachments,
      tabId,
      skipPermissions,
      chatId,
      providerApiKey: transportsDeepSeekKey ? providerApiKey : undefined,
    }),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => `${response.status}`)
    throw new Error(`Agent stream failed: ${text}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error(`No response body`)

  const decoder = new TextDecoder()
  let buffer = ``

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const parts = buffer.split(`\n\n`)
      buffer = parts.pop() ?? ``

      for (const part of parts) {
        for (const line of part.split(`\n`)) {
          if (!line.startsWith(`data: `)) continue
          const data = line.slice(6)
          if (data === `[DONE]`) return

          let event: AgentEvent
          try {
            event = JSON.parse(data) as AgentEvent
          } catch {
            throw new Error(`Agent stream emitted malformed JSON.`)
          }
          if (runtime === `dsh`) validate_dsh_control_event(event)
          yield event
          if (event.type === `done`) return
        }
      }
    }
  } finally {
    // Returning on a done frame or throwing on a malformed DSH control frame
    // must close the HTTP body, not merely drop the JS reader lock. Otherwise
    // the sidecar can keep the stream and its client-tool broker entry alive.
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function resolve_permission(
  permissionId: string,
  behavior: `allow` | `allow_session` | `deny`,
  suggestions?: unknown[],
  updatedInput?: Record<string, unknown>,
): Promise<boolean> {
  const request = await agentRequest(`/api/agent/permission`, true)
  const resp = await fetch(request.url, {
    method: `POST`,
    headers: request.headers,
    body: JSON.stringify({ permissionId, behavior, suggestions, updatedInput }),
  })
  if (!resp.ok) return false
  const data = await resp.json()
  return data.ok === true
}

/**
 * Atomically replace the human-review deadline with the broker's short commit
 * deadline. This must succeed before an approved native mutation is applied.
 */
export async function claim_client_tool(
  ready: ClientBridgeReadyEvent,
  tabId: string,
  callId: string,
): Promise<{ expiresAt: number }> {
  const endpoint = await agentRequest(`/api/agent/client-tool/claim`, true)
  const request = {
    method: `POST`,
    headers: {
      ...endpoint.headers,
      Authorization: `Bearer ${ready.resolveToken}`,
    },
    body: JSON.stringify({ streamId: ready.streamId, tabId, callId }),
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response
    try {
      response = await fetch(endpoint.url, request)
    } catch (error) {
      lastError = error
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      continue
    }
    if (response.ok) {
      const body = await response.json() as { expiresAt?: unknown }
      const expiresAt = Number(body.expiresAt)
      if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
        throw new Error(`Client tool claim returned an invalid commit deadline.`)
      }
      return { expiresAt }
    }
    const body = await response.text().catch(() => ``)
    lastError = new Error(
      `Client tool claim failed: HTTP ${response.status}${body ? ` ${body}` : ``}`,
    )
    if (response.status < 500 || attempt === 2) throw lastError
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function resolve_client_tool(
  ready: ClientBridgeReadyEvent,
  tabId: string,
  callId: string,
  status: `ok` | `error` | `denied` | `cancelled`,
  result: string,
): Promise<void> {
  const endpoint = await agentRequest(`/api/agent/client-tool/result`, true)
  const request = {
    method: `POST`,
    headers: {
      ...endpoint.headers,
      Authorization: `Bearer ${ready.resolveToken}`,
    },
    body: JSON.stringify({
      streamId: ready.streamId,
      tabId,
      callId,
      status,
      result,
    }),
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response
    try {
      response = await fetch(endpoint.url, request)
    } catch (error) {
      lastError = error
      if (attempt === 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      continue
    }
    if (response.ok) return
    const text = await response.text().catch(() => ``)
    lastError = new Error(
      `Client tool resolution failed: HTTP ${response.status}${text ? ` ${text}` : ``}`,
    )
    if (response.status < 500 || attempt === 2) throw lastError
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
