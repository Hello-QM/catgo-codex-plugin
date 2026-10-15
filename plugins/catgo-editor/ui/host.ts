import { App, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import { OpenAIExtensions } from '@openai/mcp-extensions/app'
import type { FileBridge, FileRef, ResourceValue, WriteResult } from './document'

type Connection = {
  app: App
  extensions: OpenAIExtensions
  ready?: Promise<void>
  file?: FileRef
  onFile?: (file: FileRef) => void
  onChange?: (uri: string) => void
  style: () => void
}
const connectionKey = Symbol.for('catgo.codex.file-editor.connection')

// The small loader and the editor share one bridge. In particular, tool input
// can arrive before the editor bundle has finished loading.
export function getHostConnection(): Connection {
  const shared = globalThis as typeof globalThis & {[connectionKey]?: Connection}
  if (shared[connectionKey]) return shared[connectionKey]
  const app = new App({ name: 'CatGo Structure Editor', version: '0.2.10' }, { availableDisplayModes: ['fullscreen'] }, { autoResize: false })
  const extensions = new OpenAIExtensions(app)
  const connection: Connection = {app, extensions, style: () => {}}
  shared[connectionKey] = connection
  app.addEventListener('toolinput', ({ arguments: args }) => {
    const file = (args as {file?: FileRef})?.file
    if (file?.name && file.resourceUri) {
      connection.file = file
      connection.onFile?.(file)
    }
  })
  const style = () => {
    const context = app.getHostContext()
    document.documentElement.style.colorScheme = context?.theme ?? 'light'
    if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
  }
  connection.style = style
  app.addEventListener('hostcontextchanged', style)
  return connection
}

export function connectHost(connection = getHostConnection()) {
  return connection.ready ??= connection.app.connect().then(() => {
    connection.style()
    connection.extensions.resources?.addUpdateHandler(({params}) => connection.onChange?.(params.uri))
  })
}

export function createHost(onFile: (file: FileRef) => void, onChange: (uri: string) => void) {
  const connection = getHostConnection()
  const {app, extensions} = connection
  connection.onFile = onFile
  connection.onChange = onChange
  const bridge: FileBridge = {
    async read(uri): Promise<ResourceValue> {
      if (!extensions.resources) throw new Error('This host does not provide the file-resource interface required by the editor.')
      const response = await extensions.resources.read({uri, representation: 'text'})
      const content = response.contents[0]
      if (!content) throw new Error('The host returned an empty file.')
      const text = 'text' in content ? content.text : new TextDecoder().decode(Uint8Array.from(atob(content.blob), character => character.charCodeAt(0)))
      return {text, writable: content.openaiMetadata?.writable === true, etag: content.openaiMetadata?.etag}
    },
    async write(uri, text, etag): Promise<WriteResult> {
      if (!extensions.resources) throw new Error('This host does not support saving files.')
      return await extensions.resources.write(uri, {text, ifMatch: etag}) as WriteResult
    },
  }
  return {
    bridge,
    async connect() {
      await connectHost(connection)
      if (connection.file) onFile(connection.file)
    },
    async subscribe(uri: string) { await extensions.resources?.subscribe({uri}) },
    async unsubscribe(uri: string) { await extensions.resources?.unsubscribe({uri}) },
    async exportCopy(name: string, text: string) {
      if (app.getHostCapabilities()?.downloadFile) {
        const result = await app.downloadFile({contents:[{type:'resource',resource:{uri:`catgo-export:///${encodeURIComponent(name)}`,mimeType:'text/plain',text}}]})
        if (result.isError) throw new Error('The host did not export the file. Your edits are preserved.')
        return
      }
      const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}))
      const link = document.createElement('a'); link.href = url; link.download = name; link.click()
      setTimeout(() => URL.revokeObjectURL(url),1000)
    },
    async context(file: FileRef, structure: {sites: {species: {element: string}[]; xyz: number[]}[]}, selected: number[]) {
      const atoms = selected.slice(0, 50).map(index => ({index: index + 1, element: structure.sites[index].species[0].element, xyz: structure.sites[index].xyz}))
      await app.updateModelContext({content: [{type: 'text', text: `CatGo editor: ${file.name}, ${structure.sites.length} atoms; selected atoms: ${JSON.stringify(atoms)}`}], structuredContent: {filename: file.name, atomCount: structure.sites.length, selectedAtoms: atoms}})
    },
  }
}
