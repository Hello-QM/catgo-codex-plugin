import {Client} from '../ui/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import {StdioClientTransport} from '../ui/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'

const client=new Client({name:'catgo-mcp-acceptance',version:'0.2.0'})
const transport=new StdioClientTransport({command:'python3',args:[fileURLToPath(new URL('../server.py',import.meta.url))]})
try {
 await client.connect(transport)
 const tools=await client.listTools()
 const opener=tools.tools.find(tool=>tool.name==='open_catgo_file')
 assert.ok(opener._meta['openai/ui'].entrypoints.some(entry=>entry.type==='file' && entry.extensions.includes('.cif')))
 const opened=await client.callTool({name:'open_catgo_file',arguments:{file:{name:'test.xyz',resourceUri:'host-resource://test'}}})
 assert.equal(opened.structuredContent.file.resourceUri,'host-resource://test')
 const resource=await client.readResource({uri:opener._meta.ui.resourceUri})
 assert.equal(resource.contents[0].mimeType,'text/html;profile=mcp-app')
 assert.ok(resource.contents[0].text.includes('<div id="app">'))
 assert.ok(Buffer.byteLength(resource.contents[0].text)<384*1024)
 const manifest=JSON.parse(await readFile(new URL('../assets/program-manifest.json',import.meta.url),'utf8'))
 const parts=[]
 for(const chunk of manifest.chunks){
  const result=await client.readResource({uri:chunk.uri})
  assert.equal(result.contents[0].uri,chunk.uri)
  parts.push(Buffer.from(result.contents[0].blob,'base64'))
 }
 const javascript=gunzipSync(Buffer.concat(parts))
 assert.equal(createHash('sha256').update(javascript).digest('hex'),manifest.sha256)
 console.log('Official MCP client verified file opener, small entry ('+Buffer.byteLength(resource.contents[0].text)+' bytes) and '+parts.length+' program resources.')
} finally {await client.close()}
