import type { AnyStructure } from '$lib/structure'
import { parse_any_structure } from '$lib/structure/parsers/dispatch'
import { cart_to_frac } from '$lib/structure/parsers/dft-common'
import { structure_to_cif_str, structure_to_poscar_str, structure_to_xyz_str } from '$lib/structure/export'

export type Format = 'cif' | 'xyz' | 'poscar'
export type FileRef = { name: string; resourceUri: string }
export type ResourceValue = { text: string; writable: boolean; etag?: string }
export type WriteResult = { outcome: 'saved' | 'conflict' | 'too-large'; etag?: string; maxBytes?: number }
export interface FileBridge {
  read(uri: string): Promise<ResourceValue>
  write(uri: string, text: string, etag: string): Promise<WriteResult>
}

export function fileFormat(name: string): Format {
  if (/\.cif$/i.test(name)) return 'cif'
  if (/\.(xyz|extxyz)$/i.test(name)) return 'xyz'
  if (/\.(poscar|vasp)$/i.test(name) || /^(POSCAR|CONTCAR)$/i.test(name)) return 'poscar'
  throw new Error('Supported files: CIF, XYZ, extXYZ, POSCAR and VASP.')
}

export function parseDocument(text: string, name: string): AnyStructure {
  const format = fileFormat(name)
  if (format === 'xyz') {
    const lines = text.trimStart().split(/\r?\n/)
    const count = Number(lines[0]?.trim())
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid XYZ atom count.')
    if (lines.slice(count + 2).some(line => line.trim())) {
      throw new Error('This file contains multiple frames. Trajectory editing is not supported in this version.')
    }
  }
  const structure = parse_any_structure(text, name)
  if (!structure?.sites?.length) throw new Error('Could not parse the structure file.')
  if (structure.sites.length > 100000) throw new Error('This editor supports up to 100,000 atoms.')
  if (format === 'xyz' && structure.lattice) {
    const flags = text.split(/\r?\n/)[1]?.match(/\bpbc=["']([^"']+)["']/i)?.[1].split(/\s+/)
    if (flags?.length === 3) structure.lattice.pbc = flags.map(flag => /^(T|true|1)$/i.test(flag)) as [boolean, boolean, boolean]
  }
  validateStructure(structure)
  return structure
}

export function validateStructure(structure: AnyStructure): void {
  for (const site of structure.sites) {
    if (site.xyz.length !== 3 || !site.xyz.every(Number.isFinite)) throw new Error('Every atom needs three finite coordinates.')
  }
  if (structure.lattice) {
    if (!structure.lattice.matrix.flat().every(Number.isFinite) || Math.abs(structure.lattice.volume) < 1e-10) {
      throw new Error('The periodic cell must be finite and non-singular.')
    }
  }
}

export function serializeDocument(structure: AnyStructure, format: Format): string {
  validateStructure(structure)
  if (format === 'cif') {
    if (!structure.lattice) throw new Error('CIF requires a periodic cell. Export this molecule as XYZ instead.')
    return structure_to_cif_str(structure)
  }
  if (format === 'poscar') {
    if (!structure.lattice) throw new Error('POSCAR requires a periodic cell.')
    return structure_to_poscar_str(structure)
  }
  return structure_to_xyz_str(structure, true)
}

/** One file owns its history, version token and stable atom identities. */
export class EditorDocument {
  file?: FileRef
  structure?: AnyStructure
  originalText = ''
  etag?: string
  writable = false
  revision = 0
  savedRevision = 0
  conflict = false
  externalChange = false
  saving = false
  #highWater = 0
  #undo: AnyStructure[] = []
  #redo: AnyStructure[] = []
  #savedGeometry = ''
  get dirty() { return !!this.structure && JSON.stringify(this.structure) !== this.#savedGeometry }
  get canUndo() { return this.#undo.length > 0 }
  get canRedo() { return this.#redo.length > 0 }
  get canSave() { return this.dirty && this.writable && !!this.etag && !this.conflict && !this.saving }

  load(file: FileRef, value: ResourceValue): void {
    const structure = parseDocument(value.text, file.name)
    // Parse and validate before replacing any unsaved state.
    this.file = file
    this.structure = this.identify(structure)
    this.originalText = value.text
    this.etag = value.etag
    this.writable = value.writable
    this.revision++
    this.savedRevision = this.revision
    this.#savedGeometry = JSON.stringify(this.structure)
    this.conflict = false
    this.externalChange = false
    this.#undo = []
    this.#redo = []
  }

  identify(structure: AnyStructure): AnyStructure {
    const next = structuredClone(structure)
    const seen = new Set<number>()
    for (const site of next.sites) {
      const previous = site.properties?.catgo_editor_id
      const id = Number.isSafeInteger(previous) && !seen.has(previous) ? previous : ++this.#highWater
      this.#highWater = Math.max(this.#highWater, id)
      seen.add(id)
      site.properties = { ...site.properties, catgo_editor_id: id }
    }
    return next
  }

  edit(edited: AnyStructure): void {
    validateStructure(edited)
    const next = this.identify(edited)
    if (!this.structure || JSON.stringify(next) === JSON.stringify(this.structure)) return
    this.#undo.push(structuredClone(this.structure))
    if (this.#undo.length > 100) this.#undo.shift()
    this.#redo = []
    this.structure = next
    this.revision++
  }

  move(index: number, xyz: [number, number, number]): void {
    if (!this.structure?.sites[index]) throw new Error('Select an atom first.')
    if (!xyz.every(Number.isFinite)) throw new Error('Coordinates must be finite numbers.')
    const next = structuredClone(this.structure)
    next.sites[index].xyz = xyz
    next.sites[index].abc = next.lattice ? cart_to_frac(xyz, next.lattice.matrix) : [...xyz]
    this.edit(next)
  }

  undo(): void {
    const previous = this.#undo.pop()
    if (!previous || !this.structure) return
    this.#redo.push(structuredClone(this.structure))
    this.structure = previous
    this.revision++
  }
  redo(): void {
    const next = this.#redo.pop()
    if (!next || !this.structure) return
    this.#undo.push(structuredClone(this.structure))
    this.structure = next
    this.revision++
  }

  async save(bridge: FileBridge): Promise<WriteResult> {
    if (!this.file || !this.structure || !this.canSave || !this.etag) throw new Error('This file cannot be saved in place. A writable host resource with a version token is required.')
    const snapshot = structuredClone(this.structure)
    const geometry = JSON.stringify(snapshot)
    const revision = this.revision
    const file = this.file
    const text = serializeDocument(snapshot, fileFormat(file.name))
    this.saving = true
    try {
      const result = await bridge.write(file.resourceUri, text, this.etag)
      if (this.file !== file) return result
      if (result.outcome === 'saved') {
        this.etag = result.etag
        this.originalText = text
        this.#savedGeometry = geometry
        this.savedRevision = revision
        this.externalChange = false
      } else if (result.outcome === 'conflict') {
        // Preserve unsaved coordinates; never replace the version and retry.
        this.conflict = true
        this.externalChange = true
      }
      return result
    } finally { this.saving = false }
  }
}
