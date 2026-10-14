import type { ToolCall } from './types'
import {
  map_dsh_client_tool,
  type DshClientToolRequest,
} from './client-tool-policy'

export type DshClientToolStatus = `ok` | `error` | `denied` | `cancelled`

export interface DshClientToolOutcome {
  status: DshClientToolStatus
  result: string
}

export interface DshClientToolExecutorDeps {
  tabId: string
  signal?: AbortSignal
  execute: (
    name: string,
    input: Record<string, unknown>,
    context: { tab_id: string },
  ) => Promise<string>
  claimMutation: () => Promise<{ expiresAt: number }>
  requestPermission: (
    call: ToolCall,
    preview: Record<string, unknown>,
    reason: string,
  ) => Promise<boolean>
  now?: () => number
}

function error_result(message: string, status: DshClientToolStatus = `error`): DshClientToolOutcome {
  return { status, result: JSON.stringify({ error: message, status }) }
}

function exception_result(error: unknown, signal?: AbortSignal): DshClientToolOutcome {
  if (signal?.aborted) return error_result(`Client tool request was cancelled.`, `cancelled`)
  return error_result(error instanceof Error ? error.message : String(error))
}

function parsed_result(result: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(result)
    return value && typeof value === `object` && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function is_error(result: string): boolean {
  return typeof parsed_result(result)?.error === `string`
}

function deep_freeze<T>(value: T): T {
  if (value && typeof value === `object` && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) deep_freeze(nested)
  }
  return value
}

/**
 * Execute one broker-authenticated DSH capability inside the owning CatBot
 * tab. Mutation calls are previewed from a frozen mapping, reviewed by the
 * existing PermissionCard, and then committed with the same base revision.
 */
export async function execute_dsh_client_tool(
  request: DshClientToolRequest,
  deps: DshClientToolExecutorDeps,
): Promise<DshClientToolOutcome> {
  let claimed = false
  try {
    const now = deps.now ?? Date.now
    const expired = (): boolean => !Number.isFinite(request.deadlineAt) || now() >= request.deadlineAt
    if (deps.signal?.aborted) return error_result(`Client tool request was cancelled.`, `cancelled`)
    if (expired()) return error_result(`Client tool request expired before execution.`, `cancelled`)

    const mapped = map_dsh_client_tool(request.toolName, request.input)
    const input = deep_freeze(structuredClone(mapped.input))

    if (mapped.kind === `read`) {
      const result = await deps.execute(mapped.toolName, input, { tab_id: deps.tabId })
      return { status: is_error(result) ? `error` : `ok`, result }
    }

    const mutation = mapped.mutation
    if (!mutation) return error_result(`Native mutation policy is missing for ${mapped.capability}.`)

    let preview: Record<string, unknown>
    if (mutation.mode === `structure-revision`) {
      const baseRevision = Number(input.base_revision)
      const previewInput = deep_freeze({ ...structuredClone(input), preview: true })
      const previewResult = await deps.execute(mapped.toolName, previewInput, { tab_id: deps.tabId })
      const parsedPreview = parsed_result(previewResult)
      if (is_error(previewResult) || !parsedPreview) return { status: `error`, result: previewResult }
      if (parsedPreview.revision !== baseRevision) {
        return error_result(
          `Stale structure revision: expected ${baseRevision}, current ${String(parsedPreview.revision)}. Inspect or preview again before applying.`,
        )
      }
      preview = parsedPreview
    } else {
      preview = deep_freeze(structuredClone(mutation.preview))
    }

    const allowed = await deps.requestPermission({
      id: request.callId,
      name: request.toolName,
      arguments: structuredClone(request.input),
    }, preview, mutation.reason)
    if (deps.signal?.aborted) return error_result(`Client tool request was cancelled.`, `cancelled`)
    // Permission may remain open for minutes. Re-check the broker deadline at
    // the last possible point so an expired request can never mutate a viewer.
    if (expired()) return error_result(`Client tool request expired before approval.`, `cancelled`)
    if (!allowed) return error_result(mutation.deniedMessage, `denied`)

    // The server atomically replaces the long approval timeout with a short
    // commit timeout. If the original deadline already won, claim fails and
    // the viewer is never mutated.
    const claim = await deps.claimMutation()
    claimed = true
    // A renderer may have been suspended after the server issued its lease.
    // Refuse a late apply with a small scheduling margin. Once this check
    // passes there is no await before execute() begins, and cancellation no
    // longer rolls back the committed lease.
    if (!Number.isFinite(claim.expiresAt) || now() >= claim.expiresAt - 1_000) {
      return error_result(`Client tool commit lease expired before apply.`, `cancelled`)
    }
    const result = await deps.execute(mapped.toolName, input, { tab_id: deps.tabId })
    return { status: is_error(result) ? `error` : `ok`, result }
  } catch (error) {
    // The browser-to-broker caller relies on this function producing one
    // terminal outcome. Never let a viewer, clone, or permission exception
    // strand the DSH request until its server-side timeout.
    return exception_result(error, claimed ? undefined : deps.signal)
  }
}
