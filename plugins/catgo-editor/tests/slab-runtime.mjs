import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkSlabAlignment } from '../scripts/check-slab-alignment.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const sourceRoot=process.env.CATGO_SOURCE_ROOT || resolve(root,'../../vendor/catgo')
const provenance=await checkSlabAlignment()
const mod=await import(pathToFileURL(resolve(sourceRoot,'extensions/rust-wasm/pkg/ferrox.js')))
await mod.default({module_or_path:await readFile(provenance.wasmPath)})
const crystal=(a,b,c,atoms)=>({lattice:{matrix:[[a,0,0],[0,b,0],[0,0,c]],a,b,c,alpha:90,beta:90,gamma:90,volume:a*b*c,pbc:[true,true,true]},sites:atoms.map(([element,...abc])=>({species:[{element,occu:1}],abc,xyz:abc.map((v,i)=>v*[a,b,c][i]),label:element,properties:{}}))})
const u=0.3053
const rutile=crystal(4.4919,4.4919,3.1066,[['Ru',0,0,0],['Ru',.5,.5,.5],['O',u,u,0],['O',1-u,1-u,0],['O',.5+u,.5-u,.5],['O',.5-u,.5+u,.5]])
const pure=crystal(4,4,4,[['Si',0,0,0]])
const oxide=crystal(3.788512,3.788512,3.788512,[['Fe',0,0,0],['Fe',.5,.5,.5],['O',.5,0,.5],['O',0,.5,.5],['O',.5,.5,0]])
const cases=[]
const unwrap=result=>{assert.ok('ok' in result,JSON.stringify(result));return JSON.parse(result.ok)}
const count=(slab,element)=>slab.sites.filter(site=>site.species[0].element===element).length
const invariant=(slab,vacuum=15)=>{
 assert.ok(slab.sites.length>0)
 assert.ok(slab.sites.every(site=>site.xyz.every(Number.isFinite)))
 const zs=slab.sites.map(site=>site.xyz[2])
 assert.ok(Math.abs(slab.lattice.matrix[2][2]-Math.max(...zs)+Math.min(...zs)-vacuum)<1e-6)
 assert.ok(Math.abs(slab.lattice.matrix[2][0])+Math.abs(slab.lattice.matrix[2][1])<1e-6)
}

// These fixtures and properties are the reviewed catgo-dev slab.rs regressions,
// executed against the exact scalar module embedded in the editor.
for(const hkl of [[1,1,0],[1,0,0],[0,0,1]]) for(const n of [2,3,4]){
 const slab=unwrap(mod.generate_slab_layers(JSON.stringify(rutile),...hkl,n,0,15,1,1))
 invariant(slab);assert.equal(count(slab,'O'),2*count(slab,'Ru'))
 cases.push({mode:'layers',hkl,n,termination:0,atoms:slab.sites.length})
}
const s4=unwrap(mod.generate_slab_layers(JSON.stringify(rutile),1,1,0,4,0,15,1,1))
const s6=unwrap(mod.generate_slab_layers(JSON.stringify(rutile),1,1,0,6,0,15,1,1))
assert.ok(s6.sites.length>s4.sites.length,'Requested extra layers must not be clamped')
const terminations=JSON.parse(mod.slab_termination_info(JSON.stringify(rutile),1,1,0))
assert.ok(terminations.length>1)
for(const termination of [0,1]){
 const slab=unwrap(mod.generate_slab_layers(JSON.stringify(rutile),1,1,0,3,termination,15,2,2))
 invariant(slab);assert.equal(count(slab,'O'),2*count(slab,'Ru'))
 cases.push({mode:'layers',hkl:[1,1,0],n:3,termination,supercell:[2,2],atoms:slab.sites.length})
}
for(const hkl of [[1,0,0],[0,1,0],[0,0,1]]){
 const slab=unwrap(mod.generate_slab(JSON.stringify(oxide),...hkl,0,10,15,'centered',1,1))
 invariant(slab);assert.ok(count(slab,'Fe')>0&&count(slab,'O')>0)
 cases.push({mode:'thickness',hkl,fixture:'Fe2O3',atoms:slab.sites.length})
}
for(const l of [4,5,17]){
 const slab=unwrap(mod.generate_slab(JSON.stringify(pure),0,1,l,.123,10,15,'centered',1,1))
 invariant(slab)
 const length=Math.hypot(1,l),m=slab.lattice.matrix
 const area=Math.abs(m[0][0]*m[1][1]-m[0][1]*m[1][0])
 assert.ok(Math.abs(area-16*length)<1e-6)
 assert.equal(slab.sites.length,Math.floor(5.133*length/4)-Math.ceil(-4.887*length/4)+1)
 cases.push({mode:'thickness',hkl:[0,1,l],fixture:'Si',atoms:slab.sites.length})
}
assert.ok('error' in mod.generate_slab(JSON.stringify(pure),0,0,0,0,10,15,'centered',1,1))
const version=JSON.parse(await readFile(resolve(root,'plugin.json'),'utf8')).version
const report={version,date:new Date().toISOString().slice(0,10),host:'direct scalar WASM verification',nativeCodexHostVerified:false,sourceAlignment:provenance,cases,passed:['17 upstream source checks','rutile (110)/(100)/(001) layer stoichiometry','extra layers are not clamped','termination selection','2×2 supercell','Fe2O3 cuts retain both species','high Miller indices preserve cell area and atom count','15 Å vacuum and finite coordinates','(000) rejected']}
delete report.sourceAlignment.wasmPath
await writeFile(resolve(root,'acceptance/slab-alignment.json'),JSON.stringify(report,null,2)+'\n')
console.log(`catgo-dev source alignment and ${cases.length} scalar WASM slab cases passed.`)
