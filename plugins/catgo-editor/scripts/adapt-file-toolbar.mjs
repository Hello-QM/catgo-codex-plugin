// Connect retained file/performance controls at the standalone editor boundary.
function replaceOne(source,before,after,label) {
  if(source.split(before).length!==2)throw new Error(`Review upstream ${label} before building the editor.`)
  return source.replace(before,after)
}

export function adaptStructureToolbarBindings(source) {
  source=replaceOne(source,'  let large_system_mode = $state(false)',
    '  let editor_fast_rendering = $state(false)\n  let large_system_mode = $state(false)','render-resolution state')
  source=replaceOne(source,'    quality: performance_mode === `quality`,',
    '    quality: performance_mode === `quality` && !editor_fast_rendering,','render-resolution policy')
  return replaceOne(source,'      bind:large_system_mode\n      {webgpu_available}',
    '      bind:large_system_mode\n      bind:editor_fast_rendering\n      {webgpu_available}','render-resolution binding')
}

export function adaptFileToolbar(source) {
  source=replaceOne(source,'    large_system_mode = $bindable(false),',
    '    large_system_mode = $bindable(false),\n    editor_fast_rendering = $bindable(false),','render-resolution prop')
  source=replaceOne(source,'    large_system_mode?: boolean',
    '    large_system_mode?: boolean\n    editor_fast_rendering?: boolean','render-resolution type')
  source=replaceOne(source,'        disabled={!webgpu_available}\n        onclick={() => { if (webgpu_available) large_system_mode = !large_system_mode }}',
    '        aria-label={webgpu_available ? "Large-system rendering" : "Faster rendering"}\n        onclick={() => { if (webgpu_available) large_system_mode = !large_system_mode; else editor_fast_rendering = !editor_fast_rendering }}','performance action')
  source=replaceOne(source,'        class:active={large_system_mode}\n        aria-pressed={large_system_mode}',
    '        class:active={webgpu_available ? large_system_mode : editor_fast_rendering}\n        aria-pressed={webgpu_available ? large_system_mode : editor_fast_rendering}','performance state')
  source=replaceOne(source,"{webgpu_available ? t('structure.large_system_mode') : t('structure.large_system_mode_unavailable')}",
    '{webgpu_available ? t(\'structure.large_system_mode\') : "Faster rendering — reduce drawing resolution; click again to restore it"}','performance description')
  source=replaceOne(source,'          onclick={() => { io_pane_open = !io_pane_open }}',
    '          aria-label="Import / Export"\n          onclick={(event) => event.currentTarget.dispatchEvent(new CustomEvent("catgo-editor-file-actions", {bubbles:true}))}','file actions')
  return source
}
