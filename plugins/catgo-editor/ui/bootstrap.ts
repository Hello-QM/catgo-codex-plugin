import { connectHost, getHostConnection } from './host'

type Bundle = {sha256: string; compressedBytes: number; javascriptBytes: number; chunks: {uri: string; bytes: number}[]}
declare const __CATGO_EDITOR_MANIFEST__: Bundle
const bundle = __CATGO_EDITOR_MANIFEST__

async function start() {
  const connection = getHostConnection()
  const progress = document.getElementById('loading')!
  await connectHost(connection)
  if (!connection.app.getHostCapabilities()?.serverResources) throw new Error('This host does not support loading plugin resources.')
  if (!globalThis.DecompressionStream) throw new Error('This host needs a browser with gzip decompression support.')
  const pieces: Uint8Array[] = new Array(bundle.chunks.length)
  let next = 0, completed = 0
  // Requests stay on the app/server resource bridge. No website, CDN, local
  // listener or model-context tool call is involved in loading these assets.
  const worker = async () => {
    while (next < bundle.chunks.length) {
      const index = next++
      const chunk = bundle.chunks[index]
      const result = await connection.app.readServerResource({uri: chunk.uri})
      const content = result.contents.find(value => value.uri === chunk.uri)
      if (!content || !('blob' in content)) throw new Error('A CatGo program resource is missing. Reload the plugin.')
      const bytes = Uint8Array.from(atob(content.blob), character => character.charCodeAt(0))
      if (bytes.length !== chunk.bytes) throw new Error('A CatGo program resource is incomplete. Reload the plugin.')
      pieces[index] = bytes
      progress.textContent = `Loading CatGo… ${Math.round(++completed / pieces.length * 100)}%`
    }
  }
  await Promise.all(Array.from({length: Math.min(4, pieces.length)}, worker))
  const compressed = new Blob(pieces)
  if (compressed.size !== bundle.compressedBytes) throw new Error('The CatGo program size does not match its manifest.')
  const javascript = await new Response(compressed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  if (javascript.byteLength !== bundle.javascriptBytes) throw new Error('The CatGo program could not be unpacked completely.')
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', javascript))
  if (Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('') !== bundle.sha256) throw new Error('The CatGo program does not match this plugin version. Reload the plugin.')
  const url = URL.createObjectURL(new Blob([javascript], {type: 'text/javascript'}))
  try { await import(/* @vite-ignore */ url) }
  finally { URL.revokeObjectURL(url) }
  progress.remove()
}

void start().catch(error => {
  const progress = document.getElementById('loading')!
  progress.setAttribute('role', 'alert')
  progress.textContent = `CatGo could not open: ${error.message}`
})
