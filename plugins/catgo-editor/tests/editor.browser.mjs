/** Browser acceptance against the real bundled editor and official SDK.
 * The parent implements the documented host file protocol for a test fixture.
 * This does not claim that the Codex desktop host has rendered the plugin. */
import {createServer} from 'node:http'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,dirname,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {parseDocument} from './document.bundle.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(resolve(root,'ui/package.json'))
const {chromium}=require('@playwright/test')
const html=await readFile(resolve(root,'assets/editor.html'),'utf8')
assert.ok(Buffer.byteLength(html)<384*1024,'The host entry must remain smaller than 384 KiB.')
const manifest=JSON.parse(await readFile(resolve(root,'assets/program-manifest.json'),'utf8'))
const resources=Object.fromEntries(await Promise.all(manifest.chunks.map(async chunk=>[chunk.uri,{uri:chunk.uri,mimeType:'application/octet-stream',blob:(await readFile(resolve(root,'assets/program',chunk.filename))).toString('base64')}])) )
const xyz='3\nwater test fixture\nO 0 0 0\nH 0.9572 0 0\nH -0.239 0.927 0\n'
const fixture=process.argv[2]
const filename=fixture ? basename(fixture) : 'water.xyz'
const input=fixture ? await readFile(resolve(fixture),'utf8') : xyz
const initial=parseDocument(input,filename)
const escapeHtml=value=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))
const scriptJson=value=>JSON.stringify(value).replace(/</g,'\\u003c')
const host=`<!doctype html><html><body style="margin:0;font:14px system-ui;background:#eee"><div style="padding:8px">Test host · CatGo file editor · ${escapeHtml(filename)}</div><iframe id="editor" title="CatGo file editor" sandbox="allow-scripts allow-downloads" src="/editor" style="width:100%;height:calc(100vh - 36px);border:0"></iframe><script>
const record={text:${scriptJson(input)},etag:'v1',writes:[],exports:[],contexts:[],resourceReads:[],events:[],forceConflict:false,programReads:[]};window.testRecord=record;
const broken=new URLSearchParams(location.search).has('missing-resource');
const frame=document.getElementById('editor');
const send=message=>frame.contentWindow.postMessage({jsonrpc:'2.0',...message},'*');
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow)return;
 const message=event.data;record.events.push(message.method);
 if(message.method==='resources/read')record.resourceReads.push(message.params.uri);
 if(message.method==='ui/notifications/initialized'){
  send({method:'ui/notifications/tool-input',params:{arguments:{file:{name:${scriptJson(filename)},resourceUri:'host-resource://fixture'}}}});return;
 }
 if(!('id' in message))return;
 let result;
 if(message.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostInfo:{name:'CatGo test host',version:'1'},hostCapabilities:{downloadFile:{},serverResources:{},updateModelContext:{},experimental:{'openai/resource':{}}},hostContext:{theme:'light',displayMode:'fullscreen',availableDisplayModes:['fullscreen']}};
 else if(message.method==='resources/read'&&message.params.uri.startsWith('catgo-assets://')){
  record.programReads.push(message.params.uri);
  if(broken){send({id:message.id,error:{code:-32602,message:'Missing program resource'}});return;}
  result={contents:[await (await fetch('/resource?uri='+encodeURIComponent(message.params.uri))).json()]};
 }
 else if(message.method==='resources/read'&&message.params.uri==='host-resource://fixture')result={contents:[{uri:'host-resource://fixture',mimeType:'text/plain',text:record.text,_meta:{'openai/resource':{writable:true,etag:record.etag}}}]};
 else if(message.method==='ui/update-model-context'){record.contexts.push(message.params);result={};}
 else if(message.method==='resources/subscribe'||message.method==='resources/unsubscribe')result={};
 else if(message.method==='ui/download-file'){record.exports.push(message.params);result={};}
 else if(message.method==='openai/resources/write'){
  if(record.forceConflict||message.params.ifMatch!==record.etag)result={outcome:'conflict',etag:'external-v2'};
  else{record.text=message.params.text;record.etag='v'+(record.writes.length+2);record.writes.push(message.params);result={outcome:'saved',etag:record.etag};}
 }else{send({id:message.id,error:{code:-32601,message:'Unsupported test-host method '+message.method}});return;}
 send({id:message.id,result});
});
</script></body></html>`
const server=createServer((request,response)=>{
 const url=new URL(request.url,'http://localhost');
 if(url.pathname==='/resource'){
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify(resources[url.searchParams.get('uri')]));return;
 }
 response.setHeader('Content-Type','text/html; charset=utf-8');
 if(url.pathname==='/editor')response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src data: blob:; worker-src blob:; frame-src 'none'; object-src 'none'");
 response.end(url.pathname==='/editor'?html:host)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser, page
const errors=[]
try {
 browser=await chromium.launch({...(process.env.CATGO_TEST_BROWSER ? {executablePath:process.env.CATGO_TEST_BROWSER} : {}),headless:true,args:['--no-sandbox']})
 page=await browser.newPage({viewport:process.env.CATGO_EDITOR_TEST_NARROW ? {width:535,height:720} : {width:1120,height:800}})
 if(process.env.CATGO_EDITOR_TEST_HIDDEN_CONSTRUCTOR)await page.addInitScript(()=>Object.defineProperty(window,'WebGLRenderingContext',{value:undefined,configurable:true}))
 if(process.env.CATGO_EDITOR_TEST_NO_GPU)await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'||type==='webgl' ? null : get.call(this,type,...args)}})
 page.on('pageerror',error=>errors.push(error.stack ?? error.message))
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'})
 const editor=page.frameLocator('#editor')
 await editor.getByRole('button',{name:'Edit atom coordinates',exact:true}).waitFor({timeout:30000})
 assert.equal(await page.evaluate(()=>window.testRecord.programReads.length),manifest.chunks.length)
 assert.equal(await page.evaluate(()=>window.testRecord.events.filter(method=>method==='ui/initialize').length),1)
 let pixels={width:0,height:0,colorCount:0}
 if(process.env.CATGO_EDITOR_TEST_NO_GPU){
  await editor.getByRole('alert').filter({hasText:'Error creating WebGL context'}).waitFor()
 }else{
  const frame=page.frames().find(frame=>frame.url().endsWith('/editor'))
  await frame.waitForFunction(()=>document.querySelector('canvas[data-render-active="true"]')?.__renderer?.info.render.calls>0)
  pixels=await editor.locator('canvas[data-render-active="true"]').evaluate(canvas=>{
  const renderer=canvas.__renderer;renderer.render(canvas.__scene,canvas.__camera)
  const gl=renderer.getContext(), data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4)
  gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data)
  // A large crystal atom can fill a small centre crop with one flat colour.
  // Sample the entire view so the rendering check covers atoms and cell edges.
  const colors=new Set();for(let i=0;i<data.length;i+=16)colors.add(data.slice(i,i+3).join(','))
  return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,colorCount:colors.size}
  })
  assert.ok(pixels.width>0&&pixels.height>0&&pixels.colorCount>10,JSON.stringify(pixels))
 }
 await editor.getByRole('button',{name:'Edit atom coordinates',exact:true}).click()
 await editor.getByRole('spinbutton',{name:'X coordinate'}).fill('0.25')
 await editor.getByRole('button',{name:'Apply coordinates',exact:true}).click()
 assert.equal(await editor.getByRole('combobox',{name:'Atom',exact:true}).inputValue(),'1')
 await editor.getByRole('button',{name:'Save',exact:true}).waitFor({state:'visible'})
 assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),true)
 await editor.getByRole('button',{name:'Undo',exact:true}).click()
 assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
 await editor.getByRole('button',{name:'Redo',exact:true}).click()
 await editor.getByRole('button',{name:'Save',exact:true}).click()
 await page.waitForFunction(()=>window.testRecord.writes.length===1)
 const saved=await page.evaluate(()=>({text:window.testRecord.text,version:window.testRecord.writes[0].ifMatch}))
 assert.equal(saved.version,'v1')
 const reopened=parseDocument(saved.text,filename)
 assert.equal(reopened.sites.length,initial.sites.length)
 assert.ok(Math.abs(reopened.sites[0].xyz[0]-0.25)<1e-5)
 if(initial.lattice){
  assert.ok(Math.abs(reopened.lattice.volume-initial.lattice.volume)<1e-5)
  assert.equal(reopened.sites[0].species[0].element,initial.sites[0].species[0].element)
 }
 assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
 // A host-side conflict must leave the pending coordinates visible.
 await editor.getByRole('spinbutton',{name:'X coordinate'}).fill('0.5')
 await editor.getByRole('button',{name:'Apply coordinates',exact:true}).click()
 await page.evaluate(()=>{window.testRecord.forceConflict=true})
 await editor.getByRole('button',{name:'Save',exact:true}).click()
 await editor.getByRole('alert').filter({hasText:'Your edits are preserved'}).waitFor()
 assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
 assert.equal(await page.evaluate(()=>window.testRecord.writes.length),1)
 const extraPassed=[]
 let slabChecks
 let previewBondChecks
 let conventionalLayerChecks
 let selectionChecks
  let boundaryBondChecks
  if(process.env.CATGO_EDITOR_TEST_BOUNDARY_BONDS){
   // The only Si-Si neighbor is across x; neither atom is close enough to a
   // face to generate a boundary-image sphere. This exercises actual stubs.
   const text='Si periodic boundary\n1\n10 0 0\n0 10 0\n0 0 10\nSi\n2\nDirect\n0.1 0.5 0.5\n0.9 0.5 0.5\n'
   await page.evaluate(text=>{
    const record=window.testRecord;record.text=text;record.etag='boundary-v1';record.forceConflict=false
    document.getElementById('editor').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:{file:{name:'boundary.poscar',resourceUri:'host-resource://fixture'}}}},'*')
   },text)
   await editor.getByRole('button',{name:'Discard and open',exact:true}).click()
   await editor.locator('header strong').filter({hasText:'boundary.poscar'}).waitFor()
   await editor.locator('.structure-controls-toggle').click()
   const pane=editor.locator('.controls-pane')
   const checkbox=pane.getByRole('checkbox',{name:'Cell-edge stub bonds',exact:true})
   await checkbox.check()
   const length=pane.locator('label').filter({hasText:'Stub Length'}).getByRole('spinbutton')
   const geometry=()=>editor.locator('canvas[data-render-active="true"]').evaluate(canvas=>{
    const result=[]
    canvas.__scene.traverse(mesh=>{
     if(!mesh.isInstancedMesh||!mesh.material?.uniforms?.uStubScale)return
     const data=mesh.instanceMatrix.array
     for(let i=0;i<mesh.count;i++){
      const n=i*16
      const yLength=Math.hypot(data[n+4],data[n+5],data[n+6])
      if(yLength>1e-6)result.push(yLength)
     }
    })
    return result.sort((a,b)=>a-b)
   })
   await length.fill('1')
   await length.press('Tab')
   await page.waitForTimeout(300)
   const long=await geometry()
   assert.ok(long.length>=2,'Cross-cell stubs must be visible when the checkbox is enabled: '+JSON.stringify(long))
   assert.ok(long.every(n=>Math.abs(n-1)<1e-4),JSON.stringify(long))
   const slider=pane.locator('label').filter({hasText:'Stub Length'}).getByRole('slider')
   await slider.press('Home')
   for(let step=0;step<9;step++)await slider.press('ArrowRight')
   assert.equal(Number(await length.inputValue()),0.5)
   await page.waitForTimeout(300)
   const short=await geometry()
   assert.equal(short.length,long.length)
   assert.ok(short.every(n=>Math.abs(n-0.5)<1e-4),JSON.stringify(short))
   await checkbox.uncheck()
   await page.waitForTimeout(300)
   const off=await geometry()
   assert.ok(off.length>=2&&off.every(n=>Math.abs(n-1)<1e-4),JSON.stringify(off))
   await checkbox.check()
   await page.waitForTimeout(300)
   const restored=await geometry()
   assert.equal(restored.length,short.length)
   assert.ok(restored.every(n=>Math.abs(n-0.5)<1e-4))
   assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
   boundaryBondChecks={long,short,off,geometryUnchanged:true}
   extraPassed.push('periodic boundary checkbox controls real bond meshes','stub length changes real instance transforms','display settings do not dirty the structure')
   await editor.locator('.structure-controls-toggle').click()
  }
 if(process.env.CATGO_EDITOR_TEST_PERIODIC_SELECTION){
  const text=await readFile(resolve(root,'tests/fixtures/Si_periodic_constraints.poscar'),'utf8')
  await page.evaluate(text=>{
   const record=window.testRecord;record.text=text;record.etag='selection-v1';record.forceConflict=false
   document.getElementById('editor').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:{file:{name:'periodic-selection.poscar',resourceUri:'host-resource://fixture'}}}},'*')
  },text)
  await editor.getByRole('button',{name:'Discard and open',exact:true}).click()
  await editor.locator('header strong').filter({hasText:'periodic-selection.poscar'}).waitFor()
  const canvas=editor.locator('canvas[data-render-active="true"]')
  const bounds=await canvas.boundingBox()
  const selectAll=async()=>{
   await page.keyboard.down('Control')
   await page.mouse.move(bounds.x+8,bounds.y+80)
   await page.mouse.down()
   await page.mouse.move(bounds.x+bounds.width-8,bounds.y+bounds.height-8,{steps:10})
   await page.mouse.up()
   await page.keyboard.up('Control')
  }
  await selectAll()
  await editor.getByRole('button',{name:'Send selection',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.contexts.length>0)
  const selectedAtoms=await page.evaluate(()=>window.testRecord.contexts.at(-1).structuredContent.selectedAtoms)
  assert.deepEqual(selectedAtoms.map(atom=>atom.index).sort((a,b)=>a-b),[1,2])
  // The host toolbar is outside Structure's click-outside selection boundary.
  // Start a fresh selection before exercising its canvas context menu.
  await selectAll()
  await canvas.click({button:'right',position:{x:bounds.width/2,y:bounds.height/2}})
  await editor.getByText('Freeze all axes',{exact:true}).click()
  const frame=page.frames().find(frame=>frame.url().endsWith('/editor'))
  await frame.waitForFunction(()=>{
   let rings=0;document.querySelector('canvas[data-render-active="true"]')?.__scene?.traverse(object=>{if(object.geometry?.type==='TorusGeometry')rings++})
   return rings>6
  })
  const frozenRings=await canvas.evaluate(canvas=>{
   let rings=0;canvas.__scene.traverse(object=>{if(object.geometry?.type==='TorusGeometry')rings++});return rings
  })
  await editor.getByRole('button',{name:'Save',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.writes.length===2)
  const written=await page.evaluate(()=>window.testRecord.writes[1])
  assert.equal(written.ifMatch,'selection-v1')
  const reopened=parseDocument(written.text,'periodic-selection.poscar')
  assert.equal(reopened.sites.length,2)
  assert.deepEqual(reopened.sites.map(site=>site.properties.selective_dynamics),[[false,false,false],[false,false,false]])
  await editor.getByRole('button',{name:'Export',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.exports.length>0)
  const exported=await page.evaluate(()=>window.testRecord.exports.at(-1).contents[0].resource.text)
  assert.deepEqual(parseDocument(exported,'export.poscar').sites.map(site=>site.properties.selective_dynamics),[[false,false,false],[false,false,false]])
  await editor.getByRole('button',{name:'Undo',exact:true}).click()
  await frame.waitForFunction(()=>{
   let rings=0;document.querySelector('canvas[data-render-active="true"]')?.__scene?.traverse(object=>{if(object.geometry?.type==='TorusGeometry')rings++});return rings===0
  })
  await editor.getByRole('button',{name:'Redo',exact:true}).click()
  await frame.waitForFunction(()=>{
   let rings=0;document.querySelector('canvas[data-render-active="true"]')?.__scene?.traverse(object=>{if(object.geometry?.type==='TorusGeometry')rings++});return rings>6
  })
  selectionChecks={realAtoms:2,selectedAtoms:selectedAtoms.length,frozenRings,savePreservesConstraints:true,exportPreservesConstraints:true}
  extraPassed.push('Ctrl box selects editable atom IDs without periodic duplicates','right-click keeps multi-atom selection','frozen indicators include periodic images','POSCAR Save and Export retain both constraints','constraint undo/redo updates image indicators')
 }
 if(process.env.CATGO_EDITOR_TEST_CONVENTIONAL_LAYERS){
  const crystalText=await readFile(resolve(root,'tests/fixtures/IrO2_bulk_test.cif'),'utf8')
  await page.evaluate(text=>{
   const record=window.testRecord;record.text=text;record.etag='layers-v1';record.forceConflict=false
   document.getElementById('editor').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:{file:{name:'conventional-layers.cif',resourceUri:'host-resource://fixture'}}}},'*')
  },crystalText)
  await editor.getByRole('button',{name:'Discard and open',exact:true}).click()
  await editor.locator('header strong').filter({hasText:'conventional-layers.cif'}).waitFor()
  await editor.getByRole('button',{name:'Build Tools',exact:true}).click()
  await editor.getByRole('button',{name:'Slab',exact:true}).click()
  const pane=editor.locator('.build-pane')
  await pane.getByText('Using conventional cell (6 atoms)',{exact:true}).waitFor({timeout:30000})
  await pane.locator('.miller-field input').nth(0).fill('1')
  await pane.locator('.miller-field input').nth(1).fill('1')
  await pane.locator('.miller-field input').nth(2).fill('0')
  await pane.getByRole('button',{name:'Layers',exact:true}).click()
  for(let attempt=0;attempt<4;attempt++){
   const n=parseInt(await pane.locator('.layer-value').innerText(),10)
   if(n===4)break
   await pane.locator('.layer-control').getByRole('button',{name:n>4 ? '-' : '+',exact:true}).click()
  }
  assert.match(await pane.locator('.layer-value').innerText(),/4 layer/)
  await pane.getByRole('button',{name:'Apply Cut',exact:true}).click({timeout:30000})
  await editor.locator('footer').filter({hasText:'24 atoms'}).waitFor({timeout:30000})
  await pane.locator('.phase-indicator').filter({hasText:'Preview'}).waitFor({timeout:30000})
  await editor.getByRole('button',{name:'Build Tools',exact:true}).click()
  await pane.waitFor({state:'hidden'})
  await editor.getByRole('button',{name:'Save',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.writes.length===2)
  const saved=await page.evaluate(()=>window.testRecord.writes[1])
  assert.equal(saved.ifMatch,'layers-v1')
  const slab=parseDocument(saved.text,'conventional-layers.cif')
  const ir=slab.sites.filter(site=>site.species[0].element==='Ir').length
  const oxygen=slab.sites.filter(site=>site.species[0].element==='O').length
  assert.equal(ir,8);assert.equal(oxygen,16)
  const zs=slab.sites.map(site=>site.xyz[2])
  const vacuum=slab.lattice.matrix[2][2]-Math.max(...zs)+Math.min(...zs)
  assert.ok(Math.abs(vacuum-15)<1e-4)
  assert.deepEqual(await editor.getByRole('alert').allTextContents(),[])
  conventionalLayerChecks={useConventionalCell:true,miller:[1,1,0],layers:4,termination:0,atoms:24,Ir:ir,O:oxygen,vacuum}
  extraPassed.push('default conventional-cell conversion','four-layer (110) cut uses upstream layer semantics','IrO2 stoichiometry and 15 Å vacuum','layer-mode slab saves through the host bridge')
 }
 if(process.env.CATGO_EDITOR_TEST_SLAB_BONDS){
  const frame=page.frames().find(frame=>frame.url().endsWith('/editor'))
  const crystalText=await readFile(resolve(root,'tests/fixtures/IrO2_bulk_test.cif'),'utf8')
  await page.evaluate(text=>{
   const record=window.testRecord;record.text=text;record.etag='bonds-v1';record.forceConflict=false
   document.getElementById('editor').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:{file:{name:'slab-bonds.cif',resourceUri:'host-resource://fixture'}}}},'*')
  },crystalText)
  await editor.getByRole('button',{name:'Discard and open',exact:true}).click()
  await editor.locator('header strong').filter({hasText:'slab-bonds.cif'}).waitFor()
  await editor.getByRole('button',{name:'Build Tools',exact:true}).click()
  await editor.getByRole('button',{name:'Slab',exact:true}).click()
  const pane=editor.locator('.build-pane')
  await pane.getByLabel('Use conventional cell',{exact:true}).uncheck()
  await pane.locator('.miller-field input').nth(0).fill('0')
  await pane.locator('.miller-field input').nth(1).fill('0')
  await pane.locator('.miller-field input').nth(2).fill('1')
  await pane.locator('.number-row').filter({hasText:'Plane Offset'}).locator('input[type="number"]').fill('1')
  await pane.locator('.thickness-control > .stepper input[type="number"]').fill('9.01062774')
  await pane.locator('.supercell-field input').nth(0).fill('2')
  await pane.locator('.supercell-field input').nth(1).fill('2')
  await pane.locator('.vacuum-row input[type="number"]').fill('15')
  await pane.getByText('In-Plane Supercell',{exact:true}).click()
  await pane.locator('.supercell-info').filter({hasText:'48 atoms'}).waitFor({timeout:30000})
  await frame.waitForFunction(()=>{
   const scene=document.querySelector('canvas[data-render-active="true"]')?.__scene
   const atoms=scene?.getObjectByName('slab-preview-atoms')
   const group=scene?.getObjectByName('slab-preview-bonds')
   return atoms?.children.filter(child=>child.isMesh&&!child.material.wireframe).length===48&&group?.children.some(child=>child.isInstancedMesh&&child.count>0)
  })
  previewBondChecks=await editor.locator('canvas[data-render-active="true"]').evaluate(canvas=>{
   const scene=canvas.__scene, renderer=canvas.__renderer
   renderer.render(scene,canvas.__camera)
   const atoms=scene.getObjectByName('slab-preview-atoms').children.filter(child=>child.isMesh&&!child.material.wireframe).map(child=>child.position.toArray())
   const group=scene.getObjectByName('slab-preview-bonds'),lengths=[],endpointErrors=[]
   group.traverse(mesh=>{
    if(!mesh.isInstancedMesh)return
    const data=mesh.instanceMatrix.array
    for(let i=0;i<mesh.count;i++){
     const offset=i*16;lengths.push(Math.hypot(data[offset+4],data[offset+5],data[offset+6]))
     for(const sign of [-0.5,0.5]){
      const end=[0,1,2].map(axis=>data[offset+12+axis]+sign*data[offset+4+axis])
      endpointErrors.push(Math.min(...atoms.map(atom=>Math.hypot(...end.map((value,axis)=>value-atom[axis])))))
     }
    }
   })
   return {miller:[0,0,1],supercell:[2,2],thickness:9.01062774,offset:1,vacuum:15,atoms:atoms.length,renderedBonds:lengths.length,maxBondLength:Math.max(...lengths),maxEndpointError:Math.max(...endpointErrors)}
  })
  assert.equal(previewBondChecks.atoms,48)
  assert.ok(previewBondChecks.renderedBonds>0)
  assert.ok(previewBondChecks.maxBondLength<3.5,JSON.stringify(previewBondChecks))
  assert.ok(previewBondChecks.maxEndpointError<1e-4,JSON.stringify(previewBondChecks))
  assert.deepEqual(await editor.getByRole('alert').allTextContents(),[])
  await page.screenshot({path:resolve(root,'preview/editor-preview-bonds.png')})
  await pane.getByLabel('Show bonds',{exact:true}).uncheck()
  await frame.waitForFunction(()=>!document.querySelector('canvas')?.__scene?.getObjectByName('slab-preview-bonds'))
  await pane.getByLabel('Show bonds',{exact:true}).check()
  await frame.waitForFunction(()=>document.querySelector('canvas')?.__scene?.getObjectByName('slab-preview-bonds')?.children.some(child=>child.isInstancedMesh&&child.count>0))
  await pane.getByRole('button',{name:'Apply Cut',exact:true}).click({timeout:30000})
  await editor.locator('footer').filter({hasText:'48 atoms'}).waitFor({timeout:30000})
  await pane.locator('.phase-indicator').filter({hasText:'Preview'}).waitFor({timeout:30000})
  await editor.getByRole('button',{name:'Build Tools',exact:true}).click()
  await pane.waitFor({state:'hidden'})
  await editor.getByRole('button',{name:'Save',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.writes.length===2)
  const savedSlab=parseDocument(await page.evaluate(()=>window.testRecord.writes[1].text),'slab-bonds.cif')
  assert.equal(savedSlab.sites.length,48)
  assert.deepEqual(await editor.getByRole('alert').allTextContents(),[])
  extraPassed.push('IrO2 (001) 2×2 preview: 48 atoms and no long full-cell bonds','every rendered preview bond ends on a visible atom','Show bonds toggle','48-atom slab commit and version-checked Save')
 }
 if(process.env.CATGO_EDITOR_TEST_IMPORT_AND_SLAB){
  const frame=page.frames().find(frame=>frame.url().endsWith('/editor'))
  const crystalText=await readFile(resolve(root,'tests/fixtures/IrO2_bulk_test.cif'),'utf8')
  const crystal=parseDocument(crystalText,'dropped.cif')
  const drop=async(name,text)=>frame.evaluate(({name,text})=>{
   const dataTransfer=new DataTransfer();dataTransfer.items.add(new File([text],name,{type:'text/plain'}))
   const target=document.querySelector('canvas')??document.body
   target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer}))
   target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer}))
  },{name,text})
  await drop('dropped.cif',crystalText)
  await editor.getByRole('alertdialog',{name:'Unsaved changes'}).waitFor()
  assert.match(await editor.locator('footer').innerText(),/3 atoms|6 atoms|2 atoms/)
  await editor.getByRole('button',{name:'Keep editing',exact:true}).click()
  assert.equal(await editor.getByRole('spinbutton',{name:'X coordinate'}).inputValue(),'0.5')
  await drop('dropped.cif',crystalText)
  await editor.getByRole('button',{name:'Discard and open',exact:true}).click()
  await editor.locator('header strong').filter({hasText:'dropped.cif'}).waitFor()
  assert.match(await editor.locator('footer').innerText(),/Imported copy.*6 atoms/)
  assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
  assert.equal(await page.evaluate(()=>window.testRecord.writes.length),1)
  assert.equal(await page.evaluate(()=>window.testRecord.resourceReads.some(uri=>uri.startsWith('catgo-import:'))),false)
  extraPassed.push('drop imports CIF','unsaved changes survive drop and Keep editing','import never writes the previous host file')
  await editor.getByRole('button',{name:'Export',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.exports.length===1)
  const exported=await page.evaluate(()=>window.testRecord.exports[0].contents[0].resource.text)
  assert.equal(parseDocument(exported,'dropped.cif').sites.length,6)
  await drop('unsupported.txt','not a structure')
  await editor.getByRole('alert').filter({hasText:'Supported files'}).waitFor()
  assert.match(await editor.locator('header strong').innerText(),/dropped.cif/)
  extraPassed.push('import exports a parseable copy','invalid drops preserve the open structure')
  await editor.getByLabel('Choose structure file').setInputFiles({name:'POSCAR',mimeType:'text/plain',buffer:Buffer.from(await readFile(resolve(root,'tests/fixtures/IrO2_bulk_test.poscar'),'utf8'))})
  await editor.locator('header strong').filter({hasText:'POSCAR'}).waitFor()
  assert.match(await editor.locator('footer').innerText(),/6 atoms/)
  extraPassed.push('file picker imports extensionless POSCAR')
  const cut=async()=>{
   await editor.getByRole('button',{name:'Build Tools',exact:true}).click()
   await editor.getByRole('button',{name:'Slab',exact:true}).click()
   const pane=editor.locator('.build-pane')
   await pane.getByText('Cutting Plane (hkl)',{exact:true}).waitFor()
   await pane.getByLabel('Use conventional cell', {exact:true}).uncheck()
   await pane.locator('.miller-field input').nth(0).fill('1')
   await pane.locator('.miller-field input').nth(1).fill('1')
   await pane.locator('.miller-field input').nth(2).fill('0')
   await pane.locator('.vacuum-row input[type="number"]').fill('15')
   assert.deepEqual(await pane.locator('.miller-field input').evaluateAll(inputs=>inputs.map(input=>Number(input.value))),[1,1,0])
   await pane.getByRole('button',{name:'Apply Cut',exact:true}).click({timeout:30000})
   await editor.locator('header strong').filter({hasText:'•'}).waitFor({timeout:30000})
   await pane.locator('.phase-indicator').filter({hasText:'Preview'}).waitFor({timeout:30000})
   await editor.getByRole('button',{name:'Build Tools',exact:true}).click()
   await pane.waitFor({state:'hidden',timeout:30000})
  }
  await cut()
  await editor.getByRole('button',{name:'Export',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.exports.length===2)
  const slabText=await page.evaluate(()=>window.testRecord.exports[1].contents[0].resource.text)
  const slab=parseDocument(slabText,'POSCAR')
  assert.ok(slab.sites.length>0)
  assert.ok(slab.lattice.matrix[2][2]>15)
  assert.ok(Math.abs(slab.lattice.matrix[2][0])<1e-5&&Math.abs(slab.lattice.matrix[2][1])<1e-5)
  const z=slab.sites.map(site=>site.xyz[2]),vacuumGap=slab.lattice.matrix[2][2]-(Math.max(...z)-Math.min(...z))
  assert.ok(vacuumGap>=15-1e-5)
  const surfaceArea=slab.lattice.volume/slab.lattice.matrix[2][2]
  const expectedArea=crystal.lattice.volume*Math.hypot(1/crystal.lattice.a,1/crystal.lattice.b)
  assert.ok(Math.abs(surfaceArea-expectedArea)<1e-5)
  slabChecks={miller:[1,1,0],useConventionalCell:false,atoms:slab.sites.length,cell:slab.lattice.matrix,vacuumGap,surfaceArea,expectedArea}
  assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
  await editor.getByRole('button',{name:'Undo',exact:true}).click()
  await editor.getByRole('button',{name:'Export',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.exports.length===3)
  const bulkAgain=parseDocument(await page.evaluate(()=>window.testRecord.exports[2].contents[0].resource.text),'POSCAR')
  assert.equal(bulkAgain.sites.length,crystal.sites.length)
  assert.ok(Math.abs(bulkAgain.lattice.volume-crystal.lattice.volume)<1e-5)
  await editor.getByRole('button',{name:'Redo',exact:true}).click()
  assert.equal(await page.evaluate(()=>window.testRecord.writes.length),1)
  const alerts=await editor.getByRole('alert').allTextContents()
  assert.deepEqual(alerts,[],alerts.join('; '))
  extraPassed.push('(110) slab generation through real WASM','surface-normal cell and 15 Å vacuum','slab exports and Undo restores bulk','slab never writes the previous host file')
  // Repeat on a fresh writable host crystal, proving that the asynchronous
  // build commit reaches the document and its version-checked Save pipeline.
  await page.evaluate(text=>{
   const record=window.testRecord;record.text=text;record.etag='crystal-v1';record.forceConflict=false
   document.getElementById('editor').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:{file:{name:'host-crystal.cif',resourceUri:'host-resource://fixture'}}}},'*')
  },crystalText)
  await editor.getByRole('button',{name:'Discard and open',exact:true}).click()
  await editor.locator('header strong').filter({hasText:'host-crystal.cif'}).waitFor()
  await cut()
  assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),true)
  await editor.getByRole('button',{name:'Save',exact:true}).click()
  await page.waitForFunction(()=>window.testRecord.writes.length===2)
  const savedSlab=await page.evaluate(()=>window.testRecord.writes[1])
  assert.equal(savedSlab.ifMatch,'crystal-v1')
  const savedStructure=parseDocument(savedSlab.text,'host-crystal.cif')
  assert.equal(savedStructure.sites.length,slab.sites.length)
  assert.ok(Math.abs(savedStructure.lattice.volume-slab.lattice.volume)<1e-4)
  assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
  assert.deepEqual(await editor.getByRole('alert').allTextContents(),[])
  extraPassed.push('host-opened crystal slab commits through version-checked Save')
 }
 const directory=resolve(root,'preview');await mkdir(directory,{recursive:true})
  const suffix=process.env.CATGO_EDITOR_TEST_BOUNDARY_BONDS ? '-boundary-bonds' : process.env.CATGO_EDITOR_TEST_PERIODIC_SELECTION ? '-periodic-selection' : process.env.CATGO_EDITOR_TEST_CONVENTIONAL_LAYERS ? '-conventional-layers' : process.env.CATGO_EDITOR_TEST_SLAB_BONDS ? '-slab-bonds' : process.env.CATGO_EDITOR_TEST_IMPORT_AND_SLAB ? '-import-slab' : fixture ? '-'+filename.replace(/[^A-Za-z0-9_.-]/g,'_') : process.env.CATGO_EDITOR_TEST_HIDDEN_CONSTRUCTOR ? '-hidden-constructor' : process.env.CATGO_EDITOR_TEST_NO_GPU ? '-unavailable-gpu' : process.env.CATGO_EDITOR_TEST_NARROW ? '-narrow' : ''
 await page.screenshot({path:resolve(directory,'editor-acceptance'+suffix+'.png'),fullPage:false})
 // A denied or incomplete program must produce a visible error, not a blank panel.
 await page.goto(`http://127.0.0.1:${server.address().port}/?missing-resource`,{waitUntil:'domcontentloaded'})
 await page.frameLocator('#editor').getByRole('alert').filter({hasText:'Missing program resource'}).waitFor()
 await writeFile(resolve(directory,process.env.CATGO_EDITOR_TEST_BOUNDARY_BONDS ? 'browser-boundary-bonds.json' : process.env.CATGO_EDITOR_TEST_PERIODIC_SELECTION ? 'browser-periodic-selection.json' : process.env.CATGO_EDITOR_TEST_CONVENTIONAL_LAYERS ? 'browser-conventional-layers.json' : process.env.CATGO_EDITOR_TEST_SLAB_BONDS ? 'browser-slab-bonds.json' : process.env.CATGO_EDITOR_TEST_IMPORT_AND_SLAB ? 'browser-import-slab.json' : fixture ? 'browser-'+filename+'.json' : process.env.CATGO_EDITOR_TEST_HIDDEN_CONSTRUCTOR ? 'browser-hidden-constructor.json' : process.env.CATGO_EDITOR_TEST_NO_GPU ? 'browser-unavailable-gpu.json' : process.env.CATGO_EDITOR_TEST_NARROW ? 'browser-narrow-acceptance.json' : 'browser-acceptance.json'),JSON.stringify({host:'protocol test harness',nativeCodexHostVerified:false,fixture:filename,atoms:initial.sites.length,cellVolume:initial.lattice?.volume,entryBytes:Buffer.byteLength(html),programResources:manifest.chunks.length,renderedPixels:pixels,slabChecks,previewBondChecks,conventionalLayerChecks,selectionChecks,boundaryBondChecks,passed:['small UI entry','program loading through MCP resources','single SDK initialization','buffered file-open input','opaque-origin sandbox and CSP','host file read',process.env.CATGO_EDITOR_TEST_NO_GPU ? 'unavailable graphics API is reported; editing remains usable' : 'real CatGo 3D pixels rendered','coordinate edit','undo/redo','version-checked write','saved geometry reparses; atom count and cell preserved','conflict preserves edits',...extraPassed,'visible resource-loading failure'],pageErrors:errors},null,2))
 if(errors.length)throw Error(errors.join('; '))
 console.log('Browser acceptance passed: read → edit → undo/redo → save; external conflict preserves edits.')
} catch (error) {
 console.log(JSON.stringify({errors,frames:page ? await Promise.all(page.frames().map(async frame=>({url:frame.url(),text:(await frame.locator('body').innerText()).slice(0,700)}))) : []},null,2))
 if(page){await mkdir(resolve(root,'preview'),{recursive:true});await page.screenshot({path:resolve(root,'preview/editor-failure.png')})}
 throw error
} finally {
 if(browser)await browser.close()
 await new Promise(resolve=>server.close(resolve))
}
