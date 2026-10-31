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

test('extXYZ restores per-axis movement flags without inventing forces from logical columns',() => {
  const text='2\nLattice="10 0 0 0 10 0 0 0 10" Properties="species:S:1:pos:R:3:move_mask:L:1:selective_dynamics:L:3" pbc="T T T"\nSi 1.25 2 3 1 0 1 0\nSi 3 4 5 T T T F\n'
  const parsed=parseDocument(text,'copy.extxyz')
  assert.deepEqual(parsed.sites.map(s=>s.properties.selective_dynamics),[[false,true,false],[true,true,false]])
  assert.deepEqual(parsed.sites.map(s=>s.properties.move_mask),[true,true])
  assert.equal(parsed.sites[0].properties.force,undefined)
  const poscar=parseDocument(serializeDocument(parsed,'poscar'),'copy.poscar')
  assert.deepEqual(poscar.sites.map(s=>s.properties.selective_dynamics),[[false,true,false],[true,true,false]])
})

test('unquoted extXYZ metadata retains forces and movement flags at their declared offsets',() => {
  const text='1\nProperties=species:S:1:pos:R:3:forces:R:3:selective_dynamics:L:3:move_mask:L:1\nO 0 0 0 0.1 -0.2 0.3 true false true true\n'
  const parsed=parseDocument(text,'molecule.extxyz')
  assert.deepEqual(parsed.sites[0].properties.force,[0.1,-0.2,0.3])
  assert.deepEqual(parsed.sites[0].properties.selective_dynamics,[true,false,true])
  assert.equal(parsed.sites[0].properties.move_mask,true)
  assert.equal(parsed.lattice,undefined)
})

test('invalid or contradictory extXYZ constraints cannot replace the edited document',() => {
  for(const flags of ['yes F T T','F F F T']){
    const state=open();state.move(0,[0.1,0,0]);const before=JSON.stringify(state.structure)
    const text='1\nProperties="species:S:1:pos:R:3:selective_dynamics:L:3:move_mask:L:1"\nO 0 0 0 '+flags+'\n'
    assert.throws(()=>state.load({name:'invalid.extxyz',resourceUri:'host-resource://invalid'},{text,writable:true,etag:'v2'}),/constraint|movement|logical/i)
    assert.equal(JSON.stringify(state.structure),before);assert.equal(state.dirty,true)
    assert.equal(state.file.resourceUri,'host-resource://water')
  }
})

test('extXYZ supports whole-atom masks and per-axis constraints independently',() => {
  const masked=parseDocument('2\nProperties="species:S:1:pos:R:3:move_mask:L:1"\nO 0 0 0 F\nH 1 0 0 T\n','masks.extxyz')
  assert.deepEqual(masked.sites.map(s=>s.properties.selective_dynamics),[[false,false,false],[true,true,true]])
  const axes=parseDocument('2\nProperties="species:S:1:pos:R:3:selective_dynamics:L:3"\nO 0 0 0 F T F\nH 1 0 0 F F F\n','axes.extxyz')
  assert.deepEqual(axes.sites.map(s=>s.properties.move_mask),[true,false])
  assert.deepEqual(axes.sites.map(s=>s.properties.selective_dynamics),[[false,true,false],[false,false,false]])
})

test('ASE axis masks and QUIP integer movement masks retain the same physical constraints',() => {
  for(const [layout,values,want,movable] of [
    ['move_mask:L:3','F T F',[false,true,false],true],
    ['move_mask:I:1','0',[false,false,false],false],
    ['move_mask:I:3','0 1 0',[false,true,false],true],
  ]){
    const parsed=parseDocument('1\nProperties=species:S:1:pos:R:3:'+layout+'\nO 0 0 0 '+values+'\n','mask.extxyz')
    assert.deepEqual(parsed.sites[0].properties.selective_dynamics,want)
    assert.equal(parsed.sites[0].properties.move_mask,movable)
  }
})

test('integer masks reject non-binary values and duplicate axis masks must agree',() => {
  for(const text of [
    '1\nProperties=species:S:1:pos:R:3:move_mask:I:1\nO 0 0 0 2\n',
    '1\nProperties=species:S:1:pos:R:3:selective_dynamics:L:3:move_mask:L:3\nO 0 0 0 T F F F T F\n',
  ])assert.throws(()=>parseDocument(text,'invalid.extxyz'),/constraint|movement|logical/i)
})
