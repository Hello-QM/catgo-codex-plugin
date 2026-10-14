<script lang="ts">
  import '$lib/dialog-shared.css'
  import {
    connectHPC,
    connectSSHConfig,
    disconnectSession,
    loadProfiles,
    saveProfile,
    deleteProfile,
    type HPCConnectionConfig,
    type HPCProfile,
    type HPCWSConnection,
    type SchedulerType,
    type AuthMethod,
  } from '$lib/api/hpc'
  import { t, load_i18n_module } from '$lib/i18n/index.svelte'
  import { hpc_session_store, refresh_hpc_sessions, add_session, remove_session } from '$lib/hpc-sessions.svelte'
  import { pick_hpc_key_file } from '$lib/hpc-key-file'
  import {
    cancel_hpc_profile_password_write,
    delete_hpc_profile_password,
    hpc_credential_store_available,
    invalidate_hpc_profile_password_writes,
    load_hpc_profile_password,
    prepare_hpc_profile_password_write,
    same_hpc_credential_identity,
    store_hpc_profile_password,
    type HpcCredentialProfile,
  } from '$lib/hpc-credential-store'

  load_i18n_module('common')
  load_i18n_module('structure')

  let {
    show = $bindable(false),
  }: {
    show?: boolean
  } = $props()

  // ─── Connection state ───
  type ConnStatus = `idle` | `connecting` | `otp_required` | `connected` | `error`
  let conn_status = $state<ConnStatus>(`idle`)
  let conn_error = $state(``)
  let otp_prompt = $state(t('common.verification_code'))
  let otp_code = $state(``)
  let ws_conn = $state<HPCWSConnection | null>(null)
  let connected_session_id = $state(``)
  let connected_host = $state(``)
  let connected_username = $state(``)

  // ─── Form state ───
  let host = $state(``)
  let port = $state(22)
  let username = $state(``)
  let password = $state(``)
  let auth_method = $state<AuthMethod>(`password`)
  let key_file = $state(``)
  let key_content = $state(``)
  let key_selected_name = $state(``)
  let use_jump = $state(false)
  let jump_host = $state(``)
  let jump_port = $state(22)
  let jump_username = $state(``)
  let jump_password = $state(``)
  let jump_use_key = $state(true)
  let ssh_alias = $state(``)
  let scheduler = $state<SchedulerType>(`slurm`)
  let work_root = $state(``)
  // ─── SOCKS5 proxy settings ───
  let use_proxy = $state(false)
  let proxy_host = $state(`127.0.0.1`)
  let proxy_port = $state(1080)
  let proxy_username = $state(``)
  let proxy_password = $state(``)

  // ─── Profiles ───
  let profiles = $state<HPCProfile[]>([])
  let selected_profile = $state(``)
  let profile_name = $state(``)
  let profiles_loaded = $state(false)
  const credential_store_available = hpc_credential_store_available()
  let remember_password = $state(false)
  let credential_hint = $state(``)
  let credential_hint_error = $state(false)
  let credential_request_generation = 0
  const credential_write_generations: Record<string, number> = {}

  // ─── Load profiles + refresh connections on open ───
  $effect(() => {
    if (show) {
      refresh_hpc_sessions()
      if (!profiles_loaded) {
        profiles_loaded = true
        load_saved_profiles()
      }
    }
  })

  async function load_saved_profiles() {
    try {
      profiles = await loadProfiles()
    } catch { /* server not running */ }
  }

  function password_auth_selected(method: AuthMethod = auth_method): boolean {
    return method === `password` || method === `password_otp`
  }

  function build_profile(name: string): HPCProfile {
    return {
      name,
      host: host.trim(),
      port,
      username: username.trim(),
      auth_method,
      key_file: key_file || undefined,
      scheduler,
      ssh_alias: auth_method === `ssh_config` ? ssh_alias.trim() : undefined,
      jump_host: use_jump ? jump_host.trim() : undefined,
      jump_port: use_jump ? jump_port : undefined,
      jump_username: use_jump ? jump_username.trim() : undefined,
      proxy_host: use_proxy ? proxy_host.trim() : undefined,
      proxy_port: use_proxy ? proxy_port : undefined,
      proxy_username: use_proxy && proxy_username ? proxy_username.trim() : undefined,
      work_root: work_root.trim() || undefined,
    }
  }

  function selected_credential_profile(): HPCProfile | null {
    if (!credential_store_available || !password_auth_selected()) return null
    const saved = profiles.find((profile) => profile.name === selected_profile)
    if (!saved || !password_auth_selected(saved.auth_method)) return null
    return same_hpc_credential_identity(saved, build_profile(saved.name)) ? saved : null
  }

  function invalidate_credential_request(clear_hint = false) {
    credential_request_generation += 1
    if (clear_hint) {
      credential_hint = ``
      credential_hint_error = false
    }
  }

  function handle_password_input() {
    invalidate_credential_request(true)
  }

  function credential_write_key(profile: HpcCredentialProfile): string {
    return JSON.stringify([
      profile.name.trim(),
      profile.host.trim().toLowerCase(),
      profile.port,
      profile.username.trim(),
    ])
  }

  function current_credential_write_generation(profile: HpcCredentialProfile): number {
    return credential_write_generations[credential_write_key(profile)] ?? 0
  }

  function invalidate_local_credential_writes(profile: HpcCredentialProfile): void {
    const key = credential_write_key(profile)
    credential_write_generations[key] = (credential_write_generations[key] ?? 0) + 1
  }

  function handle_remember_password_change(event: Event) {
    const next = (event.currentTarget as HTMLInputElement).checked
    remember_password = next
    if (next) return
    const saved_profile = selected_credential_profile()
    if (!saved_profile) return
    invalidate_local_credential_writes(saved_profile)
    void invalidate_hpc_profile_password_writes(saved_profile).catch(() => {
      const active_profile = selected_credential_profile()
      if (
        !remember_password
        && active_profile
        && same_hpc_credential_identity(active_profile, saved_profile)
      ) {
        credential_hint = t('structure.password_store_unavailable')
        credential_hint_error = true
      }
    })
  }

  async function resolve_connection_password(): Promise<{
    password: string
    saved_profile: HPCProfile | null
    loaded_from_keyring: boolean
  } | null> {
    const saved_profile = selected_credential_profile()
    if (password) return { password, saved_profile, loaded_from_keyring: false }
    if (!saved_profile) {
      credential_hint = t('structure.saved_password_missing')
      credential_hint_error = true
      return null
    }

    const generation = ++credential_request_generation
    credential_hint = t('structure.saved_password_loading')
    credential_hint_error = false
    try {
      const saved = await load_hpc_profile_password(saved_profile)
      const current_profile = selected_credential_profile()
      if (
        generation !== credential_request_generation
        || !current_profile
        || !same_hpc_credential_identity(current_profile, saved_profile)
      ) {
        return null
      }
      if (!saved) {
        credential_hint = t('structure.saved_password_missing')
        credential_hint_error = true
        return null
      }
      credential_hint = t('structure.saved_password_loaded')
      return { password: saved, saved_profile, loaded_from_keyring: true }
    } catch {
      if (generation === credential_request_generation) {
        credential_hint = t('structure.password_store_unavailable')
        credential_hint_error = true
      }
      return null
    }
  }

  async function forget_saved_password() {
    const saved_profile = selected_credential_profile()
    if (!saved_profile) return
    invalidate_local_credential_writes(saved_profile)
    const generation = ++credential_request_generation
    try {
      await delete_hpc_profile_password(saved_profile)
      const active_profile = selected_credential_profile()
      if (
        generation !== credential_request_generation
        || !active_profile
        || !same_hpc_credential_identity(active_profile, saved_profile)
      ) return
      password = ``
      remember_password = false
      credential_hint = t('structure.password_forgotten')
      credential_hint_error = false
    } catch {
      const active_profile = selected_credential_profile()
      if (
        generation !== credential_request_generation
        || !active_profile
        || !same_hpc_credential_identity(active_profile, saved_profile)
      ) return
      credential_hint = t('structure.password_delete_failed')
      credential_hint_error = true
    }
  }

  function saved_password_profile_exists(
    target: HpcCredentialProfile,
    candidates: HPCProfile[],
  ): boolean {
    return candidates.some((candidate) =>
      password_auth_selected(candidate.auth_method)
      && same_hpc_credential_identity(candidate, target))
  }

  async function persist_verified_password(
    profile: HpcCredentialProfile,
    secret: string,
    expected_revision: number,
    expected_generation: number,
  ) {
    let stored = false
    try {
      const before = await loadProfiles()
      if (current_credential_write_generation(profile) !== expected_generation) return
      if (!saved_password_profile_exists(profile, before)) {
        credential_hint = t('structure.password_save_cancelled_profile_changed')
        credential_hint_error = true
        return
      }
      const accepted = await store_hpc_profile_password(profile, secret, expected_revision)
      if (!accepted) {
        credential_hint = t('structure.password_save_cancelled_profile_changed')
        credential_hint_error = true
        return
      }
      stored = true
      const after = await loadProfiles()
      if (current_credential_write_generation(profile) !== expected_generation) return
      if (!saved_password_profile_exists(profile, after)) {
        await delete_hpc_profile_password(profile)
        stored = false
        credential_hint = t('structure.password_save_cancelled_profile_changed')
        credential_hint_error = true
        return
      }
      credential_hint = t('structure.password_saved_system')
      credential_hint_error = false
    } catch {
      if (stored) {
        try {
          await delete_hpc_profile_password(profile)
        } catch {
          // Preserve the original failure; the UI exposes a manual forget action.
        }
      }
      if (current_credential_write_generation(profile) === expected_generation) {
        credential_hint = t('structure.password_save_failed')
        credential_hint_error = true
      }
    }
  }

  function apply_profile(name: string) {
    const p = profiles.find((pr) => pr.name === name)
    if (!p) return
    invalidate_credential_request()
    password = ``
    jump_password = ``
    proxy_password = ``
    remember_password = false
    credential_hint = ``
    credential_hint_error = false
    host = p.host
    port = p.port
    username = p.username
    auth_method = p.auth_method
    key_file = p.key_file ?? ``
    key_content = ``
    key_selected_name = ``
    scheduler = p.scheduler
    ssh_alias = p.ssh_alias ?? ``
    work_root = p.work_root ?? ``
    if (p.jump_host) {
      use_jump = true
      jump_host = p.jump_host
      jump_port = p.jump_port ?? 22
      jump_username = p.jump_username ?? ``
    } else {
      use_jump = false
    }
    if (p.proxy_host) {
      use_proxy = true
      proxy_host = p.proxy_host
      proxy_port = p.proxy_port ?? 1080
      proxy_username = p.proxy_username ?? ``
    } else {
      use_proxy = false
    }
    profile_name = p.name
    if (credential_store_available && password_auth_selected(p.auth_method)) {
      credential_hint = t('structure.saved_password_connect_hint')
    }
  }

  async function save_current_profile() {
    if (!profile_name.trim()) return
    const profile = build_profile(profile_name.trim())
    const previous = profiles.find((saved) => saved.name === profile.name)
    let credential_cleanup_failed = false
    try {
      await saveProfile(profile)
      if (
        credential_store_available
        && previous
        && password_auth_selected(previous.auth_method)
        && (!password_auth_selected(profile.auth_method)
          || !same_hpc_credential_identity(previous, profile))
      ) {
        invalidate_local_credential_writes(previous)
        try {
          await delete_hpc_profile_password(previous)
        } catch {
          credential_cleanup_failed = true
          credential_hint = t('structure.password_delete_failed')
          credential_hint_error = true
        }
      }
      await load_saved_profiles()
      selected_profile = profile.name
      profile_name = profile.name
      if (
        credential_store_available
        && password_auth_selected(profile.auth_method)
        && !credential_cleanup_failed
      ) {
        credential_hint = remember_password && password
          ? t('structure.password_save_after_connect')
          : t('structure.saved_password_connect_hint')
        credential_hint_error = false
      }
    } catch (err) {
      credential_hint = t('structure.profile_save_failed')
      credential_hint_error = true
      console.error(`Failed to save profile:`, err)
    }
  }

  async function delete_current_profile() {
    if (!selected_profile) return
    const profile_name_to_delete = selected_profile
    const profile = profiles.find((saved) => saved.name === profile_name_to_delete)
    if (profile && password_auth_selected(profile.auth_method)) {
      invalidate_local_credential_writes(profile)
    }
    try {
      await deleteProfile(profile_name_to_delete)
      let credential_cleanup_failed = false
      if (credential_store_available && profile && password_auth_selected(profile.auth_method)) {
        try {
          await delete_hpc_profile_password(profile)
        } catch {
          credential_cleanup_failed = true
        }
      }
      if (selected_profile === profile_name_to_delete) {
        invalidate_credential_request()
        selected_profile = ``
        password = ``
        remember_password = false
        credential_hint = credential_cleanup_failed
          ? t('structure.password_delete_failed')
          : ``
        credential_hint_error = credential_cleanup_failed
      }
      await load_saved_profiles()
    } catch (err) {
      if (selected_profile === profile_name_to_delete) {
        credential_hint = t('structure.profile_delete_failed')
        credential_hint_error = true
      }
      console.error(`Failed to delete profile:`, err)
    }
  }

  // ─── Connect ───
  async function do_connect() {
    if (auth_method === `ssh_config`) {
      void do_connect_ssh_config()
      return
    }
    // Trim whitespace from hostnames to prevent DNS issues
    host = host.trim()
    username = username.trim()
    if (use_jump && jump_host) jump_host = jump_host.trim()
    if (use_proxy && proxy_host) proxy_host = proxy_host.trim()

    if (!host || !username) return
    const needs_pw = password_auth_selected()
    const resolved_password = needs_pw
      ? await resolve_connection_password()
      : { password: ``, saved_profile: null, loaded_from_keyring: false }
    if (needs_pw && !resolved_password) return
    const connection_password = resolved_password?.password || ``
    const password_to_store = password
    const credential_profile = resolved_password?.saved_profile ?? selected_credential_profile()
    const should_store_password = Boolean(
      password_to_store
      && remember_password
      && credential_profile
      && !resolved_password?.loaded_from_keyring,
    )
    const connection_host = host
    const connection_username = username
    const connection_scheduler = scheduler
    const connection_work_root = work_root.trim()
    const config: HPCConnectionConfig = {
      host: connection_host,
      port,
      username: connection_username,
      password: connection_password || undefined,
      auth_method,
      key_file: key_file || undefined,
      key_content: key_content || undefined,
      scheduler: connection_scheduler,
      jump_host: use_jump ? jump_host : undefined,
      jump_port: use_jump ? jump_port : undefined,
      jump_username: use_jump ? (jump_username || undefined) : undefined,
      jump_password: use_jump && !jump_use_key && jump_password ? jump_password : undefined,
      proxy_host: use_proxy ? proxy_host : undefined,
      proxy_port: use_proxy ? proxy_port : undefined,
      proxy_username: use_proxy && proxy_username ? proxy_username : undefined,
      proxy_password: use_proxy && proxy_password ? proxy_password : undefined,
      work_root: connection_work_root || undefined,
    }
    const credential_write_generation = credential_profile
      ? current_credential_write_generation(credential_profile)
      : 0
    let credential_write_revision: number | null = null
    let credential_write_prepare_failed = false
    if (should_store_password && credential_profile) {
      try {
        credential_write_revision = await prepare_hpc_profile_password_write(credential_profile)
        if (current_credential_write_generation(credential_profile) !== credential_write_generation) {
          await cancel_hpc_profile_password_write(credential_profile, credential_write_revision)
          credential_write_revision = null
        }
      } catch {
        credential_write_prepare_failed = true
        credential_write_revision = null
      }
    }

    conn_status = `connecting`
    conn_error = ``

    console.log(
      `[CatGo:HPC] Initiating connection to ${connection_host}:${config.port}`,
      `auth=${config.auth_method}`,
      config.proxy_host ? `proxy=${config.proxy_host}:${config.proxy_port}` : `proxy=none`,
      config.jump_host ? `jump=${config.jump_host}` : `jump=none`,
    )

    ws_conn = connectHPC(config, {
      onConnected: (session_id, info) => {
        const store_is_still_authorized = Boolean(
          should_store_password
          && credential_profile
          && credential_write_revision !== null
          && current_credential_write_generation(credential_profile) === credential_write_generation,
        )
        connected_session_id = session_id
        connected_host = connection_host
        connected_username = connection_username
        conn_status = `connected`
        conn_error = ``
        password = ``
        invalidate_credential_request()
        if (resolved_password?.loaded_from_keyring) {
          credential_hint = t('structure.saved_password_loaded')
          credential_hint_error = false
        }
        if (store_is_still_authorized && credential_profile) {
          credential_hint = t('structure.password_saving_system')
          credential_hint_error = false
          void persist_verified_password(
            credential_profile,
            password_to_store,
            credential_write_revision!,
            credential_write_generation,
          )
        } else if (
          credential_write_prepare_failed
          && credential_profile
          && current_credential_write_generation(credential_profile) === credential_write_generation
        ) {
          credential_hint = t('structure.password_save_failed')
          credential_hint_error = true
        }
        console.log(`[CatGo:HPC] Connected to ${connection_username}@${connection_host} (session=${session_id})`)
        add_session({
          session_id,
          host: connection_host,
          username: connection_username,
          scheduler: connection_scheduler,
          work_root: info?.work_root || connection_work_root || undefined,
        })
      },
      onOTPRequired: (prompt) => {
        conn_status = `otp_required`
        otp_prompt = prompt || t('common.verification_code')
        otp_code = ``
      },
      onError: (message) => {
        conn_status = `error`
        conn_error = message
        console.error(`[CatGo:HPC] Connection error: ${message}`)
      },
      onDisconnected: () => {
        if (conn_status === `connected`) {
          console.log(`[CatGo:HPC] Disconnected from ${connected_host} (session=${connected_session_id})`)
          conn_status = `idle`
          if (connected_session_id) remove_session(connected_session_id)
          connected_session_id = ``
        }
      },
    })
  }

  async function do_connect_ssh_config() {
    if (!ssh_alias) return
    conn_status = `connecting`
    conn_error = ``
    console.log(`[CatGo:HPC] SSH config connect: alias=${ssh_alias}`, use_proxy ? `proxy=${proxy_host}:${proxy_port}` : `proxy=none`)
    try {
      const result = await connectSSHConfig({
        host: ssh_alias,
        port: 22,
        username: ``,
        auth_method: `ssh_config`,
        ssh_alias,
        scheduler,
        proxy_host: use_proxy ? proxy_host : undefined,
        proxy_port: use_proxy ? proxy_port : undefined,
        proxy_username: use_proxy && proxy_username ? proxy_username : undefined,
        proxy_password: use_proxy && proxy_password ? proxy_password : undefined,
        work_root: work_root.trim() || undefined,
      })
      connected_session_id = result.session_id
      connected_host = result.host
      connected_username = result.username
      conn_status = `connected`
      add_session({
        session_id: result.session_id,
        host: result.host,
        username: result.username,
        scheduler,
        work_root: result.work_root || work_root.trim() || undefined,
      })
    } catch (err: any) {
      conn_status = `error`
      conn_error = err?.message || String(err)
    }
  }

  function submit_otp() {
    if (!otp_code) return
    ws_conn?.submit_otp(otp_code)
    otp_code = ``
    conn_status = `connecting`
  }

  async function do_disconnect(session_id: string) {
    if (!session_id) return
    remove_session(session_id)
    try {
      await disconnectSession(session_id)
    } catch { /* already closed */ }
  }

  async function choose_key_file() {
    const selected = await pick_hpc_key_file()
    if (!selected) return
    key_selected_name = selected.name
    if (selected.path) {
      key_file = selected.path
      key_content = ``
    } else if (selected.content) {
      key_file = selected.name
      key_content = selected.content
    }
  }

  function close() {
    show = false
  }

  function reset_form() {
    invalidate_credential_request(true)
    conn_status = `idle`
    conn_error = ``
    otp_code = ``
    connected_session_id = ``
    ws_conn = null
    password = ``
    remember_password = false
  }

  // ─── Derived ───
  const can_connect = $derived(
    auth_method === `ssh_config`
      ? !!ssh_alias
      : (!!host && !!username && (
        auth_method === `key`
        || auth_method === `key_otp`
        || !!password
        || !!selected_credential_profile()
      ))
  )

  // ─── Backdrop handlers ───
  let mousedown_on_backdrop = false
  function handle_backdrop_down(e: MouseEvent) {
    mousedown_on_backdrop = e.target === e.currentTarget
  }
  function handle_backdrop_up(e: MouseEvent) {
    if (mousedown_on_backdrop && e.target === e.currentTarget) close()
    mousedown_on_backdrop = false
  }
  function handle_keydown(e: KeyboardEvent) {
    if (e.key === `Escape`) close()
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog-backdrop"
    onmousedown={handle_backdrop_down}
    onmouseup={handle_backdrop_up}
    onkeydown={handle_keydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="dialog-modal connect-modal">
      <div class="modal-header">
        <div class="header-copy">
          <h2 class="modal-title">{t('structure.connect_to_server')}</h2>
          <p class="modal-subtitle">{t('structure.connect_to_server_desc')}</p>
        </div>
        <button class="close-btn" onclick={close} aria-label={t('common.close')}>✕</button>
      </div>

      <div class="modal-body">
        <!-- Connected Sessions List -->
        {#if hpc_session_store.sessions.length > 0}
          <section class="conn-section conn-card conn-card-compact">
            <div class="section-heading">
              <h4 class="section-label">{t('structure.active_connections')}</h4>
              <span class="section-meta">{t('structure.active_count', { n: hpc_session_store.sessions.length })}</span>
            </div>
            <div class="session-list">
              {#each hpc_session_store.sessions as s}
                <div class="session-item">
                  <span class="session-dot connected"></span>
                  <div class="session-copy">
                    <span class="session-info">{s.username}@{s.host}</span>
                    <span class="session-sched">{s.scheduler}</span>
                  </div>
                  <button
                    class="session-disconnect"
                    onclick={() => do_disconnect(s.session_id)}
                    title={t('common.disconnect')}
                  >{t('common.disconnect')}</button>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Status Messages -->
        {#if conn_status === `connecting`}
          <section class="conn-section status-section status-connecting">
            <div class="status-eyebrow">{t('structure.connection_status')}</div>
            <div class="status-msg connecting">{t('structure.connecting_to_server')}</div>
            <p class="status-description">{t('structure.keep_dialog_open_connecting')}</p>
          </section>
        {:else if conn_status === `otp_required`}
          <section class="conn-section status-section status-otp">
            <div class="status-eyebrow">{t('structure.verification_required')}</div>
            <h4 class="section-label no-divider">{t('structure.two_factor_auth')}</h4>
            <p class="status-description">{otp_prompt}</p>
            <div class="otp-row">
              <input
                type="text"
                bind:value={otp_code}
                placeholder={t('structure.enter_code')}
                maxlength="8"
                class="otp-input"
                onkeydown={(e) => e.key === `Enter` && submit_otp()}
              />
              <button class="btn-primary" onclick={submit_otp} disabled={!otp_code}>{t('common.submit')}</button>
            </div>
          </section>
        {:else if conn_status === `connected`}
          <section class="conn-section status-section status-success">
            <div class="status-eyebrow">{t('structure.connection_status')}</div>
            <div class="status-msg success">{t('structure.connected_to_user_host', { user: connected_username, host: connected_host })}</div>
            <p class="status-description">{t('structure.connected_dialog_desc')}</p>
            {#if credential_hint}
              <p class:error={credential_hint_error} class="credential-status">{credential_hint}</p>
            {/if}
            <button class="btn-new" onclick={reset_form}>{t('structure.connect_another')}</button>
          </section>
        {:else if conn_status === `error`}
          <section class="conn-section status-section status-error">
            <div class="status-eyebrow">{t('structure.connection_failed')}</div>
            <div class="status-msg error-msg">{conn_error}</div>
            <p class="status-description">{t('structure.check_connection_details')}</p>
            <button class="btn-new" onclick={reset_form}>{t('common.try_again')}</button>
          </section>
        {/if}

        <!-- Connection Form (shown when idle) -->
        {#if conn_status === `idle`}
          <!-- Profiles -->
          {#if profiles.length > 0}
            <section class="conn-section conn-card conn-card-compact">
              <div class="section-heading">
                <h4 class="section-label">{t('structure.saved_profiles')}</h4>
                <span class="section-meta">{t('structure.saved_count', { n: profiles.length })}</span>
              </div>
              <div class="profile-row">
                <select
                  bind:value={selected_profile}
                  onchange={(event) => {
                    selected_profile = event.currentTarget.value
                    apply_profile(selected_profile)
                  }}
                >
                  <option value="">{t('structure.select_profile_placeholder')}</option>
                  {#each profiles as p}
                    <option value={p.name}>{p.name}</option>
                  {/each}
                </select>
                {#if selected_profile}
                  <button class="icon-btn danger" onclick={delete_current_profile} title={t('structure.delete_profile')}>✕</button>
                {/if}
              </div>
            </section>
          {/if}

          <!-- New Connection -->
          <section class="conn-section conn-card">
            <div class="section-heading">
              <h4 class="section-label">{t('structure.new_connection')}</h4>
              <span class="section-meta">{t('structure.secure_shell_setup')}</span>
            </div>
            <div class="form-grid">
              <label>
                {t('structure.auth')}
                <select bind:value={auth_method}>
                  <option value="password">{t('structure.password')}</option>
                  <option value="password_otp">{t('structure.password_otp')}</option>
                  <option value="key">{t('structure.ssh_key')}</option>
                  <option value="key_otp">{t('structure.ssh_key_otp')}</option>
                  <option value="ssh_config">{t('structure.ssh_config')}</option>
                </select>
              </label>
              {#if auth_method === `ssh_config`}
                <label class="full-span">
                  {t('structure.ssh_alias')} <span class="hint">{t('structure.ssh_alias_hint')}</span>
                  <input type="text" bind:value={ssh_alias} placeholder={t('structure.ssh_alias_placeholder')} />
                </label>
              {:else}
                <label>
                  {t('structure.host')}
                  <input type="text" bind:value={host} placeholder="hpc.example.com" />
                </label>
                <label>
                  {t('structure.port')}
                  <input type="number" bind:value={port} min={1} max={65535} />
                </label>
                <label>
                  {t('structure.username')}
                  <input type="text" bind:value={username} placeholder="user" />
                </label>
                {#if auth_method === `password` || auth_method === `password_otp`}
                  <label class="full-span">
                    {t('structure.password')}
                    <input type="password" bind:value={password} oninput={handle_password_input} placeholder="••••••" />
                  </label>
                  {#if credential_store_available}
                    <div class="credential-controls full-span">
                      <label class="checkbox-row">
                        <input
                          type="checkbox"
                          checked={remember_password}
                          onchange={handle_remember_password_change}
                          disabled={!selected_credential_profile()}
                        />
                        <span class="toggle-copy">
                          <span class="toggle-title">{t('structure.remember_password_system')}</span>
                          <span class="toggle-description">
                            {selected_credential_profile()
                              ? t('structure.password_store_system_hint')
                              : t('structure.password_store_requires_saved_profile')}
                          </span>
                        </span>
                      </label>
                      {#if selected_credential_profile()}
                        <button type="button" class="btn-secondary credential-forget" onclick={forget_saved_password}>
                          {t('structure.forget_saved_password')}
                        </button>
                      {/if}
                    </div>
                    {#if credential_hint}
                      <p class:error={credential_hint_error} class="form-hint full-span credential-hint">{credential_hint}</p>
                    {/if}
                  {/if}
                {/if}
                <label class="full-span">
                  {t('structure.key_file')} <span class="hint">{t('common.optional')}</span>
                  <div class="key-file-row">
                    <input type="text" bind:value={key_file} placeholder={t('structure.key_file_placeholder')} oninput={() => { key_content = ``; key_selected_name = `` }} />
                    <button type="button" class="btn-secondary key-file-btn" onclick={choose_key_file}>{t('common.choose')}</button>
                  </div>
                  {#if key_content && key_selected_name}
                    <span class="hint">{t('structure.key_file_imported', { name: key_selected_name })}</span>
                  {/if}
                </label>
              {/if}
              <label>
                {t('structure.scheduler')}
                <select bind:value={scheduler}>
                  <option value="slurm">SLURM</option>
                  <option value="pbs">PBS/Torque</option>
                </select>
              </label>
              <label class="full-span">
                {t('structure.work_root')} <span class="hint">{t('common.optional')}</span>
                <input type="text" bind:value={work_root} placeholder={t('structure.work_root_placeholder')} />
              </label>
              <p class="form-hint full-span">{t('structure.work_root_hint')}</p>
            </div>

            <!-- Jump Host -->
            <label class="checkbox-row toggle-row">
              <input type="checkbox" bind:checked={use_jump} />
              <span class="toggle-copy">
                <span class="toggle-title">{t('structure.use_jump_host')}</span>
                <span class="toggle-description">{t('structure.jump_host_desc')}</span>
              </span>
            </label>

            {#if use_jump}
              <div class="form-grid option-card jump-fields">
                <label>
                  {t('structure.jump_host')}
                  <input type="text" bind:value={jump_host} placeholder="bastion.example.com" />
                </label>
                <label>
                  {t('structure.port')}
                  <input type="number" bind:value={jump_port} min={1} max={65535} />
                </label>
                <label class="full-span">
                  {t('structure.jump_username')}
                  <input type="text" bind:value={jump_username} placeholder={t('structure.same_as_above')} />
                </label>
                <label>
                  {t('structure.jump_auth')}
                  <select bind:value={jump_use_key} onchange={() => { if (jump_use_key) jump_password = `` }}>
                    <option value={true}>{t('structure.ssh_key')}</option>
                    <option value={false}>{t('structure.password')}</option>
                  </select>
                </label>
                {#if !jump_use_key}
                  <label>
                    {t('structure.jump_password')}
                    <input type="password" bind:value={jump_password} placeholder="••••••" />
                  </label>
                {/if}
              </div>
            {/if}

            <!-- Network Settings (SOCKS5 proxy) -->
            <label class="checkbox-row toggle-row">
              <input type="checkbox" bind:checked={use_proxy} />
              <span class="toggle-copy">
                <span class="toggle-title">{t('structure.use_socks_proxy')}</span>
                <span class="toggle-description">{t('structure.socks_proxy_desc')}</span>
              </span>
            </label>

            {#if use_proxy}
              <div class="form-grid option-card jump-fields">
                <label>
                  {t('structure.proxy_host')}
                  <input type="text" bind:value={proxy_host} placeholder="127.0.0.1" />
                </label>
                <label>
                  {t('structure.port')}
                  <input type="number" bind:value={proxy_port} min={1} max={65535} />
                </label>
                <label>
                  {t('structure.username')} <span class="hint">{t('common.optional')}</span>
                  <input type="text" bind:value={proxy_username} placeholder={t('structure.no_proxy_auth_placeholder')} />
                </label>
                <label>
                  {t('structure.password')} <span class="hint">{t('common.optional')}</span>
                  <input type="password" bind:value={proxy_password} placeholder="••••••" />
                </label>
              </div>
            {/if}

            <!-- Save Profile Row -->
            <div class="profile-save-row">
              <input type="text" bind:value={profile_name} placeholder={t('structure.profile_name')} class="profile-name-input" />
              <button class="btn-secondary" onclick={save_current_profile} disabled={!profile_name.trim() || (!host && auth_method !== `ssh_config`)}>{t('common.save')}</button>
            </div>
          </section>
        {/if}
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn-cancel" onclick={close}>
          {conn_status === `connected` ? t('common.done') : t('common.cancel')}
        </button>
        {#if conn_status === `idle`}
          <button class="btn-primary" onclick={do_connect} disabled={!can_connect}>{t('common.connect')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .connect-modal {
    max-width: 560px;
    width: min(92vw, 560px);
  }

  .header-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .modal-subtitle {
    margin: 0;
    color: var(--text-color-muted, light-dark(#6b7280, #9ca3af));
    font-size: 12px;
    line-height: 1.45;
  }

  .modal-body {
    padding: 18px 20px 20px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 68vh;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--accent-color, #4f46e5) 4%, transparent), transparent 140px),
      transparent;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px 18px;
    border-top: 1px solid var(--dialog-border, light-dark(#d1d5db, #3a3a3a));
    background: color-mix(in srgb, var(--dialog-bg, light-dark(#fff, #1c1d21)) 88%, var(--accent-color, #4f46e5) 12%);
    flex-shrink: 0;
  }

  .conn-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .conn-card {
    padding: 14px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--dialog-border, #404040) 88%, var(--accent-color, #4f46e5) 12%);
    background: color-mix(in srgb, var(--input-bg, rgba(255, 255, 255, 0.05)) 72%, transparent);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
  }

  .conn-card-compact {
    gap: 10px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-label {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-color-muted, light-dark(#6b7280, #9ca3af));
    text-transform: uppercase;
    letter-spacing: 1px;
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--dialog-border, #3a3a3a) 80%, transparent);
    flex: 1;
  }

  .section-label.no-divider {
    padding-bottom: 0;
    border-bottom: none;
  }

  .section-meta {
    flex-shrink: 0;
    padding: 4px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent-color, #4f46e5) 12%, transparent);
    color: var(--accent-color, light-dark(#4338ca, #93c5fd));
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
  }

  /* Session list */
  .session-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--input-bg, rgba(255,255,255,0.05)) 78%, transparent);
    border: 1px solid color-mix(in srgb, var(--dialog-border, #404040) 85%, transparent);
    font-size: 12px;
    transition: border-color 0.15s, background 0.15s, transform 0.15s;
  }

  .session-item:hover {
    border-color: color-mix(in srgb, var(--accent-color, #4f46e5) 35%, var(--dialog-border, #404040));
    background: color-mix(in srgb, var(--accent-color, #4f46e5) 8%, transparent);
    transform: translateY(-1px);
  }

  .session-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .session-dot.connected {
    background: #22c55e;
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.75);
  }

  .session-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .session-info {
    color: var(--text-color, light-dark(#374151, #eee));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
  }

  .session-sched {
    width: fit-content;
    font-size: 10px;
    color: var(--text-color-dim, light-dark(#9ca3af, #94a3b8));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--btn-bg, rgba(255,255,255,0.1)) 85%, transparent);
  }

  .session-disconnect {
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--dialog-border, #404040) 88%, transparent);
    color: var(--text-color-muted, light-dark(#6b7280, #9ca3af));
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 10px;
    border-radius: 999px;
    line-height: 1;
    transition: all 0.15s;
  }

  .session-disconnect:hover {
    color: var(--error-color, light-dark(#dc2626, #ef4444));
    border-color: color-mix(in srgb, var(--error-color, #ef4444) 60%, transparent);
    background: light-dark(rgba(220,38,38,0.08), rgba(248,81,73,0.12));
  }

  /* Status messages */
  .status-section {
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--dialog-border, light-dark(#d1d5db, #404040));
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
  }

  .status-connecting {
    background: light-dark(rgba(79, 70, 229, 0.04), rgba(59, 130, 246, 0.08));
    border-color: color-mix(in srgb, var(--accent-color, #4f46e5) 40%, var(--dialog-border, #404040));
  }

  .status-otp {
    background: light-dark(rgba(217, 119, 6, 0.05), rgba(245, 158, 11, 0.08));
    border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 40%, var(--dialog-border, #404040));
  }

  .status-success {
    background: light-dark(rgba(5, 150, 105, 0.06), rgba(16, 185, 129, 0.08));
    border-color: color-mix(in srgb, var(--success-color, #10b981) 40%, var(--dialog-border, #404040));
  }

  .status-error {
    background: light-dark(rgba(220, 38, 38, 0.05), rgba(239, 68, 68, 0.08));
    border-color: color-mix(in srgb, var(--error-color, #ef4444) 45%, var(--dialog-border, #404040));
  }

  .status-eyebrow {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-color-muted, light-dark(#6b7280, #94a3b8));
  }

  .status-msg {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.45;
  }

  .status-msg.connecting {
    color: var(--text-color, light-dark(#374151, #e5e7eb));
  }

  .status-msg.success {
    color: var(--success-color, light-dark(#059669, #34d399));
  }

  .status-description {
    margin: 0;
    font-size: 12px;
    color: var(--text-color-muted, light-dark(#6b7280, #9ca3af));
    line-height: 1.5;
  }

  .otp-row {
    display: flex;
    gap: 10px;
    margin-top: 2px;
    align-items: stretch;
  }

  .otp-input {
    flex: 1;
    font-size: 18px !important;
    letter-spacing: 4px;
    text-align: center;
    font-family: inherit;
    font-weight: 600;
  }

  .btn-new {
    align-self: flex-start;
    margin-top: 2px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--dialog-border, #404040) 88%, transparent);
    border-radius: 999px;
    color: var(--text-color, light-dark(#374151, #eee));
    cursor: pointer;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    transition: all 0.15s;
  }

  .btn-new:hover {
    color: var(--text-color, light-dark(#374151, #fff));
    border-color: var(--accent-color, light-dark(#4f46e5, #3b82f6));
    background: color-mix(in srgb, var(--accent-color, #4f46e5) 10%, transparent);
  }

  /* Profile row */
  .profile-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .profile-row select {
    flex: 1;
  }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--dialog-border, light-dark(#d1d5db, #404040));
    border-radius: 8px;
    cursor: pointer;
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1;
    color: var(--text-color-dim, light-dark(#9ca3af, #94a3b8));
    transition: all 0.15s;
  }

  .icon-btn:hover {
    background: var(--surface-bg-hover, light-dark(#e5e7eb, #3a3a3a));
    color: var(--text-color, light-dark(#374151, #eee));
  }

  .icon-btn.danger:hover {
    color: var(--error-color, light-dark(#dc2626, #ef4444));
    border-color: color-mix(in srgb, var(--error-color, #ef4444) 70%, transparent);
    background: light-dark(rgba(220,38,38,0.08), rgba(248,81,73,0.12));
  }

  /* Form grid */
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-grid label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
  }

  .form-grid .full-span {
    grid-column: 1 / -1;
  }

  .hint {
    font-weight: 400;
    color: var(--text-color-dim, light-dark(#9ca3af, #94a3b8));
  }

  .key-file-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .key-file-row input {
    flex: 1;
    min-width: 0;
  }

  .key-file-btn {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .form-hint {
    margin: -6px 0 0;
    color: var(--text-color-muted, light-dark(#6b7280, #9ca3af));
    font-size: 11px;
    line-height: 1.4;
  }

  .credential-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--dialog-border, #404040) 85%, transparent);
    background: color-mix(in srgb, var(--input-bg, rgba(255,255,255,0.05)) 55%, transparent);
  }

  .credential-controls .checkbox-row {
    flex: 1;
    min-width: 0;
  }

  .credential-controls .checkbox-row:has(input:disabled) {
    cursor: default;
    opacity: 0.72;
  }

  .credential-controls input:disabled {
    cursor: default;
  }

  .credential-forget {
    flex: 0 0 auto;
    padding: 5px 8px;
    font-size: 11px;
  }

  .credential-hint.error {
    color: var(--error-color, #ef4444);
  }

  .credential-status {
    margin: 2px 0 4px;
    padding: 7px 9px;
    border-radius: 7px;
    color: var(--success-color, #22c55e);
    background: color-mix(in srgb, currentColor 10%, transparent);
    font-size: 11px;
    line-height: 1.4;
  }

  .credential-status.error {
    color: var(--error-color, #ef4444);
  }

  .option-card {
    margin-top: 2px;
    padding: 12px;
    border-radius: 10px;
    background: light-dark(rgba(0,0,0,0.02), rgba(255,255,255,0.025));
    border: 1px dashed color-mix(in srgb, var(--dialog-border, #404040) 82%, var(--accent-color, #4f46e5) 18%);
  }

  .jump-fields {
    margin-top: 0;
  }

  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-color, light-dark(#374151, #eee));
  }

  .checkbox-row input[type="checkbox"] {
    width: 15px;
    height: 15px;
    accent-color: var(--accent-color, light-dark(#4f46e5, #3b82f6));
    cursor: pointer;
    margin-top: 2px;
  }

  .toggle-row {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--dialog-border, #404040) 85%, transparent);
    background: color-mix(in srgb, var(--input-bg, rgba(255,255,255,0.05)) 70%, transparent);
  }

  .toggle-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .toggle-title {
    font-weight: 600;
    color: var(--text-color, light-dark(#1f2937, #f3f4f6));
  }

  .toggle-description {
    color: var(--text-color-muted, light-dark(#6b7280, #9ca3af));
    line-height: 1.45;
  }

  .profile-save-row {
    display: flex;
    gap: 8px;
    margin-top: 2px;
    padding-top: 6px;
  }

  .profile-name-input {
    flex: 1;
    font-size: 12px !important;
  }

  .btn-secondary {
    background: var(--btn-bg, light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.1)));
    border: 1px solid var(--dialog-border, light-dark(#d1d5db, #404040));
    border-radius: 8px;
    color: var(--text-color, light-dark(#374151, #eee));
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 14px;
    font-family: inherit;
    transition: all 0.15s;
  }

  .btn-secondary:hover {
    background: var(--btn-bg-hover, light-dark(rgba(0,0,0,0.12), rgba(255,255,255,0.2)));
    border-color: color-mix(in srgb, var(--accent-color, #4f46e5) 35%, var(--dialog-border, #404040));
  }

  .btn-secondary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-primary {
    padding: 10px 18px;
    border-radius: 8px;
    box-shadow: 0 10px 22px color-mix(in srgb, var(--accent-color, #4f46e5) 22%, transparent);
  }

  .btn-cancel {
    border-radius: 8px;
    padding: 10px 18px;
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .connect-modal {
      width: calc(100vw - 20px);
      max-width: none;
    }

    .modal-body {
      padding: 16px;
      max-height: 72vh;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .otp-row,
    .profile-save-row,
    .profile-row,
    .section-heading {
      flex-direction: column;
      align-items: stretch;
    }

    .section-label {
      flex: unset;
    }

    .session-item {
      align-items: flex-start;
    }

    .session-disconnect,
    .btn-new,
    .btn-secondary,
    .btn-cancel,
    .btn-primary {
      width: 100%;
      justify-content: center;
    }

    .modal-footer {
      flex-direction: column-reverse;
    }
  }
</style>
