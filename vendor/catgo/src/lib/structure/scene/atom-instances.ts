import type { AnyStructure, Vec3 } from '$lib'
import type { ImageInstanceTable, RenderPacket } from './render-packet'
import { logical_site_for_pick } from './replica-layout'

/** The same positions and sparse image table used by the atom renderer. */
export interface AtomInstanceSource {
  structure: AnyStructure
  packet?: RenderPacket | null
  images?: ImageInstanceTable | null
  position_overrides?: ReadonlyMap<number, Vec3> | null
}

export interface AtomInstance {
  /** Editable atom, shared by its periodic images. */
  site_idx: number
  /** Ordinary displayed-site index, or the packet's base index for radii. */
  radius_idx: number
  position: Vec3
}

export function logical_site_for_display(structure: AnyStructure, idx: number): number {
  const expanded = structure as AnyStructure & {
    num_original_sites?: number
    image_to_original_map?: number[]
  }
  const count = expanded.num_original_sites
  if (count !== undefined && idx < count) return idx
  const site = structure.sites[idx]
  return (count === undefined ? undefined : expanded.image_to_original_map?.[idx - count])
    ?? (typeof site?.properties?.orig_site_idx === 'number' ? site.properties.orig_site_idx : idx)
}

/** Visit rendered centers without materializing a scientific supercell.
 * Optional selection keeps highlight work proportional to selected atoms. */
export function visit_atom_instances(
  source: AtomInstanceSource,
  visit: (instance: AtomInstance) => void,
  selected?: ReadonlySet<number>,
): void {
  const { structure, packet, images, position_overrides } = source
  if (!packet) {
    const logical_selected = selected && new Set(
      [...selected].map(idx => logical_site_for_display(structure, idx)),
    )
    structure.sites.forEach((site, radius_idx) => {
      const site_idx = logical_site_for_display(structure, radius_idx)
      if (!logical_selected || logical_selected.has(site_idx)) {
        let position = position_overrides?.get(radius_idx) ?? site.xyz
        const moved_base = position_overrides?.get(site_idx)
        const base = structure.sites[site_idx]
        if (radius_idx !== site_idx && moved_base && base && !position_overrides?.has(radius_idx)) {
          position = [0, 1, 2].map(axis => site.xyz[axis] + moved_base[axis] - base.xyz[axis]) as Vec3
        }
        visit({ site_idx, radius_idx, position })
      }
    })
    return
  }

  const { topology, frame, replicas } = packet
  const n = topology.atom_count
  const lat = frame.lattice
  const emit = (base: number, cell: Vec3, ghost: boolean) => {
    if (base < 0 || base >= n) return
    const site_idx = logical_site_for_pick({ kind: 'atom', base_site: base, cell, ghost }, replicas)
    if (selected && !selected.has(site_idx)) return
    let [x, y, z] = cell
    const p = base * 3
    const moved = position_overrides?.get(site_idx)
    if (moved && replicas.semantics === 'physical-distinct-sites') {
      // A physical atom override already includes its home-cell translation.
      // Only an outside ghost needs the remaining periodic displacement.
      x -= ((x % replicas.dims[0]) + replicas.dims[0]) % replicas.dims[0]
      y -= ((y % replicas.dims[1]) + replicas.dims[1]) % replicas.dims[1]
      z -= ((z % replicas.dims[2]) + replicas.dims[2]) % replicas.dims[2]
    }
    visit({
      site_idx,
      radius_idx: base,
      position: [
        (moved?.[0] ?? frame.positions[p]) + x * lat[0] + y * lat[3] + z * lat[6],
        (moved?.[1] ?? frame.positions[p + 1]) + x * lat[1] + y * lat[4] + z * lat[7],
        (moved?.[2] ?? frame.positions[p + 2]) + x * lat[2] + y * lat[5] + z * lat[8],
      ],
    })
  }
  const bases = selected && replicas.semantics === 'visual-shared-base'
    ? [...selected].filter(idx => idx >= 0 && idx < n)
    : Array.from({ length: n }, (_, idx) => idx)
  for (let z = 0; z < replicas.dims[2]; z++) {
    for (let y = 0; y < replicas.dims[1]; y++) {
      for (let x = 0; x < replicas.dims[0]; x++) {
        for (const base of bases) emit(base, [x, y, z], false)
      }
    }
  }
  if (replicas.boundary_policy !== 'ghost-images' || !images) return
  for (let row = 0; row < images.count; row++) {
    emit(images.base_sites[row], [
      images.jimages[row * 3], images.jimages[row * 3 + 1], images.jimages[row * 3 + 2],
    ], true)
  }
}

export function atoms_in_screen_box(
  source: AtomInstanceSource,
  project: (position: Vec3) => { x: number; y: number } | null,
  start: { x: number; y: number },
  end: { x: number; y: number },
): number[] {
  const selected = new Set<number>()
  const min_x = Math.min(start.x, end.x), max_x = Math.max(start.x, end.x)
  const min_y = Math.min(start.y, end.y), max_y = Math.max(start.y, end.y)
  visit_atom_instances(source, ({ site_idx, position }) => {
    const point = project(position)
    if (point && point.x >= min_x && point.x <= max_x && point.y >= min_y && point.y <= max_y) {
      selected.add(site_idx)
    }
  })
  return [...selected]
}
