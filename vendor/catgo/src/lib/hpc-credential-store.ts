/**
 * Tauri-desktop bridge for HPC passwords stored in the operating system
 * credential manager. The Python profile API remains non-secret.
 */

import type { HPCProfile } from '$lib/api/hpc'

export type HpcCredentialProfile = Pick<
  HPCProfile,
  `name` | `host` | `port` | `username`
>

interface HpcCredentialIdentity {
  profileName: string
  host: string
  port: number
  username: string
}

function is_mobile_runtime(): boolean {
  if (typeof navigator === `undefined`) return false
  const ua = navigator.userAgent
  return /android|iphone|ipod|ipad/i.test(ua)
    || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

export function hpc_credential_store_available(): boolean {
  return typeof window !== `undefined`
    && !is_mobile_runtime()
    && (`__TAURI__` in window || `__TAURI_INTERNALS__` in window)
}

function identity(profile: HpcCredentialProfile): HpcCredentialIdentity {
  return {
    profileName: profile.name.trim(),
    host: profile.host.trim(),
    port: profile.port,
    username: profile.username.trim(),
  }
}

async function invoke_credential<T>(
  command: `prepare_write` | `cancel_write` | `invalidate_writes` | `get` | `set` | `delete`,
  profile: HpcCredentialProfile,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!hpc_credential_store_available()) {
    throw new Error(`System credential storage is only available in the desktop app.`)
  }
  const { invoke } = await import(`@tauri-apps/api/core`)
  return invoke<T>(`plugin:hpc-credentials|hpc_profile_password_${command}`, {
    identity: identity(profile),
    ...payload,
  })
}

export function same_hpc_credential_identity(
  first: HpcCredentialProfile,
  second: HpcCredentialProfile,
): boolean {
  return first.name.trim() === second.name.trim()
    && first.host.trim().toLowerCase() === second.host.trim().toLowerCase()
    && first.port === second.port
    && first.username.trim() === second.username.trim()
}

export async function load_hpc_profile_password(
  profile: HpcCredentialProfile,
): Promise<string | null> {
  return invoke_credential<string | null>(`get`, profile)
}

export async function prepare_hpc_profile_password_write(
  profile: HpcCredentialProfile,
): Promise<number> {
  return invoke_credential<number>(`prepare_write`, profile)
}

export async function invalidate_hpc_profile_password_writes(
  profile: HpcCredentialProfile,
): Promise<void> {
  await invoke_credential<void>(`invalidate_writes`, profile)
}

export async function cancel_hpc_profile_password_write(
  profile: HpcCredentialProfile,
  expected_revision: number,
): Promise<boolean> {
  return invoke_credential<boolean>(`cancel_write`, profile, {
    expectedRevision: expected_revision,
  })
}

export async function store_hpc_profile_password(
  profile: HpcCredentialProfile,
  password: string,
  expected_revision: number,
): Promise<boolean> {
  if (!password) throw new Error(`Password must not be empty.`)
  return invoke_credential<boolean>(`set`, profile, {
    password,
    expectedRevision: expected_revision,
  })
}

export async function delete_hpc_profile_password(
  profile: HpcCredentialProfile,
): Promise<void> {
  await invoke_credential<void>(`delete`, profile)
}
