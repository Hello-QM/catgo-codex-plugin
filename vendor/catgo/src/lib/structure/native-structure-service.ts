import type {
  ViewerHandle,
  ViewerManifest,
  ViewerMutationResult,
} from './viewer-registry.svelte'
import {
  get_viewer_mount_generation,
  refresh_viewer_manifest,
  resolve_viewer,
} from './viewer-registry.svelte'
import { generate_slab_pipeline, validate_miller } from './miller-slab'
import type { MillerIndex, PymatgenStructure } from './index'

/**
 * Serializable structure mutations understood by CatGo's in-process viewer.
 *
 * This is the native boundary used by CatBot and future agent runtimes. MCP
 * adapters may translate into this contract, but the viewer does not need an
 * MCP round trip to execute it.
 */
export type NativeStructureOperation =
  | { type: `add_atom`; element: string; position: [number, number, number] }
  | { type: `delete_atoms`; indices: number[] }
  | { type: `replace_atoms`; indices: number[]; element: string }
  | {
      type: `move_atoms`
      moves: { index: number; displacement: [number, number, number] }[]
    }
  | { type: `scale_geometry`; factor: number }
  | {
      type: `generate_slab`
      miller_index: MillerIndex
      thickness: number
      vacuum: number
    }

export interface NativeStructurePreview {
  viewer_id: string
  position: ViewerManifest[`position`]
  filename: string | null
  revision: number
  operation: NativeStructureOperation
  before_atom_count: number
  after_atom_count: number
  summary: string
}

export interface NativeStructureReceipt extends NativeStructurePreview, ViewerMutationResult {
  previous_revision: number
  revision: number
}

export interface ApplyNativeStructureOptions {
  /** Reject a change prepared against an older viewer snapshot. */
  base_revision: number
  /** Restrict viewer resolution to the CatBot tab issuing the operation. */
  tab_id?: string
}

interface RevisionState {
  revision: number
  fingerprint: string
  mount_generation: number
}

// Keep the counter on the stable viewer id. A re-mounted pane receives a new
// registry generation and therefore cannot accept a revision prepared for the
// previous handle, even when both structures happened to start at revision 0.
const revisions = new Map<string, RevisionState>()

function structure_fingerprint(handle: ViewerHandle, manifest: ViewerManifest): string {
  try {
    const generation = handle.get_structure_generation?.()
    const serialized = JSON.stringify({
      ...(generation === undefined
        ? { structure: handle.get_structure() ?? null }
        : { structure_generation: generation }),
      atom_count: manifest.atom_count,
      kind: manifest.kind,
      total_frames: manifest.total_frames,
    })
    if (serialized === undefined) throw new Error(`Structure snapshot was not serializable.`)
    return serialized
  } catch (error) {
    throw new Error(
      `Cannot establish a safe structure revision for ${manifest.viewer_id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function revision_of(handle: ViewerHandle, manifest: ViewerManifest): number {
  const fingerprint = structure_fingerprint(handle, manifest)
  const mount_generation = get_viewer_mount_generation(handle)
  const previous = revisions.get(manifest.viewer_id)
  if (!previous) {
    revisions.set(manifest.viewer_id, { revision: 0, fingerprint, mount_generation })
    return 0
  }
  if (
    previous.mount_generation !== mount_generation ||
    previous.fingerprint !== fingerprint
  ) {
    const revision = previous.revision + 1
    revisions.set(manifest.viewer_id, { revision, fingerprint, mount_generation })
    return revision
  }
  return previous.revision
}

function resolved_viewer(ref?: string, tab_id?: string): {
  handle: ViewerHandle
  manifest: ViewerManifest
} {
  const resolved = resolve_viewer(ref, tab_id)
  if (resolved.error || !resolved.handle || !resolved.manifest) {
    throw new Error(resolved.error ?? `Viewer is not available.`)
  }
  return { handle: resolved.handle, manifest: resolved.handle.get_manifest() }
}

function valid_indices(indices: number[], atom_count: number): number[] {
  const normalized = [...new Set(indices)]
  if (!normalized.length || normalized.some((index) =>
    !Number.isInteger(index) || index < 0 || index >= atom_count)) {
    throw new Error(`Atom indices must be unique integers between 0 and ${Math.max(0, atom_count - 1)}.`)
  }
  return normalized
}

function assert_vector(value: number[], label: string): asserts value is [number, number, number] {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new Error(`${label} must contain three finite Cartesian values.`)
  }
}

function slab_for(
  handle: ViewerHandle,
  operation: Extract<NativeStructureOperation, { type: `generate_slab` }>,
): PymatgenStructure {
  const structure = handle.get_structure()
  if (!structure || !(`lattice` in structure) || !structure.lattice?.matrix) {
    throw new Error(`Slab generation requires a periodic crystal structure with a lattice.`)
  }
  const slab = generate_slab_pipeline(structure, {
    miller_index: operation.miller_index,
    offset: 0,
    thickness: operation.thickness,
    vacuum: operation.vacuum,
  })
  if (!slab || slab.sites.length === 0) {
    throw new Error(`The requested slab contains no atoms. Check the Miller index and thickness.`)
  }
  return slab
}

function normalize_operation(
  handle: ViewerHandle,
  manifest: ViewerManifest,
  operation: NativeStructureOperation,
): NativeStructureOperation {
  if (!manifest.editable) throw new Error(`Viewer ${manifest.viewer_id} is read-only.`)

  switch (operation.type) {
    case `add_atom`: {
      if (!handle.add_atom) throw new Error(`Viewer ${manifest.viewer_id} does not support atom addition.`)
      const element = operation.element.trim()
      assert_vector(operation.position, `position`)
      if (!element) throw new Error(`element is required.`)
      return { ...operation, element }
    }
    case `delete_atoms`:
      if (!handle.delete_atoms) throw new Error(`Viewer ${manifest.viewer_id} does not support atom deletion.`)
      return { ...operation, indices: valid_indices(operation.indices, manifest.atom_count) }
    case `replace_atoms`: {
      if (!handle.replace_atoms) throw new Error(`Viewer ${manifest.viewer_id} does not support atom replacement.`)
      const element = operation.element.trim()
      if (!element) throw new Error(`element is required.`)
      return {
        ...operation,
        element,
        indices: valid_indices(operation.indices, manifest.atom_count),
      }
    }
    case `move_atoms`: {
      if (!handle.move_atoms) throw new Error(`Viewer ${manifest.viewer_id} does not support atom movement.`)
      const seen = new Set<number>()
      const moves = operation.moves.map((move) => {
        const [index] = valid_indices([move.index], manifest.atom_count)
        if (seen.has(index)) throw new Error(`Atom ${index} has more than one displacement.`)
        seen.add(index)
        assert_vector(move.displacement, `displacement for atom ${index}`)
        return { index, displacement: move.displacement }
      })
      if (!moves.length) throw new Error(`At least one atom move is required.`)
      return { ...operation, moves }
    }
    case `scale_geometry`:
      if (!handle.scale_geometry) throw new Error(`Viewer ${manifest.viewer_id} does not support geometry scaling.`)
      if (!Number.isFinite(operation.factor) || operation.factor <= 0) {
        throw new Error(`factor must be a positive number.`)
      }
      return operation
    case `generate_slab`: {
      if (manifest.kind !== `structure`) {
        throw new Error(`Slab generation is supported only for a single crystal structure, not a trajectory.`)
      }
      if (!handle.set_structure) throw new Error(`Viewer ${manifest.viewer_id} cannot replace its structure.`)
      if (
        operation.miller_index.length !== 3 ||
        !operation.miller_index.every(Number.isInteger) ||
        !validate_miller(operation.miller_index)
      ) {
        throw new Error(`miller_index must contain three integers and cannot be (0, 0, 0).`)
      }
      if (!Number.isFinite(operation.thickness) || operation.thickness <= 0) {
        throw new Error(`thickness must be a positive number in Angstroms.`)
      }
      if (!Number.isFinite(operation.vacuum) || operation.vacuum < 0) {
        throw new Error(`vacuum must be a non-negative number in Angstroms.`)
      }
      return operation
    }
  }
}

function preview_for(
  handle: ViewerHandle,
  manifest: ViewerManifest,
  operation: NativeStructureOperation,
): NativeStructurePreview {
  const normalized = normalize_operation(handle, manifest, operation)
  const before = manifest.atom_count
  const slab = normalized.type === `generate_slab` ? slab_for(handle, normalized) : undefined
  const after = normalized.type === `add_atom`
    ? before + 1
    : normalized.type === `delete_atoms`
      ? before - normalized.indices.length
      : slab?.sites.length ?? before
  const summary = normalized.type === `add_atom`
    ? `Add ${normalized.element} at (${normalized.position.join(`, `)})`
    : normalized.type === `delete_atoms`
      ? `Delete atoms ${normalized.indices.join(`, `)}`
      : normalized.type === `replace_atoms`
        ? `Replace atoms ${normalized.indices.join(`, `)} with ${normalized.element}`
        : normalized.type === `move_atoms`
          ? `Move atoms ${normalized.moves.map((move) => move.index).join(`, `)}`
          : normalized.type === `scale_geometry`
            ? `Scale geometry by ${normalized.factor}`
            : `Cut (${normalized.miller_index.join(``)}) slab with ${normalized.thickness} Å thickness and ${normalized.vacuum} Å vacuum`

  return {
    viewer_id: manifest.viewer_id,
    position: manifest.position,
    filename: manifest.filename,
    revision: revision_of(handle, manifest),
    operation: normalized,
    before_atom_count: before,
    after_atom_count: after,
    summary,
  }
}

/** Validate and summarize a native edit without changing the viewer. */
export function preview_native_structure_change(
  viewer_ref: string | undefined,
  operation: NativeStructureOperation,
  tab_id?: string,
): NativeStructurePreview {
  const { handle, manifest } = resolved_viewer(viewer_ref, tab_id)
  return preview_for(handle, manifest, operation)
}

/**
 * Apply one validated viewer mutation and return a revisioned receipt.
 *
 * A mutation is one viewer-controller call, so it is atomic at the current
 * UI boundary. `base_revision` adds optimistic concurrency protection for an
 * LLM that prepared a change from an earlier inspection.
 */
export function apply_native_structure_change(
  viewer_ref: string | undefined,
  operation: NativeStructureOperation,
  options: ApplyNativeStructureOptions,
): NativeStructureReceipt {
  if (!options || !Number.isInteger(options.base_revision) || options.base_revision < 0) {
    throw new Error(`base_revision is required and must be a non-negative integer.`)
  }
  const { handle, manifest } = resolved_viewer(viewer_ref, options.tab_id)
  const preview = preview_for(handle, manifest, operation)
  const previous_revision = preview.revision
  if (options.base_revision !== previous_revision) {
    throw new Error(
      `Stale structure revision for ${manifest.viewer_id}: expected ${options.base_revision}, current ${previous_revision}. Inspect or preview again before applying.`,
    )
  }

  const normalized = preview.operation
  let result: ViewerMutationResult
  switch (normalized.type) {
    case `add_atom`:
      result = handle.add_atom!(normalized.element, normalized.position)
      break
    case `delete_atoms`:
      result = handle.delete_atoms!(normalized.indices)
      break
    case `replace_atoms`:
      result = handle.replace_atoms!(normalized.indices, normalized.element)
      break
    case `move_atoms`:
      result = handle.move_atoms!(new Map(normalized.moves.map((move) => [move.index, move.displacement])))
      break
    case `scale_geometry`:
      result = handle.scale_geometry!(normalized.factor)
      break
    case `generate_slab`: {
      const slab = slab_for(handle, normalized)
      handle.set_structure(slab)
      result = {
        viewer_id: manifest.viewer_id,
        scope: `structure`,
        atom_count: slab.sites.length,
        total_frames: 1,
      }
      break
    }
  }

  const revision = previous_revision + 1
  refresh_viewer_manifest(manifest.viewer_id)
  revisions.set(manifest.viewer_id, {
    revision,
    fingerprint: structure_fingerprint(handle, handle.get_manifest()),
    mount_generation: get_viewer_mount_generation(handle),
  })
  return { ...preview, ...result, previous_revision, revision }
}

/** Current revision for inspection/UI status without mutating the viewer. */
export function native_structure_revision(viewer_ref?: string, tab_id?: string): number {
  const { handle, manifest } = resolved_viewer(viewer_ref, tab_id)
  return revision_of(handle, manifest)
}
