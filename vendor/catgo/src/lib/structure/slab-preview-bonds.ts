import type { BondPair, PymatgenStructure, Site, Vec3 } from './index'
import { compute_bond_transform } from './bonding'

export interface SlabPreviewBondInstance {
  matrix: Float32Array
  color_start: string
  color_end: string
}

/** Match the main viewer's periodic-bond convention: B's partner position is
 * B + jimage · lattice. Preview atoms contain only the home cell, so cross-cell
 * bonds have no visible partner when incomplete bonds are hidden. If shown,
 * render two short halves anchored at A and B, never a line across the cell. */
export function slab_preview_bond_instances(
  structure: PymatgenStructure,
  bonds: readonly BondPair[],
  color_for_site: (site: Site) => string,
  hide_incomplete_bonds = true,
): SlabPreviewBondInstance[] {
  const instances: SlabPreviewBondInstance[] = []
  const add = (from: Vec3, to: Vec3, color_start: string, color_end: string) => {
    if (![...from, ...to].every(Number.isFinite) || Math.hypot(...from.map((v, k) => v - to[k])) < 1e-8) return
    instances.push({ matrix: compute_bond_transform(from, to), color_start, color_end })
  }
  for (const bond of bonds) {
    const site_a = structure.sites[bond.site_idx_1]
    const site_b = structure.sites[bond.site_idx_2]
    if (!site_a || !site_b) continue
    const image = bond.jimage ?? [0, 0, 0]
    if (image.length !== 3 || !image.every(Number.isInteger)) continue
    const periodic = image.some(v => v !== 0)
    if (periodic && hide_incomplete_bonds) continue
    const color_a = color_for_site(site_a), color_b = color_for_site(site_b)
    if (!periodic) {
      add(site_a.xyz, site_b.xyz, color_a, color_b)
      continue
    }
    const { matrix, pbc = [true, true, true] } = structure.lattice
    if (image.some((v, axis) => v !== 0 && !pbc[axis])) continue
    const shift = [0, 1, 2].map(axis => image.reduce((sum, v, row) => sum + v * matrix[row][axis], 0))
    const midpoint = site_a.xyz.map((v, axis) => (v + site_b.xyz[axis] + shift[axis]) / 2) as Vec3
    add(site_a.xyz, midpoint, color_a, color_a)
    add(midpoint.map((v, axis) => v - shift[axis]) as Vec3, site_b.xyz, color_b, color_b)
  }
  return instances
}
