/** Real editor/SDK with a protocol host matching both native Blob downloads
 * and the newer MCP contents contract. Downloads are saved and reparsed. */
import {createServer} from 'node:http'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {parseDocument} from './document.bundle.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(resolve(root,'ui/package.json'))
const {chromium}=require('@playwright/test')
const mode=process.argv[2]||'all'
const contract=process.argv[3]||'native'
assert.ok(['all','export','import-molecule','baseline-export','baseline-io','baseline-performance','large-performance'].includes(mode))
assert.ok(['native','spec','hybrid'].includes(contract))
const evidence=process.env.CATGO_TEST_EVIDENCE_DIR||resolve(root,'preview/file-actions')
const large=mode==='large-performance'
const fixtureName=large?'large.cif':'fixture.poscar'
const input=large ? 'data_large\n_cell_length_a 60\n_cell_length_b 60\n_cell_length_c 60\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\n_symmetry_space_group_name_H-M \'P 1\'\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n_atom_site_occupancy\n'+Array.from({length:201},(_,i)=>'Si'+(i+1)+' Si '+[0.2+(i%8)*0.06,0.2+(Math.floor(i/8)%8)*0.06,0.2+Math.floor(i/64)*0.12].join(' ')+' '+(i===0?'0.5':'1')).join('\n')+'\n' : 'private-free Si fixture\n1\n10 0 0\n0 10 0\n0 0 10\nSi\n2\nSelective dynamics\nDirect\n0.1 0.2 0.3 F T F\n0.3 0.4 0.5 T T F\n'
const html=await readFile(resolve(root,'assets/editor.html'),'utf8')
const manifest=JSON.parse(await readFile(resolve(root,'assets/program-manifest.json'),'utf8'))
const resources=Object.fromEntries(await Promise.all(manifest.chunks.map(async c=>[c.uri,{uri:c.uri,mimeType:'application/octet-stream',blob:(await readFile(resolve(root,'assets/program',c.filename))).toString('base64')}])) )
const host=`<!doctype html><html><body style="margin:0"><iframe id="editor" sandbox="allow-scripts" style="width:100vw;height:100vh;border:0" src="/editor"></iframe><script>
const record={events:[],text:${JSON.stringify(input)},etag:'v1',writes:[],downloads:[],mode:${JSON.stringify(contract)}};window.testRecord=record;
const trace=(event,detail={})=>record.events.push({event,at:performance.now(),...detail});
const frame=document.getElementById('editor');
const send=message=>frame.contentWindow.postMessage({jsonrpc:'2.0',...message},'*');
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow)return;
 const message=event.data;
 if(message.method==='ui/notifications/initialized'){send({method:'ui/notifications/tool-input',params:{arguments:{file:{name:${JSON.stringify(fixtureName)},resourceUri:'host-resource://fixture'}}}});return;}
 if(!('id' in message))return;
 let result;
 if(message.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostInfo:{name:'Codex compatibility test host',version:'1'},hostCapabilities:{...(['spec','hybrid'].includes(record.mode)?{downloadFile:{}}:{}),serverResources:{},experimental:{'openai/resource':{}}},hostContext:{theme:'light',displayMode:'fullscreen'}};
 else if(message.method==='resources/read'&&message.params.uri.startsWith('catgo-assets://'))result={contents:[await(await fetch('/resource?uri='+encodeURIComponent(message.params.uri))).json()]};
 else if(message.method==='resources/read')result={contents:[{uri:'host-resource://fixture',text:record.text,mimeType:'text/plain',_meta:{'openai/resource':{writable:true,etag:record.etag}}}]};
 else if(message.method==='resources/subscribe'||message.method==='resources/unsubscribe')result={};
 else if(message.method==='openai/resources/write'){record.writes.push(message.params);record.text=message.params.text;record.etag='v'+(record.writes.length+1);result={outcome:'saved',etag:record.etag};}
 else if(message.method==='ui/download-file'){
  trace('download-request',{id:message.id,mode:record.mode});
  if(record.mode==='denied'){send({id:message.id,result:{isError:true}});return;}
  if(record.mode==='unsupported'){send({id:message.id,error:{code:-32601,message:'Downloads unavailable'}});return;}
  let blob,name;
  if(record.mode==='spec'){
   const resource=message.params.contents?.[0]?.resource;
   if(!resource?.text){send({id:message.id,error:{code:-32602,message:'Expected contents'}});return;}
   blob=new Blob([resource.text],{type:resource.mimeType});name=decodeURIComponent(new URL(resource.uri).pathname.split('/').pop());
  }else{
   ({blob,name}=message.params);
   if(!(blob instanceof Blob)||typeof name!=='string'){send({id:message.id,error:{code:-32602,message:'Expected native Blob and name'}});return;}
  }
  trace('blob-read-start',{name,bytes:blob.size});
  record.downloads.push({name,text:await blob.text()});trace('blob-read-end',{name});
  const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;document.body.append(link);link.click();trace('download-dispatched',{name});link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);result={};
 }else{send({id:message.id,error:{code:-32601,message:'Unsupported test method'}});return;}
 send({id:message.id,result});
});
</script></body></html>`
const server=createServer((request,response)=>{
 const url=new URL(request.url,'http://localhost');
 if(url.pathname==='/resource'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(resources[url.searchParams.get('uri')]));return;}
 response.setHeader('Content-Type','text/html');
 if(url.pathname==='/editor')response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src data: blob:; worker-src blob:; frame-src 'none'");
 response.end(url.pathname==='/editor'?html:host);
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser,page
const errors=[],passed=[],downloadTimings=[]
let renderingChecks
async function downloadAfterClick(button){
 // Listen before dispatch so an immediate download cannot be lost. Start the
 // bounded download wait after the real click: actionability/renderer delays
 // must not consume the download deadline before the request is even sent.
 let onDownload,timer
 const observed=new Promise(resolve=>{onDownload=resolve;page.on('download',onDownload)})
 const started=Date.now()
 try{
  await button.click({noWaitAfter:true})
  const clicked=Date.now()
  const file=await Promise.race([observed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('No download event within 30 seconds after Export click')),30000)})])
  downloadTimings.push({clickMilliseconds:clicked-started,downloadMilliseconds:Date.now()-clicked,name:file.suggestedFilename()})
  return file
 }finally{clearTimeout(timer);page.off('download',onDownload)}
}
try{
 browser=await chromium.launch({...(process.env.CATGO_TEST_BROWSER?{executablePath:process.env.CATGO_TEST_BROWSER}:{}),headless:true,args:['--no-sandbox']})
 page=await browser.newPage({viewport:{width:960,height:720},acceptDownloads:true})
 page.on('pageerror',error=>errors.push(error.message))
 await page.addInitScript(()=>Object.defineProperty(Navigator.prototype,'gpu',{get:()=>undefined,configurable:true}))
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'})
 const editor=page.frameLocator('#editor')
 await editor.getByRole('button',{name:'Edit atom coordinates',exact:true}).waitFor({timeout:30000})
 await editor.locator('canvas[data-render-active="true"]').waitFor()
 await editor.getByRole('button',{name:'Edit atom coordinates',exact:true}).click()
 await editor.getByRole('spinbutton',{name:'X coordinate'}).fill('1.25')
 await editor.getByRole('button',{name:'Apply coordinates',exact:true}).click()
 await mkdir(evidence,{recursive:true})
 if(mode==='baseline-export'||mode==='export'||mode==='all'){
  const file=await downloadAfterClick(editor.getByRole('button',{name:'Export',exact:true}))
  const path=resolve(evidence,'native-export.poscar');await file.saveAs(path)
  const parsed=parseDocument(await readFile(path,'utf8'),'copy.poscar')
  assert.equal(parsed.sites.length,2);assert.ok(Math.abs(parsed.sites[0].xyz[0]-1.25)<1e-7)
  assert.deepEqual(parsed.lattice.matrix,[[10,0,0],[0,10,0],[0,0,10]])
  assert.deepEqual(parsed.sites.map(s=>s.properties.selective_dynamics),[[false,true,false],[true,true,false]])
  assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),true)
  assert.equal(await page.evaluate(()=>window.testRecord.writes.length),0)
  await editor.getByRole('status').filter({hasText:/[Ee]xport|[Dd]ownload/}).waitFor()
  passed.push('host-mediated download creates a reparsable edited POSCAR and preserves dirty state/constraints')
 }
 if(mode==='baseline-io'||mode==='all'){
  await editor.locator('.struct-toolbar-tooltip-wrap').filter({hasText:'Import / Export'}).getByRole('button').click()
  const pane=editor.getByRole('region',{name:'Import / Export',exact:true})
  await pane.waitFor({timeout:5000})
  await pane.getByLabel('Export format',{exact:true}).selectOption('cif')
  const file=await downloadAfterClick(pane.getByRole('button',{name:'Export file',exact:true}));const path=resolve(evidence,'toolbar-export.cif');await file.saveAs(path)
  const parsed=parseDocument(await readFile(path,'utf8'),'copy.cif')
  assert.equal(parsed.sites.length,2);assert.ok(Math.abs(parsed.sites[0].xyz[0]-1.25)<1e-6)
  assert.ok(Math.abs(parsed.lattice.volume-1000)<1e-6)
  await pane.getByText('CIF retains geometry and cell.',{exact:false}).waitFor()
  await pane.getByLabel('Export format',{exact:true}).selectOption('xyz')
  const filenameInput=pane.getByLabel('Export file name',{exact:true})
  const downloadsBeforeInvalidName=await page.evaluate(()=>window.testRecord.downloads.length)
  for(const [name,message] of [['../outside.extxyz','without a folder path'],['wrong.poscar','extension must match']]){
   await filenameInput.fill(name)
   await pane.getByRole('button',{name:'Export file',exact:true}).click()
   await editor.getByRole('alert').filter({hasText:message}).waitFor()
   assert.equal(await page.evaluate(()=>window.testRecord.downloads.length),downloadsBeforeInvalidName)
  }
  await filenameInput.fill('fixture-copy.extxyz')
  const xyzFile=await downloadAfterClick(pane.getByRole('button',{name:'Export file',exact:true}));const xyzPath=resolve(evidence,'periodic-export.extxyz');await xyzFile.saveAs(xyzPath)
  const xyzParsed=parseDocument(await readFile(xyzPath,'utf8'),'copy.extxyz')
  assert.equal(xyzParsed.sites.length,2);assert.ok(Math.abs(xyzParsed.sites[0].xyz[0]-1.25)<1e-7)
  assert.deepEqual(xyzParsed.lattice.matrix,[[10,0,0],[0,10,0],[0,0,10]])
  assert.deepEqual(xyzParsed.sites.map(s=>s.properties.selective_dynamics),[[false,true,false],[true,true,false]])
  await page.screenshot({path:resolve(evidence,'file-actions-success.png')})
  await pane.getByRole('button',{name:'Close Import / Export',exact:true}).click()
  await pane.waitFor({state:'hidden'})
  passed.push('toolbar opens/closes, converts CIF/extXYZ, preserves periodic constraints and rejects invalid copy names')
  await editor.locator('.struct-toolbar-tooltip-wrap').filter({hasText:'Import / Export'}).getByRole('button').click()
  await pane.getByRole('button',{name:'More formats…',exact:true}).click()
  await pane.waitFor({state:'hidden'})
  const exportPane=editor.locator('.io-pane')
  await exportPane.waitFor({timeout:5000})
  // Imports belong to the guarded file actions above, not CatGo's own pane.
  assert.equal(await exportPane.getByRole('button',{name:/^(Import|Open File|Paste Content)$/}).count(),0)
  const catgoFile=await downloadAfterClick(exportPane.locator('.export-item',{hasText:/^CIF/}).getByTitle('Download',{exact:true}))
  const catgoPath=resolve(evidence,'catgo-pane-export.cif');await catgoFile.saveAs(catgoPath)
  const catgoParsed=parseDocument(await readFile(catgoPath,'utf8'),'copy.cif')
  assert.equal(catgoParsed.sites.length,2);assert.ok(Math.abs(catgoParsed.sites[0].xyz[0]-1.25)<1e-6)
  assert.equal(await page.evaluate(()=>window.testRecord.writes.length),0)
  await exportPane.getByRole('button',{name:'Close pane',exact:true}).click()
  await exportPane.waitFor({state:'hidden'})
  passed.push('More formats opens CatGo\'s export-only pane, whose downloads use the same host contract')
 }
 if(mode==='baseline-performance'||mode==='large-performance'||mode==='all'){
  const button=editor.locator('.struct-toolbar-tooltip-wrap').filter({has:editor.locator('svg')}).filter({hasText:/[Ll]arge-system|[Ff]aster rendering/}).getByRole('button')
  assert.equal(await button.isEnabled(),true,'The performance control must work without WebGPU')
  const canvas=editor.locator('canvas[data-render-active="true"]')
  const wedgeSegments=()=>canvas.evaluate(c=>{
   const widths=[];c.__scene.traverse(o=>{const p=o.geometry?.parameters;if(o.geometry?.type==='SphereGeometry'&&p?.phiLength>0&&p.phiLength<2*Math.PI-1e-6)widths.push(p.widthSegments)})
   return [...new Set(widths)].sort((a,b)=>a-b)
  })
  const initialWedges=large?await wedgeSegments():[]
  if(large)assert.ok(initialWedges.length>0,'The large fixture must render a real partial-occupancy sphere')
  const qualityDpr=await canvas.evaluate(c=>c.__renderer.getPixelRatio())
  await button.click()
  await page.waitForFunction(()=>document.getElementById('editor')!==null)
  assert.equal(await button.getAttribute('aria-pressed'),'true')
  const frame=page.frames().find(f=>f.url().endsWith('/editor'))
  await frame.waitForFunction(()=>document.querySelector('canvas[data-render-active="true"]')?.__renderer?.getPixelRatio()===1,null,{timeout:5000})
  await canvas.evaluate(c=>c.__renderer.render(c.__scene,c.__camera))
  const fastDpr=await canvas.evaluate(c=>c.__renderer.getPixelRatio())
  assert.ok(fastDpr<qualityDpr,JSON.stringify({qualityDpr,fastDpr}))
  await button.click()
  assert.equal(await button.getAttribute('aria-pressed'),'false')
  await frame.waitForFunction(ratio=>Math.abs(document.querySelector('canvas[data-render-active="true"]')?.__renderer?.getPixelRatio()-ratio)<1e-6,qualityDpr,{timeout:5000})
  const restored=await canvas.evaluate(c=>c.__renderer.getPixelRatio())
  assert.ok(Math.abs(restored-qualityDpr)<1e-6)
  if(large)assert.deepEqual(await wedgeSegments(),initialWedges,'Leaving speed mode must restore partial-occupancy sphere geometry quality')
  renderingChecks={qualityDpr,fastDpr,restoredDpr:restored,atoms:large?201:2,partialSphereSegmentsBefore:initialWedges,partialSphereSegmentsAfter:large?await wedgeSegments():[]}
  assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),true)
  passed.push('WebGL performance toggle changes and restores real drawing-buffer quality without editing the document')
 }
 if(mode==='all'||mode==='import-molecule'){
  await editor.getByRole('button',{name:'Undo',exact:true}).click()
  await editor.getByRole('button',{name:'Edit atom coordinates',exact:true}).click()
  assert.equal(Number(await editor.getByRole('spinbutton',{name:'X coordinate'}).inputValue()),1)
  await editor.getByRole('button',{name:'Redo',exact:true}).click()
  await editor.getByRole('button',{name:'Edit atom coordinates',exact:true}).click()
  assert.equal(Number(await editor.getByRole('spinbutton',{name:'X coordinate'}).inputValue()),1.25)
  const importPath=resolve(evidence,'import-molecule.xyz')
  await writeFile(importPath,'3\nwater\nO 0 0 0\nH 0.9572 0 0\nH -0.239 0.927 0\n')
  const filePane=editor.getByRole('region',{name:'Import / Export',exact:true})
  const chooseImport=async()=>{
   await editor.getByRole('button',{name:'Import / Export',exact:true}).click()
   const chooser=page.waitForEvent('filechooser')
   await filePane.getByRole('button',{name:'Open structure file…',exact:true}).click()
   await (await chooser).setFiles(importPath)
   await editor.getByRole('alertdialog',{name:'Unsaved changes',exact:true}).waitFor()
  }
  await chooseImport()
  await editor.getByRole('button',{name:'Keep editing',exact:true}).click()
  assert.equal(Number(await editor.getByRole('spinbutton',{name:'X coordinate'}).inputValue()),1.25)
  assert.equal(await editor.getByRole('button',{name:'Undo',exact:true}).isEnabled(),true)
  await filePane.getByRole('button',{name:'Close Import / Export',exact:true}).click()
  passed.push('toolbar file chooser preserves unsaved edits and history when Keep editing is chosen')
  for(const failure of (mode==='all'?['denied','unsupported']:[])){
   const count=await page.evaluate(()=>window.testRecord.downloads.length)
   await page.evaluate(value=>{window.testRecord.mode=value},failure)
   await editor.getByRole('button',{name:'Export',exact:true}).click()
   await editor.getByRole('alert').waitFor({timeout:5000})
   assert.equal(await page.evaluate(()=>window.testRecord.downloads.length),count)
   assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),true)
   assert.equal(await editor.getByRole('button',{name:'Undo',exact:true}).isEnabled(),true)
  }
  if(mode==='all')passed.push('cancelled/unsupported exports report errors and preserve unsaved coordinates and history')
  await page.evaluate(()=>{window.testRecord.mode='native'})
  await chooseImport()
  await editor.getByRole('button',{name:'Discard and open',exact:true}).click()
  await editor.locator('header strong').filter({hasText:'import-molecule.xyz'}).waitFor()
  assert.equal(await editor.getByRole('button',{name:'Save',exact:true}).isEnabled(),false)
  await editor.getByRole('button',{name:'Import / Export',exact:true}).click()
  // Playwright 1.56 disabled-state checks retarget an option to its enclosing
  // label.control (the enabled select). Read the real option property instead.
  assert.equal(await filePane.getByRole('option',{name:'CIF',exact:true}).evaluate(option=>option.disabled),true)
  assert.equal(await filePane.getByRole('option',{name:'POSCAR',exact:true}).evaluate(option=>option.disabled),true)
  const moleculeFile=await downloadAfterClick(filePane.getByRole('button',{name:'Export file',exact:true}));const path=resolve(evidence,'imported-export.extxyz');await moleculeFile.saveAs(path)
  const molecule=parseDocument(await readFile(path,'utf8'),'molecule.extxyz')
  assert.equal(molecule.sites.length,3);assert.equal(molecule.sites[0].species[0].element,'O');assert.ok(!molecule.lattice)
  assert.equal(await page.evaluate(()=>window.testRecord.writes.length),0)
  passed.push('explicit Discard opens an imported copy; molecule export works and cell-only formats are unavailable')
 }
 assert.deepEqual(errors,[])
 await page.screenshot({path:resolve(evidence,'file-actions-final.png')})
 const result={programSha256:manifest.sha256,mode,contract,passed,renderingChecks,downloadTimings,downloadEvents:await page.evaluate(()=>window.testRecord.events),errors};await writeFile(resolve(evidence,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}catch(error){
 if(page)console.error(JSON.stringify({errors,downloadTimings,downloadEvents:await page.evaluate(()=>window.testRecord.events).catch(()=>[]),frames:await Promise.all(page.frames().map(async frame=>({url:frame.url(),text:(await frame.locator('body').innerText().catch(()=>'')),options:await frame.locator('option').evaluateAll(es=>es.map(e=>({text:e.textContent,value:e.value,disabled:e.disabled}))).catch(()=>[])})))},null,2))
 throw error
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
