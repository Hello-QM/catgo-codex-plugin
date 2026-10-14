import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {EditorDocument,parseDocument,serializeDocument} from './document.bundle.mjs'

const xyz = '3\nwater\nO 0 0 0\nH 0.9572 0 0\nH -0.239 0.927 0\n'
const file = {name:'water.xyz',resourceUri:'host-resource://water'}
function open() { const state = new EditorDocument(); state.load(file,{text:xyz,writable:true,etag:'v1'}); return state }

test('manual coordinate edits can be undone and saved with the original version',async () => {
  const state = open()
  state.move(0,[0.2,0,0]); assert.equal(state.dirty,true)
  state.undo(); assert.equal(state.dirty,false)
  state.redo(); assert.equal(state.structure.sites[0].xyz[0],0.2)
  let saved
  const result = await state.save({write:async (uri,text,etag) => {saved={uri,text,etag};return {outcome:'saved',etag:'v2'}}})
  assert.equal(result.outcome,'saved'); assert.equal(saved.etag,'v1')
  assert.equal(saved.uri,file.resourceUri)
  assert.equal(parseDocument(saved.text,file.name).sites[0].xyz[0],0.2)
  assert.equal(state.dirty,false); assert.equal(state.etag,'v2')
})
test('save conflict preserves unsaved edits and prevents an unconditional retry',async () => {
  const state=open();state.move(0,[0.4,0,0])
  await state.save({write:async () => ({outcome:'conflict',etag:'external-v2'})})
  assert.equal(state.structure.sites[0].xyz[0],0.4)
  assert.equal(state.etag,'v1');assert.equal(state.dirty,true);assert.equal(state.canSave,false)
})
test('an edit during a pending save remains dirty',async () => {
  const state=open();state.move(0,[0.1,0,0]);let complete
  const pending=state.save({write:() => new Promise(resolve => {complete=resolve})})
  state.move(1,[1.2,0,0]);complete({outcome:'saved',etag:'v2'});await pending
  assert.equal(state.dirty,true);assert.equal(state.structure.sites[1].xyz[0],1.2)
})
test('switching documents during a save does not replace the new file version',async () => {
  const state=open();state.move(0,[0.1,0,0]);let complete
  const pending=state.save({write:() => new Promise(resolve => {complete=resolve})})
  state.load({name:'other.xyz',resourceUri:'host-resource://other'},{text:xyz,writable:true,etag:'other-v1'})
  complete({outcome:'saved',etag:'old-v2'});await pending
  assert.equal(state.etag,'other-v1');assert.equal(state.dirty,false)
})
test('read-only files and files without a version token cannot be overwritten',async () => {
  for (const value of [{text:xyz,writable:false,etag:'v1'},{text:xyz,writable:true}]) {
    const state=new EditorDocument();state.load(file,value);state.move(0,[0.1,0,0])
    assert.equal(state.canSave,false)
    await assert.rejects(state.save({write:async () => {throw Error('must not be called')}}))
  }
})
test('invalid files and trajectories do not silently replace the open structure',() => {
  const state=open();state.move(0,[0.1,0,0]);const before=JSON.stringify(state.structure)
  assert.throws(() => state.load(file,{text:xyz+xyz,writable:true,etag:'v2'}),/multiple frames/)
  assert.equal(JSON.stringify(state.structure),before)
  assert.throws(() => state.move(0,[NaN,0,0]),/finite/)
})
test('POSCAR and CIF preserve a tilted periodic cell and coordinate round trips',() => {
  const poscar='test\n1\n3 0 0\n0.5 4 0\n0.2 0.3 5\nCu\n1\nDirect\n0.2 0.3 0.4\n'
  const state=new EditorDocument();state.load({name:'test.poscar',resourceUri:'host-resource://periodic'},{text:poscar,writable:true,etag:'v1'})
  state.move(0,[1,2,3])
  for (const [format,name] of [['cif','test.cif'],['poscar','test.poscar']]) {
    const parsed=parseDocument(serializeDocument(state.structure,format),name)
    parsed.sites[0].xyz.forEach((value,index) => assert.ok(Math.abs(value-[1,2,3][index])<1e-5))
    assert.ok(Math.abs(parsed.lattice.volume-state.structure.lattice.volume)<1e-5)
  }
})

test('IrO2 bulk opens in POSCAR and CIF with all sites and the same periodic cell',async () => {
  let reference
  for(const name of ['IrO2_bulk_test.poscar','IrO2_bulk_test.cif']){
    const text=await readFile(new URL('fixtures/'+name,import.meta.url),'utf8')
    const parsed=parseDocument(text,name)
    assert.equal(parsed.sites.length,6)
    const counts={};for(const site of parsed.sites)counts[site.species[0].element]=(counts[site.species[0].element]||0)+1
    assert.deepEqual(counts,{Ir:2,O:4})
    assert.ok(Math.abs(parsed.lattice.volume-64.48031649722306)<1e-5)
    const matrix=parsed.lattice.matrix
    for(let row=0;row<3;row++)for(let col=0;col<3;col++)assert.ok(Math.abs(matrix[row][col]-(row===col ? [3.17670624,4.50531387,4.50531387][row] : 0))<1e-6)
    if(reference)parsed.sites.forEach((site,index)=>site.xyz.forEach((value,axis)=>assert.ok(Math.abs(value-reference.sites[index].xyz[axis])<1e-6)))
    reference=parsed
  }
})

test('non-orthogonal CIF expands explicit inversion symmetry and survives export',async () => {
  const text=await readFile(new URL('fixtures/triclinic_symmetry_test.cif',import.meta.url),'utf8')
  const parsed=parseDocument(text,'triclinic_symmetry_test.cif')
  assert.equal(parsed.sites.length,2)
  for(const [index,abc] of [[0,[0.2,0.3,0.4]],[1,[0.8,0.7,0.6]]])parsed.sites[index].abc.forEach((value,axis)=>assert.ok(Math.abs(value-abc[axis])<1e-9))
  assert.ok(Math.abs(parsed.lattice.alpha-80)<1e-6)
  assert.ok(Math.abs(parsed.lattice.beta-100)<1e-6)
  assert.ok(Math.abs(parsed.lattice.gamma-110)<1e-6)
  for(const format of ['cif','poscar']){
    const reopened=parseDocument(serializeDocument(parsed,format),'roundtrip.'+format)
    assert.equal(reopened.sites.length,2)
    assert.ok(Math.abs(reopened.lattice.volume-parsed.lattice.volume)<1e-5)
    reopened.sites.forEach((site,index)=>site.xyz.forEach((value,axis)=>assert.ok(Math.abs(value-parsed.sites[index].xyz[axis])<1e-5)))
  }
})
