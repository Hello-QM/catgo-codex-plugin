import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { checkSlabAlignment } from './check-slab-alignment.mjs'
import { checkUpstreamUpdates } from './check-upstream-updates.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const slabAlignment = await checkSlabAlignment()
const upstreamFixes = await checkUpstreamUpdates()
const scalarWasm = await readFile(slabAlignment.wasmPath)
delete slabAlignment.wasmPath
const catgoRoot = process.env.CATGO_SOURCE_ROOT || resolve(root, '../../vendor/catgo')
process.env.CATGO_SOURCE_ROOT = catgoRoot
const require = createRequire(resolve(root, 'ui/package.json'))
const { build } = require('esbuild')
const ts = require('typescript')
const compiler = createRequire(resolve(catgoRoot,'package.json'))('svelte/compiler')
async function compileEditorComponent(source, filename) {
  const processed = await compiler.preprocess(source,{script:({content,attributes}) => attributes.lang==='ts' ? {code:ts.transpileModule(content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,verbatimModuleSyntax:true},fileName:filename}).outputText} : undefined},{filename})
  return {contents:compiler.compile(processed.code,{filename,generate:'client',css:'injected',dev:false,discloseVersion:false}).js.code,loader:'js',resolveDir:dirname(filename)}
}
// Use the reference integration's proven Svelte, scalar WASM and worker bundler
// at build time. The emitted editor has no DSH services or checkout dependency.
const { catgoClientOptions, catgoSourceFiles, catgoDependencies, recordInputs } = await import('./catgo-bundler.mjs')
const { adaptBuildNotifications } = await import('./adapt-build-notifications.mjs')
const optionalPanes = new Set(['ChatPane','GestureProvider','GestureOverlay','GestureSettingsPane','AnalysisPane','WorkflowPane','IOPane','ServerPane','JobDetailPane','PluginHubPane','OptimizationPane','HpcUploadDialog','TerminalPanel','MonacoEditorPanel','Trajectory','CubePanel','ReticularPane'])
const editorBoundary = {
  name:'codex-editor-component-boundary',
  setup(builder) {
    builder.onLoad({filter:/[\\/]structure[\\/]Structure\.svelte$/},async args => {
      catgoSourceFiles.add(args.path)
      const original = await readFile(args.path,'utf8')
      const guard = '{#if typeof WebGLRenderingContext !== `undefined`}'
      if (!original.includes(guard)) throw new Error('Review the upstream structure canvas guard before building the Codex editor.')
      // CatGo's test-only constructor check can skip a working canvas when a
      // sandbox omits that global. The real Three.js context creation decides
      // availability, and the editor boundary reports a genuine GPU failure.
      const source = adaptBuildNotifications(original.replace(guard,'{#if typeof window !== `undefined`}'))
      return compileEditorComponent(source,args.path)
    })
    builder.onLoad({filter:/[\\/]structure[\\/]StructureToolbar\.svelte$/},async args => {
      catgoSourceFiles.add(args.path)
      const source = await readFile(args.path,'utf8')
      const action = 'onclick={() => { build_pane_open = !build_pane_open }}'
      if (!source.includes(action)) throw new Error('Review the upstream Build toolbar action before building the editor.')
      return compileEditorComponent(source.replace(action,action+"\n          aria-label={t('structure.build_tools')}"),args.path)
    })
    builder.onLoad({filter:/[\\/]structure[\\/]StructureScene\.svelte$/},async args => {
      catgoSourceFiles.add(args.path)
      const source = await readFile(args.path,'utf8')
      const preview = '          {cutting_show_bonds}\n          {hide_incomplete_bonds}'
      if (source.split(preview).length !== 2) throw new Error('Review the upstream slab-preview bond policy before building the editor.')
      // Keep the cut preview's complete-bond policy local to that preview.
      // Forcing it on the whole viewer disables the ordinary stub controls.
      return compileEditorComponent(source.replace(preview,'          {cutting_show_bonds}\n          hide_incomplete_bonds={true}'),args.path)
    })
    builder.onLoad({filter:/[\\/]structure[\\/]BuildPane\.svelte$/},async args => {
      catgoSourceFiles.add(args.path)
      const source = await readFile(args.path,'utf8')
      const before = "const tab_defs = STATIC_ONLY\n    ? all_tab_defs.filter((tab) => !STATIC_HIDDEN_TABS.has(tab.id))\n    : all_tab_defs"
      if (!source.includes(before)) throw new Error('Review the upstream Build tab list before building the editor.')
      // ReticularPane is omitted from this editor's dependency bundle. Do not
      // advertise an empty tool tab when enabling the supported build tools.
      const after = "const tab_defs = (STATIC_ONLY\n    ? all_tab_defs.filter((tab) => !STATIC_HIDDEN_TABS.has(tab.id))\n    : all_tab_defs).filter((tab) => tab.id !== 'reticular')"
      return compileEditorComponent(source.replace(before,after),args.path)
    })
    builder.onResolve({filter:/^(plotly\.js-dist-min|h5wasm|pdfjs-dist(?:\/.*)?|xlsx)$/},async args => {
      if (args.pluginData?.editorSideEffectsChecked) return undefined
      const result = await builder.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{editorSideEffectsChecked:true}})
      return {...result,sideEffects:false}
    })
    builder.onResolve({filter:/\.svelte$/},args => {
      const name = args.path.split('/').at(-1).replace(/\.svelte$/,'')
      if (optionalPanes.has(name)) return {path:name,namespace:'codex-optional-pane'}
    })
    builder.onLoad({filter:/.*/,namespace:'codex-optional-pane'},args => ({contents:compiler.compile('<script>let props = $props()</script>',{filename:`${args.path}.svelte`,generate:'client',css:'injected',dev:false,discloseVersion:false}).js.code,loader:'js',resolveDir:catgoRoot}))
  },
}
const options = {
  absWorkingDir: root, bundle:true, platform:'browser', target:'es2022', format:'esm',
  conditions:['svelte','browser','import'], minify:true, sourcemap:false,
  loader:Object.fromEntries(['.woff','.woff2','.ttf','.png','.jpg','.jpeg','.gif','.svg'].map(extension => [extension,'dataurl'])),
  plugins:[editorBoundary,...catgoClientOptions.clientPlugins],
  inject:[resolve(root,'ui/session-storage.ts')],
  define:{...catgoClientOptions.clientDefine,...Object.fromEntries(['localStorage','globalThis.localStorage','window.localStorage'].map(key=>[key,'__catgoEditorStorage'])),...Object.fromEntries(['sessionStorage','globalThis.sessionStorage','window.sessionStorage'].map(key=>[key,'__catgoEditorSessionStorage']))},
  logLevel:'error', metafile:true,
}
const result = await build({...options, entryPoints:['ui/main.ts'], outfile:resolve(root,'assets/editor.js'), write:false})
recordInputs(result, root)
const javascript = result.outputFiles.find(file => file.path.endsWith('.js')).text
if (!javascript.includes(scalarWasm.toString('base64'))) throw Error('Editor did not embed the verified scalar slab WASM artifact.')
await writeFile(resolve(root,'preview-build-sizes.json'), JSON.stringify(Object.entries(result.metafile.outputs).flatMap(([output,value]) => Object.entries(value.inputs).map(([input,data]) => ({input,bytes:data.bytesInOutput}))).sort((a,b)=>b.bytes-a.bytes).slice(0,30),null,2))
const css = result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')
const bytes = Buffer.from(javascript)
const compressed = gzipSync(bytes, {level:9})
const sha256 = createHash('sha256').update(bytes).digest('hex')
const manifest = {sha256, compressedBytes:compressed.length, javascriptBytes:bytes.length, chunks:[]}
const directory = resolve(root,'assets/program')
await rm(directory,{recursive:true,force:true})
await mkdir(directory,{recursive:true})
for (let start=0,index=0;start<compressed.length;start+=384*1024,index++) {
  const part = compressed.subarray(start,start+384*1024)
  const filename = `part-${String(index).padStart(3,'0')}.bin`
  await writeFile(resolve(directory,filename),part)
  manifest.chunks.push({uri:`catgo-assets://editor/${sha256}/${index}`,bytes:part.length,filename})
}
await writeFile(resolve(root,'assets/program-manifest.json'),JSON.stringify(manifest,null,2))
const loader = await build({...options, entryPoints:['ui/bootstrap.ts'],outfile:resolve(root,'assets/bootstrap.js'),write:false,define:{...options.define,__CATGO_EDITOR_MANIFEST__:JSON.stringify(manifest)}})
const bootstrap = loader.outputFiles.find(file => file.path.endsWith('.js')).text
const compressedBootstrap = gzipSync(Buffer.from(bootstrap),{level:9}).toString('base64')
const entryScript = `try{const bytes=Uint8Array.from(atob("${compressedBootstrap}"),c=>c.charCodeAt(0));const source=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));try{await import(url)}finally{URL.revokeObjectURL(url)}}catch(error){const progress=document.getElementById('loading');progress.setAttribute('role','alert');progress.textContent='CatGo could not open: '+error.message}`
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + css + '\n#loading{padding:16px;font:14px system-ui}#loading[role="alert"]{color:#b13d25}</style></head><body><div id="loading" role="status">Connecting to Codex…</div><div id="app"></div><script type="module">' + entryScript + '</script></body></html>'
// Prevent reintroducing the oversized single-resource payload. Program chunks
// use a separate server resource bridge, with no external HTTP service.
if (Buffer.byteLength(html)>384*1024) throw new Error('CatGo UI entry resource must remain below 384 KiB.')
await writeFile(resolve(root,'assets/editor.html'),html)
const sourceReceipt = JSON.parse(await readFile(resolve(catgoRoot,'SOURCE.json'),'utf8').catch(() => JSON.stringify({sourceCommit:execFileSync('git',['-C',catgoRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim()})))
const version = JSON.parse(await readFile(resolve(root,'plugin.json'),'utf8')).version
const sourcePatch = await readFile(resolve(root,'patches/slab-preview-bonds.patch'))
await writeFile(resolve(root,'assets/build-receipt.json'), JSON.stringify({version,catgoCommit:sourceReceipt.sourceCommit,catgoDevCommitReviewed:slabAlignment.commit,slabAlignment,upstreamFixes,sourcePatchSha256:createHash('sha256').update(sourcePatch).digest('hex'),bundler:'standalone CatGo component/WASM adapter',htmlBytes:Buffer.byteLength(html),programBytes:bytes.length,compressedProgramBytes:compressed.length,chunkCount:manifest.chunks.length,resourceLoading:'MCP resource bridge; gzip chunks',sdk: {'@modelcontextprotocol/ext-apps':'1.7.5','@openai/mcp-extensions':'0.1.0'},runtimeRequiresCatgoCheckout:false},null,2))
console.log(`CatGo entry: ${(Buffer.byteLength(html)/1024).toFixed(0)} KiB; program: ${(compressed.length/1024/1024).toFixed(1)} MiB in ${manifest.chunks.length} MCP resources.`)
// Bundle the real parsers and state controller for Node tests using the same
// aliases and definitions as the editor, without a browser or compute backend.
const documentResult = await build({...options,entryPoints:['ui/document.ts'],outfile:resolve(root,'tests/document.bundle.mjs'),format:'esm',write:true})

recordInputs(documentResult, root)
await build({...options, entryPoints:['ui/upstream.test.ts'],
  outfile:resolve(root,'ui/.test-build/upstream.test.mjs'), write:true,
  external:['vitest']})
await writeFile(resolve(root,'build-inputs.json'),JSON.stringify([...catgoSourceFiles].filter(file=>file.startsWith(catgoRoot+'/') && !file.includes('/node_modules/')).map(file=>file.slice(catgoRoot.length+1)).sort(),null,2)+'\n')
await writeFile(resolve(root,'build-dependencies.json'),JSON.stringify(Object.fromEntries([...catgoDependencies].sort()),null,2)+'\n')
