import { DSH_ONLY_PROVIDERS, SDK_PROVIDERS } from './types'
import type { AgentRuntime, ChatConfig, LLMProvider } from './types'
export type { AgentRuntime } from './types'

export type DshProviderId =
  | `codex`
  | `claude`
  | `deepseek-official`
  | `antigravity`
  | `openrouter`
  | `agnes`
  | `qwen`
  | `spark`
  | `ernie`
  | `grok`
  | `copilot`
  | `kimi-code-oauth`

export const DSH_PROVIDER_BY_UI: Readonly<Partial<Record<LLMProvider, DshProviderId>>> = {
  'sdk-codex': `codex`,
  'sdk-claude': `claude`,
  deepseek: `deepseek-official`,
  antigravity: `antigravity`,
  openrouter: `openrouter`,
  agnes: `agnes`,
  qwen: `qwen`,
  spark: `spark`,
  ernie: `ernie`,
  grok: `grok`,
  copilot: `copilot`,
  kimi: `kimi-code-oauth`,
}

/** DSH providers that reuse an installed subscription/login rather than an API key. */
export const DSH_SUBSCRIPTION_UI_PROVIDERS = [
  `sdk-codex`,
  `sdk-claude`,
  `antigravity`,
  `openrouter`,
  `agnes`,
  `qwen`,
  `spark`,
  `ernie`,
  `grok`,
  `copilot`,
  `kimi`,
] as const satisfies readonly LLMProvider[]

export interface ProviderMenuSelection {
  provider: LLMProvider
  runtime: AgentRuntime
}

const LLM_PROVIDER_IDS: ReadonlySet<string> = new Set([
  `sdk-claude`,
  `sdk-codex`,
  `sdk-gemini`,
  `antigravity`,
  `openrouter`,
  `agnes`,
  `spark`,
  `ernie`,
  `grok`,
  `copilot`,
  `deepseek`,
  `qwen`,
  `kimi`,
  `zhipu`,
  `zai-coding`,
  `gemini`,
  `anthropic`,
  `custom`,
  `ollama`,
])

function is_llm_provider(value: string): value is LLMProvider {
  return LLM_PROVIDER_IDS.has(value)
}

/**
 * A provider can have both a legacy SDK/API route and a DSH subscription
 * route. Keep those options distinct in the HTML select without changing the
 * persisted provider id.
 */
export function provider_menu_value(
  provider: LLMProvider,
  runtime: AgentRuntime | undefined,
): string {
  return runtime === `dsh` ? `dsh:${provider}` : provider
}

/** Decode a value created by provider_menu_value or a plain provider option. */
export function provider_menu_selection(value: string): ProviderMenuSelection {
  if (value.startsWith(`dsh:`)) {
    return { provider: value.slice(4) as LLMProvider, runtime: `dsh` }
  }
  return { provider: value as LLMProvider, runtime: `legacy` }
}

/** Resolve a persisted session owner back to its exact provider route. */
export function session_agent_route(agent: string): ProviderMenuSelection | undefined {
  if (agent.startsWith(`dsh:`)) {
    const provider = agent.slice(4)
    if (!is_llm_provider(provider) || !provider_supports_dsh(provider)) return undefined
    return { provider, runtime: `dsh` }
  }

  const legacySdkProviders: Readonly<Record<string, LLMProvider>> = {
    claude: `sdk-claude`,
    codex: `sdk-codex`,
    gemini: `sdk-gemini`,
  }
  const sdkProvider = legacySdkProviders[agent]
  if (sdkProvider) return { provider: sdkProvider, runtime: `legacy` }

  if (is_llm_provider(agent) && provider_supports_legacy(agent)) {
    return { provider: agent, runtime: `legacy` }
  }
  return undefined
}

export const DEFAULT_DSH_AGENT_CONFIG = {
  provider: `sdk-codex`,
  runtime: `dsh`,
  profile: `full`,
} as const

export interface AgentRuntimeResolution {
  requested: AgentRuntime
  runtime: AgentRuntime
  supported: boolean
  reason?: string
}

export function provider_supports_dsh(provider: LLMProvider): boolean {
  return DSH_PROVIDER_BY_UI[provider] !== undefined
}

export function provider_supports_legacy(provider: LLMProvider): boolean {
  return !DSH_ONLY_PROVIDERS.has(provider)
}

export function dsh_provider_id(provider: LLMProvider): DshProviderId | undefined {
  return DSH_PROVIDER_BY_UI[provider]
}

/** A configured route is selectable only when the loaded profile reports it. */
export function dsh_provider_enabled(
  provider: LLMProvider,
  manifestProviders: readonly string[] | undefined,
): boolean {
  const id = dsh_provider_id(provider)
  return id !== undefined && manifestProviders?.includes(id) === true
}

export type DshSubscriptionLabelKey =
  | `chat.dsh_codex_subscription`
  | `chat.dsh_claude_subscription`
  | `chat.dsh_antigravity_subscription`
  | `chat.dsh_openrouter_subscription`
  | `chat.dsh_agnes_subscription`
  | `chat.dsh_qwen_subscription`
  | `chat.dsh_spark_subscription`
  | `chat.dsh_ernie_subscription`
  | `chat.dsh_grok_subscription`
  | `chat.dsh_copilot_subscription`
  | `chat.dsh_kimi_subscription`

/**
 * DSH reuses the provider's existing subscription sign-in. These labels must
 * not imply that CatBot will launch the legacy CLI/Agent SDK bridge.
 */
export function dsh_subscription_label_key(
  provider: LLMProvider,
): DshSubscriptionLabelKey | undefined {
  if (provider === `sdk-codex`) return `chat.dsh_codex_subscription`
  const keys: Partial<Record<LLMProvider, DshSubscriptionLabelKey>> = {
    'sdk-claude': `chat.dsh_claude_subscription`,
    antigravity: `chat.dsh_antigravity_subscription`,
    openrouter: `chat.dsh_openrouter_subscription`,
    agnes: `chat.dsh_agnes_subscription`,
    qwen: `chat.dsh_qwen_subscription`,
    spark: `chat.dsh_spark_subscription`,
    ernie: `chat.dsh_ernie_subscription`,
    grok: `chat.dsh_grok_subscription`,
    copilot: `chat.dsh_copilot_subscription`,
    kimi: `chat.dsh_kimi_subscription`,
  }
  return keys[provider]
}

export function uses_dsh_subscription(
  provider: LLMProvider,
  runtime: AgentRuntime | undefined,
): boolean {
  return runtime === `dsh` && dsh_subscription_label_key(provider) !== undefined
}

/** DSH DeepSeek is the only current route whose key crosses the agent bridge. */
export function uses_dsh_api_key(
  provider: LLMProvider,
  runtime: AgentRuntime | undefined,
): boolean {
  return runtime === `dsh` && provider === `deepseek`
}

export function provider_uses_agent_bridge(
  provider: LLMProvider,
  runtime: AgentRuntime | undefined,
): boolean {
  return runtime === `dsh`
    ? provider_supports_dsh(provider)
    : SDK_PROVIDERS.has(provider)
}

/** Session pointers are isolated per DSH provider as well as per runtime. */
export function agent_session_key(
  provider: LLMProvider,
  runtime: AgentRuntime | undefined,
): string | undefined {
  if (runtime === `dsh`) {
    return provider_supports_dsh(provider) ? `dsh:${provider}` : undefined
  }
  if (provider === `sdk-claude`) return `claude`
  if (provider === `sdk-codex`) return `codex`
  if (provider === `sdk-gemini`) return `gemini`
  return undefined
}

/** Return a persistence-safe copy without mutating the live in-memory key. */
export function chat_config_for_storage(
  config: ChatConfig,
  mobile = false,
): ChatConfig {
  if (mobile || uses_dsh_api_key(config.provider, config.agent_runtime)) {
    return { ...config, api_key: `` }
  }
  return { ...config }
}

/**
 * Resolve a saved runtime choice without ever silently sending Gemini or an
 * API-key provider through an incompatible DSH route.
 */
export function resolve_agent_runtime(
  provider: LLMProvider,
  requested: AgentRuntime | undefined,
  dsh_available: boolean,
  manifestProviders?: readonly string[],
): AgentRuntimeResolution {
  const normalized = requested ?? `legacy`
  if (normalized === `legacy`) {
    if (!provider_supports_legacy(provider)) {
      const available = dsh_available && dsh_provider_enabled(provider, manifestProviders)
      return {
        requested: normalized,
        runtime: `dsh`,
        supported: available,
        reason: available
          ? `This provider is DSH-only.`
          : `This DSH-only provider is not present in the loaded runtime profile.`,
      }
    }
    return { requested: normalized, runtime: `legacy`, supported: true }
  }
  if (!provider_supports_dsh(provider)) {
    return {
      requested: normalized,
      runtime: `legacy`,
      supported: false,
      reason: `This provider has no DSH route.`,
    }
  }
  if (!dsh_available) {
    return {
      requested: normalized,
      runtime: `legacy`,
      supported: false,
      reason: `A compatible DSH SDK profile was not detected; the legacy SDK remains active.`,
    }
  }
  if (manifestProviders && !dsh_provider_enabled(provider, manifestProviders)) {
    return {
      requested: normalized,
      runtime: provider_supports_legacy(provider) ? `legacy` : `dsh`,
      supported: false,
      reason: `The selected DSH profile does not provide ${dsh_provider_id(provider)}.`,
    }
  }
  return { requested: normalized, runtime: `dsh`, supported: true }
}
