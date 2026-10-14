import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = process.env.CATGO_SOURCE_ROOT || resolve(pluginRoot, '../../vendor/catgo')
const ts = createRequire(resolve(pluginRoot,'ui/package.json'))('typescript')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function functionSources(source, names, filename) {
  const tree = ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true)
  const found = new Map()
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) {
      if (found.has(node.name.text)) throw Error(`Ambiguous slab function ${node.name.text}`)
      found.set(node.name.text,node.getText(tree))
    }
    ts.forEachChild(node,visit)
  }
  visit(tree)
  return Object.fromEntries(names.map(name => {
    if (!found.has(name)) throw Error(`Missing slab function ${name} in ${filename}`)
    return [name,sha256(found.get(name))]
  }))
}

export async function checkSlabAlignment() {
  const reference = JSON.parse(await readFile(resolve(pluginRoot,'references/catgo-dev-slab.json'),'utf8'))
  let checked = 0
  for (const [file, expected] of Object.entries(reference.files)) {
    const source = await readFile(resolve(sourceRoot,file))
    if (sha256(source) !== expected) throw Error(`Slab source differs from reviewed catgo-dev: ${file}. Review upstream changes before packaging.`)
    checked++
  }
  for (const [file, expected] of Object.entries(reference.functions)) {
    const actual = functionSources(await readFile(resolve(sourceRoot,file),'utf8'),Object.keys(expected),file)
    for (const name of Object.keys(expected)) {
      if (actual[name] !== expected[name]) throw Error(`Slab function differs from reviewed catgo-dev: ${name} in ${file}`)
      checked++
    }
  }
  const wasmPath = resolve(sourceRoot,'extensions/rust-wasm/pkg/ferrox_bg.wasm')
  const gluePath = createRequire(resolve(sourceRoot,'package.json')).resolve('@catgo/ferrox-wasm')
  return {repository:reference.repository,commit:reference.commit,sourceChecks:checked,files:reference.files,functions:reference.functions,scalarWasmSha256:sha256(await readFile(wasmPath)),scalarGlueSha256:sha256(await readFile(gluePath)),wasmPath}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result=await checkSlabAlignment()
  console.log(JSON.stringify({repository:result.repository,commit:result.commit,sourceChecks:result.sourceChecks,scalarWasmSha256:result.scalarWasmSha256},null,2))
}
