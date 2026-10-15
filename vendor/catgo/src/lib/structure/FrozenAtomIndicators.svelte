<script lang="ts">
  import type { Site } from '$lib'
  import { T } from '@threlte/core'
  import type { SvelteMap } from 'svelte/reactivity'
  import { VISUAL_RADIUS_SCALE } from './rendering/visual-state'
  import { visit_atom_instances, type AtomInstance, type AtomInstanceSource } from './scene/atom-instances'

  let {
    sites,
    all_radii_by_site_idx,
    atom_radius = 1,
    atom_instance_source = null,
  }: {
    sites: Site[]
    all_radii_by_site_idx: Map<number, number> | SvelteMap<number, number>
    atom_radius?: number
    atom_instance_source?: AtomInstanceSource | null
  } = $props()

  // No-op raycast prevents these visual-only meshes from intercepting
  // Threlte's interactivity raycasting (which only keeps the closest hit).
  // Without this, the torus rings block click events meant for atoms.
  const noop_raycast = () => {}

  // Resolve constraints through the original atom; images are display copies.
  let frozen_instances = $derived.by(() => {
    const frozen = new Set<number>()
    sites.forEach((s, idx) => {
      const sd = s.properties?.selective_dynamics as [boolean, boolean, boolean] | undefined
      if (sd && (!sd[0] || !sd[1] || !sd[2])) frozen.add(idx)
    })
    const instances: AtomInstance[] = []
    if (!frozen.size) return instances
    if (atom_instance_source) {
      visit_atom_instances(atom_instance_source, instance => instances.push(instance), frozen)
    } else {
      for (const idx of frozen) instances.push({ site_idx: idx, radius_idx: idx, position: sites[idx].xyz })
    }
    return instances
  })
</script>

<!-- Frozen atom indicators — per-axis colored rings (X=red, Y=green, Z=blue) -->
  {#each frozen_instances as instance}
    {@const sel_dyn = sites[instance.site_idx]?.properties?.selective_dynamics as [boolean, boolean, boolean] | undefined}
    {#if sel_dyn && (!sel_dyn[0] || !sel_dyn[1] || !sel_dyn[2])}
      {@const frozen_radius = (all_radii_by_site_idx.get(instance.radius_idx) ?? atom_radius) * VISUAL_RADIUS_SCALE * 1.7}
      {#if !sel_dyn[0]}
        <T.Mesh position={instance.position} rotation={[0, Math.PI / 2, 0]} raycast={noop_raycast}>
          <T.TorusGeometry args={[frozen_radius, 0.06, 8, 32]} />
          <T.MeshBasicMaterial color="#d75555" />
        </T.Mesh>
      {/if}
      {#if !sel_dyn[1]}
        <T.Mesh position={instance.position} rotation={[Math.PI / 2, 0, 0]} raycast={noop_raycast}>
          <T.TorusGeometry args={[frozen_radius, 0.06, 8, 32]} />
          <T.MeshBasicMaterial color="#55b855" />
        </T.Mesh>
      {/if}
      {#if !sel_dyn[2]}
        <T.Mesh position={instance.position} raycast={noop_raycast}>
          <T.TorusGeometry args={[frozen_radius, 0.06, 8, 32]} />
          <T.MeshBasicMaterial color="#5555d7" />
        </T.Mesh>
      {/if}
    {/if}
  {/each}
