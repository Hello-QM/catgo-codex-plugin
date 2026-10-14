// CatGo component/WASM bundler adapted from Hello-QM's DSH CatGo integration.
// This standalone adapter contains no DSH service or runtime dependency.
import { existsSync, statSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { adaptBuildNotifications } from './adapt-build-notifications.mjs'
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildRequire = createRequire(resolve(pluginRoot, 'ui/package.json'))
const { build: esbuild } = buildRequire('esbuild')
const ts = buildRequire('typescript')
const catgoRoot = process.env.CATGO_SOURCE_ROOT ?? resolve(pluginRoot, '../../vendor/catgo')
const catgoLib = resolve(catgoRoot, 'src/lib')
const catgoRequire = createRequire(resolve(catgoRoot, 'package.json'))
const { compile, compileModule, preprocess } = catgoRequire('svelte/compiler')
const scalarFerroxWasm = resolve(catgoRoot, 'extensions/rust-wasm/pkg/ferrox_bg.wasm')
const scalarFerroxGlue = catgoRequire.resolve('@catgo/ferrox-wasm')
const ferroxGluePaths = new Set([resolve(scalarFerroxGlue), resolve(catgoRoot, 'extensions/rust-wasm/pkg-scalar/ferrox.js'), resolve(catgoRoot, 'extensions/rust-wasm/pkg-threaded/ferrox.js')])
export const catgoSourceFiles = new Set()
export const catgoDependencies = new Map()
export function recordInputs(result, workingDirectory) {
 for (const file of Object.keys(result.metafile?.inputs ?? {})) {
  if (file.includes(':') && !isAbsolute(file)) continue
  const path = resolve(workingDirectory, file)
  if (!existsSync(path)) continue
  if (!path.includes('node_modules')) { catgoSourceFiles.add(path); continue }
  const separator = path.lastIndexOf('/node_modules/')
  if (separator < 0) continue
  const suffix = path.slice(separator + 14).split('/')
  const packageRoot = path.slice(0, separator + 14) + (suffix[0].startsWith('@') ? suffix.slice(0,2).join('/') : suffix[0])
  try {const meta=JSON.parse(readFileSync(resolve(packageRoot,'package.json'),'utf8'));catgoDependencies.set(meta.name,meta.version)} catch {}

 }
}
const retainedCatgoCss = new Set([
  '$lib/pane-shared.css',
  '$lib/dialog-shared.css',
])

function resolveSource(base) {
  const candidates = [
    base,
    `${base}.ts`, `${base}.js`, `${base}.svelte`, `${base}.json`,
    resolve(base, 'index.ts'), resolve(base, 'index.js'), resolve(base, 'index.svelte'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const inlineWorkerBundles = new Map()

function virtualSourceId(sourcePath) {
  const local = relative(catgoRoot, sourcePath)
  if (local && !local.startsWith('..') && !isAbsolute(local)) {
    return local.replaceAll('\\', '/')
  }
  return `external/${basename(sourcePath)}`
}

/** wasm-bindgen keeps a no-argument initializer that resolves
 * `ferrox_bg.wasm` relative to import.meta.url. CatGo always supplies either a
 * compiled Module (Workers) or the embedded data URL (main-thread helpers), so
 * that branch is unnecessary in DSH and would be invalid inside a Blob URL.
 * Replace it with an explicit failure in both the main bundle and nested
 * inline-worker bundle; this makes accidental loose fetches impossible. */
const ferroxNoLooseInitializer = {
  name: 'catgo-ferrox-no-loose-initializer',
  setup(build) {
    build.onLoad({ filter: /ferrox\.js$/ }, async (args) => {
      if (!ferroxGluePaths.has(resolve(args.path))) return undefined
      catgoSourceFiles.add(args.path)
      const source = await readFile(args.path, 'utf8')
      const fallback = /if\s*\(module_or_path === undefined\)\s*\{\s*module_or_path = new URL\((['"])ferrox_bg\.wasm\1,\s*import\.meta\.url\);\s*\}/gu
      const matches = source.match(fallback)
      if (matches?.length !== 1) {
        throw new Error(
          `Expected one wasm-bindgen loose initializer in ${args.path}; found ${String(matches?.length ?? 0)}`,
        )
      }
      return {
        contents: source.replace(
          fallback,
          `if (module_or_path === undefined) { throw new Error('DSH inline ferrox requires an explicit WASM module') }`,
        ),
        loader: 'js',
        resolveDir: dirname(args.path),
      }
    })
  },
}

/** Recreate Vite's `?worker&inline` contract for DSH's single-file client.
 * The worker entry and its wasm-bindgen glue become a classic IIFE stored in a
 * Blob URL, while the multi-megabyte WASM module remains compiled once on the
 * main thread and transferred through CatGo's existing init handshake. */
async function bundleInlineWorker(entryPath) {
  let bundled = inlineWorkerBundles.get(entryPath)
  if (!bundled) {
    bundled = esbuild({
      absWorkingDir: catgoRoot,
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      conditions: ['browser', 'import'],
      minifyWhitespace: true,
      sourcemap: false,
      metafile: true,
      logLevel: 'silent',
      plugins: [ferroxNoLooseInitializer],
      define: {
        'import.meta.url': 'self.location.href',
      },
    }).then((result) => {
      recordInputs(result, catgoRoot)
      const output = result.outputFiles?.[0]?.text
      if (!output) throw new Error(`No JavaScript emitted for CatGo worker ${entryPath}`)
      return `${output}\n//# sourceURL=catgo-${basename(entryPath).replace(/\.[^.]+$/, '')}.js`
    })
    inlineWorkerBundles.set(entryPath, bundled)
  }
  return bundled
}

/** Compile CatGo's real Svelte main viewer in-process. This mirrors the proven
 * VS Code webview path (`mount(Structure.svelte)`) but keeps it in the DSH
 * module bundle: no iframe, SVG renderer, copied scene, or runtime source path. */
const catgoSvelte = {
  name: 'catgo-svelte-main-viewer',
  setup(build) {
    // Components, rune modules and the DSH mount bridge must share one Svelte
    // runtime instance. Re-run bare Svelte resolution from CatGo's root so
    // esbuild's browser/import conditions select CatGo's client entries. A
    // plugin-data marker prevents this resolver from recursing into itself.
    build.onResolve({ filter: /^svelte(?:\/.*)?$/ }, async (args) => {
      if (args.pluginData?.catgoSvelteRuntime) return undefined
      return build.resolve(args.path, {
        resolveDir: catgoRoot,
        kind: args.kind,
        pluginData: { catgoSvelteRuntime: true },
      })
    })

    // CatGo's statically imported hidden panes pull in Monaco, terminal,
    // markdown and font styles. Preserve the shared pane/dialog rules used by
    // the viewer controls, but do not ship styles for unreachable tool panes.
    build.onResolve({ filter: /\.css$/ }, (args) => {
      if (retainedCatgoCss.has(args.path)) return undefined
      // Aggregate preview builds also contain Paper/Knowledge. Only suppress
      // optional styles owned by the CatGo checkout, never sibling plugins.
      const sourceRelative = relative(catgoRoot, args.resolveDir)
      if (!args.path.startsWith('$lib/') && (sourceRelative.startsWith('..') || isAbsolute(sourceRelative))) return undefined
      return { path: args.path, namespace: 'catgo-disabled-optional-css' }
    })
    build.onLoad({ filter: /.*/, namespace: 'catgo-disabled-optional-css' }, () => ({
      contents: 'export default ""',
      loader: 'js',
    }))

    // This ignored, generated corpus belongs to CatGo's standalone assistant.
    // DSH supplies its own assistant/knowledge workspace. Do not copy a local
    // checkout's developer notes and machine paths into the embedded viewer.
    build.onResolve({ filter: /(?:^|\/)docs-chunks\.json$/ }, (args) => {
      if (resolve(args.resolveDir, args.path) !== resolve(catgoLib, 'chat/docs-chunks.json')) return undefined
      return { path: 'standalone-docs', namespace: 'catgo-standalone-docs' }
    })
    build.onLoad({ filter: /.*/, namespace: 'catgo-standalone-docs' }, () => ({
      contents: '[]', loader: 'json',
    }))

    // The DSH wrapper replaces only Structure's standalone export pane with
    // its compact revision-aware toolbar. Keep TrajectoryExportPane intact:
    // trajectory range/frame export is part of the native CatGo player and
    // must not be caught merely because its filename ends in ExportPane.
    build.onResolve({ filter: /(?:^|\/)structure\/ExportPane\.svelte$/ }, () => ({
      path: 'disabled-export-pane.svelte',
      namespace: 'catgo-disabled-export-pane',
    }))
    build.onLoad({ filter: /.*/, namespace: 'catgo-disabled-export-pane' }, () => {
      const compiled = compile(`
        <script>
          let {
            export_pane_open = $bindable(false),
            crop_mode_active = $bindable(false),
            crop_region = $bindable(null),
          } = $props()
        </script>
      `, {
        filename: 'DisabledExportPane.svelte',
        generate: 'client',
        css: 'injected',
        dev: false,
        discloseVersion: false,
      })
      return { contents: compiled.js.code, loader: 'js', resolveDir: catgoRoot }
    })

    build.onResolve({ filter: /^\$lib(?:\/.*)?$/ }, (args) => {
      const suffix = args.path === '$lib' ? '' : args.path.slice('$lib/'.length)
      const path = resolveSource(resolve(catgoLib, suffix))
      if (path === null) return { errors: [{ text: `Cannot resolve CatGo source ${args.path}` }] }
      return { path }
    })

    build.onResolve({ filter: /^\$app\/environment$/ }, () => ({
      path: '$app/environment',
      namespace: 'catgo-environment',
    }))
    build.onLoad({ filter: /.*/, namespace: 'catgo-environment' }, () => ({
      contents: 'export const browser=true; export const building=false; export const dev=false; export const version="dsh";',
      loader: 'js',
    }))

    // CatGo requires an off-main-thread Rust worker for large structures and
    // trajectories (>=4096 atoms); there is deliberately no synchronous JS
    // fallback at that size. Rebuild Vite's ?worker&inline module as a Blob
    // worker so the DSH package stays single-file without disabling that path.
    build.onResolve({ filter: /\?worker&inline$/ }, (args) => {
      const path = resolveSource(resolve(
        args.resolveDir,
        args.path.replace(/\?worker&inline$/, ''),
      ))
      if (path === null) {
        return { errors: [{ text: `Cannot resolve CatGo inline worker ${args.path}` }] }
      }
      // wasm-bindgen-rayon's threaded coordinator still spawns a separate
      // module worker by relative URL. That child cannot exist as a loose file
      // in a single-file DSH package, so fail only these optional fast paths;
      // both the bond runtime and Cube runtime immediately retry their fully
      // bundled scalar Rust workers. Do not add COOP/COEP globally: that would
      // change the host contract for Better Sidebar and third-party plugins.
      if (
        basename(path) === 'bond-worker-threaded.ts'
        || basename(path) === 'rust-cube.worker-threaded.ts'
      ) {
        return {
          path: virtualSourceId(path),
          namespace: 'catgo-threaded-inline-worker-fallback',
          pluginData: { sourcePath: path },
        }
      }
      return {
        path: virtualSourceId(path),
        namespace: 'catgo-inline-worker',
        pluginData: { sourcePath: path },
      }
    })
    build.onLoad(
      { filter: /.*/, namespace: 'catgo-threaded-inline-worker-fallback' },
      () => ({
        contents: `
          export default class CatGoUnavailableThreadedWorker {
            constructor() {
              throw new Error(
                'CatGo threaded Rayon worker is unavailable in the single-file DSH client; retry the scalar worker',
              )
            }
          }
        `,
        loader: 'js',
      }),
    )
    build.onLoad({ filter: /.*/, namespace: 'catgo-inline-worker' }, async (args) => {
      const sourcePath = args.pluginData?.sourcePath
      if (typeof sourcePath !== 'string') {
        throw new Error(`CatGo inline worker ${args.path} is missing its build source`)
      }
      const workerSource = await bundleInlineWorker(sourcePath)
      return {
        contents: `
          const workerUrl = URL.createObjectURL(new Blob([
            ${JSON.stringify(workerSource)}
          ], { type: 'text/javascript' }))
          export default class CatGoInlineWorker extends Worker {
            constructor(options) { super(workerUrl, options) }
          }
        `,
        loader: 'js',
      }
    })

    // Vite URL imports used by optional WASM features. Embed the portable
    // scalar artifact as a data URL so the private plugin stays self-contained
    // and never reaches back into the CatGo checkout at runtime. This DSH Web
    // profile is intentionally non-COI; resolve the statically reachable
    // threaded URL specifier to the same scalar module so the bundle does not
    // carry an unusable second WASM binary. The threaded Worker constructor is
    // stubbed above and therefore makes CatGo retry scalar if isolation ever
    // appears unexpectedly.
    build.onResolve({ filter: /\?url$/ }, (args) => {
      const raw = args.path.replace(/\?url$/, '')
      let path
      if (
        raw === '@catgo/ferrox-wasm/ferrox_bg.wasm'
        || raw === '@catgo/ferrox-wasm/pkg-threaded/ferrox_bg.wasm'
      ) {
        return {
          path: 'ferrox-scalar-inline.wasm',
          namespace: 'catgo-embedded-url',
          pluginData: { sourcePath: scalarFerroxWasm },
        }
      } else if (raw.startsWith('.') || raw.startsWith('/')) {
        path = resolve(args.resolveDir, raw)
      } else {
        path = catgoRequire.resolve(raw)
      }
      return {
        path: virtualSourceId(path),
        namespace: 'catgo-embedded-url',
        pluginData: { sourcePath: path },
      }
    })
    build.onLoad({ filter: /.*/, namespace: 'catgo-embedded-url' }, async (args) => {
      const sourcePath = args.pluginData?.sourcePath ?? args.path
      catgoSourceFiles.add(sourcePath)
      const bytes = await readFile(sourcePath)
      const mime = extname(sourcePath) === '.wasm' ? 'application/wasm' : 'application/octet-stream'
      return {
        contents: `export default ${JSON.stringify(`data:${mime};base64,${bytes.toString('base64')}`)}`,
        loader: 'js',
      }
    })

    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const sourcePath = resolve(args.resolveDir, args.path.replace(/\?raw$/, ''))
      return {
        path: virtualSourceId(sourcePath),
        namespace: 'catgo-raw',
        pluginData: { sourcePath },
      }
    })
    build.onLoad({ filter: /.*/, namespace: 'catgo-raw' }, async (args) => {
      const sourcePath = args.pluginData?.sourcePath
      if (typeof sourcePath !== 'string') {
        throw new Error(`CatGo raw module ${args.path} is missing its build source`)
      }
      catgoSourceFiles.add(sourcePath)
      return {
        contents: `export default ${JSON.stringify(await readFile(sourcePath, 'utf8'))}`,
        loader: 'js',
      }
    })

    // Svelte rune modules are JavaScript modules rather than components, so
    // they require compileModule instead of compile. Restrict the hook to the
    // conventional suffixes inside CatGo; ordinary TypeScript remains under
    // esbuild's normal loader.
    build.onLoad({ filter: /\.svelte\.(?:ts|js)$/ }, async (args) => {
      const local = relative(catgoRoot, args.path)
      if (local.startsWith('..') || isAbsolute(local)) return undefined
      catgoSourceFiles.add(args.path)
      const source = await readFile(args.path, 'utf8')
      const javascript = args.path.endsWith('.ts')
        ? ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            verbatimModuleSyntax: true,
          },
          fileName: args.path,
        }).outputText
        : source
      const compiled = compileModule(javascript, {
        filename: args.path,
        rootDir: catgoRoot,
        generate: 'client',
        dev: false,
      })
      return {
        contents: compiled.js.code,
        loader: 'js',
        resolveDir: dirname(args.path),
      }
    })

    build.onLoad({ filter: /\.svelte$/ }, async (args) => {
      catgoSourceFiles.add(args.path)
      const original = await readFile(args.path, 'utf8')
      const source = resolve(args.path) === resolve(catgoLib, 'structure/Structure.svelte')
        ? adaptBuildNotifications(original) : original
      const processed = await preprocess(source, {
        script: ({ content, attributes }) => {
          if (attributes.lang !== 'ts') return undefined
          return {
            code: ts.transpileModule(content, {
              compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.Bundler,
                verbatimModuleSyntax: true,
              },
              fileName: args.path,
            }).outputText,
          }
        },
      }, { filename: args.path })
      const compiled = compile(processed.code, {
        filename: args.path,
        generate: 'client',
        css: 'injected',
        dev: false,
        discloseVersion: false,
      })
      return {
        contents: compiled.js.code,
        loader: 'js',
        resolveDir: dirname(args.path),
      }
    })
  },
}

export const catgoClientOptions = {
  clientPlugins: [ferroxNoLooseInitializer, catgoSvelte],
  clientDefine: {
    '__CATGO_STATIC_ONLY__': 'true',
    '__CATGO_SERVER_URL__': JSON.stringify(''),
    '__CATGO_DESKTOP__': 'false',
    '__CATGO_VSCODE_EXTENSION__': 'false',
    'import.meta.env': JSON.stringify({
      DEV: false,
      SSR: false,
      MODE: 'production',
      VITE_CORS_RELAY_URL: '',
    }),
    'import.meta.hot': 'undefined',
    'import.meta.url': 'document.baseURI',
  },
}
