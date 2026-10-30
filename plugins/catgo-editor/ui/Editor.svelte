<script lang="ts">
  import { onMount, tick as flush } from 'svelte'
  import Structure from '$lib/structure/Structure.svelte'
  import type { AnyStructure } from '$lib/structure'
  import { EditorDocument, fileFormat, serializeDocument, type FileRef, type ResourceValue, type Format } from './document'
  import { createHost } from './host'

  const documentState = new EditorDocument()
  let tick = $state(0)
  let structure = $state<AnyStructure>()
  let selected = $state<number[]>([])
  let status = $state('Connecting to Codex…')
  let error = $state('')
  let coordinatesOpen = $state(false)
  let fileActionsOpen = $state(false)
  let exportFormat = $state<Format>('poscar')
  let exportName = $state('')
  let exportNotice = $state('')
  let exporting = $state(false)
  let coordinateAtomId = $state<number>()
  let coordinates = $state<(string | number)[]>(['0', '0', '0'])
  type OpenRequest = {kind:'host';file:FileRef;value?:ResourceValue} | {kind:'import';file:FileRef;value:ResourceValue}
  let pendingOpen = $state<OpenRequest>()
  let openedKind = $state<'host'|'import'>('host')
  let draggingFile = $state(false)
  let readingFile = $state(false)
  let filePicker: HTMLInputElement
  let importTicket = 0
  let importedCount = 0
  let renderError = $state('')
  let initializationError = $state('')
  let viewerCheckTimer: ReturnType<typeof setTimeout> | undefined
  let viewerElement: HTMLElement
  let generation = 0
  let pendingLoad: FileRef | undefined
  let resourceCheck = 0
  let deferredResourceUpdate = false
  let disposed = false
  let subscribedUri: string | undefined
  let subscriptionTask = Promise.resolve()
  const state = $derived.by(() => { tick; return {dirty: documentState.dirty, canUndo: documentState.canUndo, canRedo: documentState.canRedo, canSave: documentState.canSave, file: documentState.file, conflict: documentState.conflict, externalChange: documentState.externalChange, writable: documentState.writable} })
  const host = createHost(file => {
    importTicket++; readingFile = false
    requestOpen({kind:'host',file})
  }, uri => {
    if (openedKind !== 'host' || uri !== documentState.file?.resourceUri) return
    void reconcileHostResource()
  })

  function sync() { structure = structuredClone(documentState.structure); tick++ }
  function requestOpen(request: OpenRequest) {
    if (request.kind === 'host' && openedKind === 'host' &&
        request.file.resourceUri === documentState.file?.resourceUri &&
        request.file.name === documentState.file.name) {
      pendingOpen = undefined
      if (pendingLoad && (pendingLoad.resourceUri !== request.file.resourceUri || pendingLoad.name !== request.file.name)) {
        // A → pending B → A keeps A and invalidates the slower B read.
        generation++; resourceCheck++; pendingLoad = undefined
        updateStatus()
      }
      void reconcileHostResource()
      return
    }
    if (state.dirty) { pendingOpen = request; return }
    pendingOpen = undefined
    void load(request)
  }
  function cleanStatus() {
    if (openedKind === 'import') return 'Imported copy · Export to save'
    return documentState.writable && documentState.etag ? 'Saved' : 'Read only · export available'
  }
  function updateStatus() { status = documentState.dirty ? 'Unsaved changes' : cleanStatus() }
  function syncSubscription() {
    const task = subscriptionTask.catch(() => {}).then(async () => {
      // Subscription acknowledgements can outlive a file-open request. Always
      // converge on the document actually retained, including after disposal.
      while (true) {
        const desired = !disposed && openedKind === 'host' ? documentState.file?.resourceUri : undefined
        if (subscribedUri === desired) return
        if (subscribedUri) {
          await host.unsubscribe(subscribedUri)
          subscribedUri = undefined
        } else if (desired) {
          await host.subscribe(desired)
          subscribedUri = desired
        }
      }
    })
    subscriptionTask = task
    return task
  }
  async function reconcileHostResource() {
    const file = documentState.file
    if (openedKind !== 'host' || !file) return
    if (documentState.saving) { deferredResourceUpdate = true; return }
    const request = generation, ticket = ++resourceCheck, version = documentState.etag
    try {
      const value = await host.bridge.read(file.resourceUri)
      if (request !== generation || ticket !== resourceCheck || documentState.file !== file) return
      if (documentState.saving) { deferredResourceUpdate = true; return }
      // A write that completed during this read makes its result stale.
      if (version !== documentState.etag) { void reconcileHostResource(); return }
      const sameVersion = value.etag !== undefined
        ? value.etag === documentState.etag
        : documentState.etag === undefined && value.text === documentState.originalText
      if (sameVersion) {
        documentState.writable = value.writable
        tick++; updateStatus()
        return
      }
      if (documentState.dirty) {
        documentState.externalChange = true
        documentState.writable = value.writable
        tick++
        return
      }
      // Only a different disk version replaces the clean document. Own-save
      // notifications and duplicate file input preserve history and selection.
      await load({kind:'host',file,value})
    } catch (cause) {
      if (request === generation && ticket === resourceCheck) error = String((cause as Error).message ?? cause)
    }
  }
  async function load(open: OpenRequest) {
    const {file} = open
    const request = ++generation
    pendingLoad = file
    resourceCheck++; deferredResourceUpdate = false
    status = `Opening ${file.name}…`; error = ''
    try {
      const value = open.kind === 'import' ? open.value : open.value ?? await host.bridge.read(file.resourceUri)
      if (request !== generation) return
      documentState.load(file, value)
      openedKind = open.kind
      selected = []; coordinatesOpen = false; coordinateAtomId = undefined; fileActionsOpen = false; exportNotice = ''; sync()
      renderError = ''
      initializationError = ''
      await flush()
      if (documentState.file !== file || openedKind !== open.kind) return
      scheduleViewerCheck()
      updateStatus()
      await syncSubscription()
    } catch (cause) { if (request === generation) error = String((cause as Error).message ?? cause) }
    finally { if (request === generation) pendingLoad = undefined }
  }

  async function importFiles(files: File[]) {
    const ticket = ++importTicket
    error = ''; draggingFile = false
    try {
      if (files.length !== 1) throw new Error('Open one structure file at a time.')
      const file = files[0]
      fileFormat(file.name)
      if (file.size > 20 * 1024 * 1024) throw new Error('This file exceeds the 20 MiB import limit.')
      readingFile = true
      const text = await file.text()
      if (ticket !== importTicket) return
      requestOpen({kind:'import',file:{name:file.name,resourceUri:`catgo-import://session/${++importedCount}`},value:{text,writable:false}})
    } catch (cause) { if (ticket === importTicket) error = String((cause as Error).message ?? cause) }
    finally { if (ticket === importTicket) readingFile = false }
  }
  const hasFiles = (event: DragEvent) => !!event.dataTransfer && (Array.from(event.dataTransfer.types).includes('Files') || event.dataTransfer.files.length > 0)
  function dragOver(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault(); event.stopPropagation()
    event.dataTransfer!.dropEffect = 'copy'; draggingFile = true
  }
  function dropFile(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault(); event.stopPropagation(); draggingFile = false
    const files = Array.from(event.dataTransfer!.files)
    if (!files.length) { error = 'The host did not provide the dropped file. Use Open… to choose it.'; return }
    void importFiles(files)
  }

  function viewerVisible() {
    const box = viewerElement?.getBoundingClientRect()
    return !document.hidden && !!box?.width && !!box?.height
  }
  function scheduleViewerCheck() {
    clearTimeout(viewerCheckTimer)
    if (!structure || !viewerVisible()) { initializationError = ''; return }
    const request = generation
    viewerCheckTimer = setTimeout(() => checkViewer(request), 3000)
  }
  function checkViewer(request: number) {
    if (request !== generation || !structure || renderError) return
    if (!viewerVisible()) { initializationError = ''; return }
    const canvas = viewerElement?.querySelector('canvas') as HTMLCanvasElement & {__renderer?: any; __scene?: any; __camera?: any} | null
    const renderer = canvas?.__renderer
    const dimensions = canvas?.getBoundingClientRect()
    const calls = renderer?.info?.render?.calls
    if (!canvas || !renderer || !dimensions?.width || !dimensions?.height || calls === 0) {
      initializationError = `3D view did not initialize. WebGL: ${typeof WebGLRenderingContext}; canvas: ${!!canvas}; renderer: ${!!renderer}; size: ${Math.round(dimensions?.width ?? 0)} × ${Math.round(dimensions?.height ?? 0)}; draw calls: ${calls ?? 'none'}.`
      // A late renderer can recover in this tab; genuine renderer exceptions
      // remain separate and are never cleared by this readiness probe.
      viewerCheckTimer = setTimeout(() => checkViewer(request), 500)
    } else initializationError = ''
  }

  function edit(edited: AnyStructure) {
    try {
      documentState.edit($state.snapshot(edited))
      // Reflect newly assigned identities into the live component without
      // replacing its geometry object or moving the camera.
      structure?.sites.forEach((site,index) => { site.properties = {...site.properties, catgo_editor_id: documentState.structure?.sites[index].properties.catgo_editor_id} })
      tick++; updateStatus()
    }
    catch (cause) { error = (cause as Error).message; sync() }
  }
  function undo() { documentState.undo(); sync(); updateStatus() }
  function redo() { documentState.redo(); sync(); updateStatus() }
  async function save() {
    error = ''; status = 'Saving…'
    try {
      const task = documentState.save(host.bridge); tick++
      const result = await task; tick++
      if (result.outcome === 'conflict') error = 'The file changed outside this editor. Your edits are preserved. Export them or reload the file.'
      if (result.outcome === 'too-large') error = `The host could not save this file: maximum ${result.maxBytes} bytes.`
      status = documentState.dirty ? 'Unsaved changes' : 'Saved'
    } catch (cause) { error = (cause as Error).message; tick++ }
    finally {
      if (deferredResourceUpdate) { deferredResourceUpdate = false; void reconcileHostResource() }
    }
  }
  function openCoordinates() {
    if (!structure?.sites.length) return
    const index = selected[0] ?? 0
    selected = [index]
    coordinateAtomId = structure.sites[index].properties.catgo_editor_id
    coordinates = structure.sites[index].xyz.map(String)
    coordinatesOpen = true
  }
  function move() {
    try {
      if (coordinates.some(value => value === undefined || value === null || !String(value).trim())) throw new Error('Enter all three coordinates.')
      const index = documentState.structure?.sites.findIndex(site => site.properties.catgo_editor_id === coordinateAtomId) ?? -1
      documentState.move(index, coordinates.map(Number) as [number, number, number]); sync(); status = 'Unsaved changes'; error = ''
    } catch (cause) { error = (cause as Error).message }
  }
  async function shareSelection() {
    if (state.file && structure) {
      try { await host.context(state.file, $state.snapshot(structure), $state.snapshot(selected)); status = 'Selection attached to Codex context' }
      catch (cause) { error = (cause as Error).message }
    }
  }
  function defaultExportName(format: Format) {
    const stem = (state.file?.name ?? 'structure').replace(/\.(poscar|vasp|cif|xyz|extxyz)$/i,'')
    return `${stem}-export.${format === 'xyz' ? 'extxyz' : format}`
  }
  function toggleFileActions() {
    if (!fileActionsOpen && state.file) {
      exportFormat = fileFormat(state.file.name)
      exportName = defaultExportName(exportFormat)
    }
    fileActionsOpen = !fileActionsOpen
  }
  async function exportFile(format?: Format, name?: string) {
    if (!structure || !state.file || exporting) return
    const selectedFormat = format ?? fileFormat(state.file.name)
    const filename = name?.trim() ?? defaultExportName(selectedFormat)
    error = ''; exportNotice = ''; exporting = true
    const request = generation
    try {
      if (!filename || /[\\/\x00-\x1f]/.test(filename) || filename === '.' || filename === '..') throw new Error('Enter a file name without a folder path.')
      if (fileFormat(filename) !== selectedFormat) throw new Error('The file extension must match the selected export format.')
      const text = serializeDocument($state.snapshot(structure),selectedFormat)
      await host.exportCopy(filename,text)
      if (request === generation) exportNotice = `Download requested: ${filename}`
    } catch (cause) { if (request === generation) error = `Export failed: ${(cause as Error).message}. Your edits are preserved.` }
    finally { exporting = false }
  }
  onMount(() => {
    viewerElement.addEventListener('catgo-editor-file-actions',toggleFileActions)
    const resize = new ResizeObserver(scheduleViewerCheck)
    resize.observe(viewerElement)
    document.addEventListener('visibilitychange', scheduleViewerCheck)
    void host.connect().then(() => { if (!state.file) status = 'Open a CIF, XYZ or POSCAR file in Codex.' }).catch(cause => { error = cause.message })
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (state.canSave) void save() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLElement && event.target.matches('input,textarea,[contenteditable="true"]'))) {
        event.preventDefault(); event.stopPropagation()
        if (event.shiftKey) redo(); else undo()
      }
    }
    window.addEventListener('keydown', key, true)
    const leave = (event: DragEvent) => { if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) draggingFile = false }
    window.addEventListener('dragenter',dragOver,true)
    window.addEventListener('dragover',dragOver,true)
    window.addEventListener('dragleave',leave,true)
    window.addEventListener('drop',dropFile,true)
    const failure = (event: ErrorEvent) => {
      // A draggable pane can defer a ResizeObserver layout cycle until the next
      // frame. This browser diagnostic does not indicate a failed 3D renderer.
      if (event.message === 'ResizeObserver loop completed with undelivered notifications.' || event.message === 'ResizeObserver loop limit exceeded') return
      renderError = `3D view error: ${event.message}`
    }
    const rejection = (event: PromiseRejectionEvent) => { renderError = `3D view error: ${event.reason?.message ?? String(event.reason)}` }
    window.addEventListener('error', failure)
    window.addEventListener('unhandledrejection', rejection)
    return () => { disposed = true; generation++; importTicket++; clearTimeout(viewerCheckTimer); resize.disconnect(); viewerElement.removeEventListener('catgo-editor-file-actions',toggleFileActions); document.removeEventListener('visibilitychange',scheduleViewerCheck); window.removeEventListener('keydown', key, true); window.removeEventListener('dragenter',dragOver,true); window.removeEventListener('dragover',dragOver,true); window.removeEventListener('dragleave',leave,true); window.removeEventListener('drop',dropFile,true); window.removeEventListener('error',failure); window.removeEventListener('unhandledrejection',rejection); void syncSubscription().catch(() => {}) }
  })
</script>

<div class="editor-shell">
  <header>
    <strong>{state.file?.name ?? 'CatGo Structure Editor'}{state.dirty ? ' •' : ''}</strong>
    <div class="actions">
      <button onclick={() => filePicker.click()} disabled={readingFile} aria-label="Open structure file">{readingFile ? 'Opening…' : 'Open…'}</button>
      <input class="file-picker" aria-label="Choose structure file" bind:this={filePicker} type="file" onchange={() => { const files = Array.from(filePicker.files ?? []); if (files.length) void importFiles(files); filePicker.value = '' }} />
      <button onclick={undo} disabled={!state.canUndo} aria-label="Undo">Undo</button>
      <button onclick={redo} disabled={!state.canRedo} aria-label="Redo">Redo</button>
      <button onclick={openCoordinates} disabled={!structure} aria-label="Edit atom coordinates">Coordinates</button>
      <button onclick={shareSelection} disabled={!structure || selected.length === 0}>Send selection</button>
      <button onclick={() => void exportFile()} disabled={!structure || exporting}>{exporting ? 'Exporting…' : 'Export'}</button>
      <button onclick={save} disabled={!state.canSave}>Save</button>
    </div>
  </header>
  {#if error}<div class="error" role="alert">{error}</div>{/if}
  {#if renderError}<div class="error" role="alert">{renderError}</div>{/if}
  {#if initializationError && !renderError}<div class="error" role="alert">{initializationError}</div>{/if}
  {#if exportNotice}<div class="export-notice" role="status">{exportNotice}</div>{/if}
  {#if state.externalChange}
    <div class="notice">The file changed outside this editor.
      <button onclick={() => { if (state.file) pendingOpen = {kind:'host',file:state.file} }}>Reload…</button>
    </div>
  {/if}
  {#if pendingOpen}
    <div class="notice" role="alertdialog" aria-label="Unsaved changes">
      Keep your unsaved changes or discard them and open {pendingOpen.file.name}?
      <button onclick={() => { pendingOpen = undefined }}>Keep editing</button>
      <button onclick={() => { const open = pendingOpen!; pendingOpen = undefined; void load(open) }}>Discard and open</button>
    </div>
  {/if}
  {#if coordinatesOpen && structure}
    <div class="coordinates">
      <label>Atom <select bind:value={coordinateAtomId} onchange={() => {
        const index = structure!.sites.findIndex(site => site.properties.catgo_editor_id === coordinateAtomId)
        if (index >= 0) { selected = [index]; coordinates = structure!.sites[index].xyz.map(String) }
      }}>
        {#each structure.sites as site, index}<option value={site.properties.catgo_editor_id}>{index + 1} · {site.species[0].element}</option>{/each}
      </select></label>
      {#each ['X', 'Y', 'Z'] as axis, index}<label>{axis} (Å)<input aria-label={`${axis} coordinate`} type="number" step="any" bind:value={coordinates[index]} /></label>{/each}
      <button onclick={move}>Apply coordinates</button>
      <button onclick={() => { coordinatesOpen = false }}>Close</button>
    </div>
  {/if}
  {#if fileActionsOpen && structure}
    <section class="file-actions" role="region" aria-label="Import / Export">
      <div class="file-actions-heading"><strong>Import / Export</strong><button aria-label="Close Import / Export" onclick={() => { fileActionsOpen = false }}>Close</button></div>
      <p>Open one structure file. Unsaved edits are kept until you choose what to do.</p>
      <button onclick={() => filePicker.click()} disabled={readingFile}>Open structure file…</button>
      <div class="export-fields">
        <label>Export format<select aria-label="Export format" bind:value={exportFormat} onchange={() => { exportName = defaultExportName(exportFormat) }}>
          <option value="poscar" disabled={!structure.lattice}>POSCAR</option>
          <option value="xyz">Extended XYZ</option>
          <option value="cif" disabled={!structure.lattice}>CIF</option>
        </select></label>
        <label>File name<input aria-label="Export file name" bind:value={exportName} /></label>
        <button onclick={() => void exportFile(exportFormat,exportName)} disabled={exporting}>Export file</button>
      </div>
      <p>{exportFormat === 'cif' ? 'CIF retains geometry and cell. Use POSCAR or Extended XYZ to retain fixed/free atom constraints.' : 'Exports the current coordinates, cell and fixed/free atom constraints to a separate copy.'}</p>
    </section>
  {/if}
  <main bind:this={viewerElement}>
    {#if structure}
      <svelte:boundary onerror={(cause) => { renderError = `3D view error: ${(cause as Error).message}` }}>
      <Structure bind:structure bind:selected_sites={selected}
        allow_file_drop={false} enable_info_pane={true} enable_measure_mode={true}
        persist_settings={false} register_as_viewer={false} viewer_id="catgo-codex-file"
        align_on_load="none" fullscreen_toggle={false} show_controls={true}
        scene_props={{bonding_strategy: 'atom_radii', bonding_options: {}, bond_scale: 1.15}}
        hidden_toolbar_items={['fullscreen', 'gesture', 'touch', 'workflow', 'server', 'upload_hpc', 'terminal', 'remote_save', 'chat', 'plugin_hub', 'optimization']}
        on_structure_change={edit}
        style="height:100%;width:100%;min-width:0;max-width:none;border-radius:0" />
        {#snippet failed()}<div class="empty">The 3D view could not start. Your structure and coordinate edits are preserved.</div>{/snippet}
      </svelte:boundary>
    {:else}<div class="empty"><h2>CatGo Structure Editor</h2><p>{status}</p><p>Drop a CIF, XYZ or POSCAR here, or use Open…</p></div>{/if}
  </main>
  {#if draggingFile}<div class="drop-target" role="status">Drop one structure file to open it</div>{/if}
  <footer aria-live="polite">{status}{structure ? ` · ${structure.sites.length} atoms` : ''}</footer>
</div>

<style>
  :global(html), :global(body), :global(#app) { height:100%; margin:0; width:100%; overflow:hidden }
  :global(body) { font:13px system-ui,sans-serif; background:var(--color-background-primary,#f6f7f8); color:var(--color-text-primary,#18212d) }
  :global(*) { box-sizing:border-box }
  .editor-shell { height:100%; display:flex; flex-direction:column; min-width:0; position:relative }
  .file-picker { display:none }
  .drop-target { position:absolute; inset:8px; z-index:10000; display:grid; place-items:center; border:2px dashed #3b82f6; border-radius:8px; background:#172554e8; color:#fff; pointer-events:none; font-size:16px }
  header { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid #94a3b833 }
  header strong { overflow:hidden; text-overflow:ellipsis; max-width:100% }
  .actions { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto }
  button { border:1px solid #94a3b84d; border-radius:6px; padding:5px 9px; color:inherit; background:var(--color-background-primary,#fff); cursor:pointer; font:inherit }
  button:hover:enabled { border-color:#64748b } button:disabled { opacity:.4; cursor:default }
  button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid #3b82f6; outline-offset:2px }
  main { flex:1; position:relative; min-height:0; overflow:hidden }
  footer { padding:6px 12px; color:#64748b; border-top:1px solid #94a3b833; font-size:12px }
  .empty { padding:32px; text-align:center }
  .error,.notice { padding:10px 12px; background:#fff0e4; color:#8b3518; overflow-wrap:anywhere }
  .notice button { margin:4px }
  .export-notice { padding:8px 12px; background:#16834b18; overflow-wrap:anywhere }
  .file-actions { padding:10px 12px; border-bottom:1px solid #94a3b833; max-height:40%; overflow:auto }
  .file-actions p { margin:7px 0; font-size:12px }
  .file-actions-heading,.export-fields { display:flex; align-items:end; flex-wrap:wrap; gap:8px }
  .file-actions-heading { align-items:center; justify-content:space-between }
  .export-fields { margin-top:10px }
  .export-fields input { width:240px; max-width:100% }
  .coordinates { display:flex; align-items:end; gap:8px; flex-wrap:wrap; padding:10px 12px; border-bottom:1px solid #94a3b833 }
  label { display:flex; flex-direction:column; gap:4px; font-size:12px }
  input { width:92px } input,select { padding:5px; border:1px solid #94a3b84d; border-radius:4px; background:var(--color-background-primary,#fff); color:inherit }
  :global(.structure) { --struct-width:100%; --struct-height:100%; --struct-min-width:0; --struct-max-width:none; --struct-border-radius:0 }
  :global(.pencil-mode-container) { position:static !important }
  :global(.pencil-mode-selector) { max-width:calc(100% - 8px) }
</style>
