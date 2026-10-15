import { describe, expect, it, vi } from 'vitest'
import type { AnyStructure, Site, Vec3 } from '$lib'
import { atoms_in_screen_box, visit_atom_instances, type AtomInstance, type AtomInstanceSource } from '$lib/structure/scene/atom-instances'
import { create_render_packet_builder } from '$lib/structure/scene/render-packet-builder'
import { create_context_menu_actions, type ContextMenuDeps } from '$lib/structure/controllers/context-menu-actions'
import { structure_to_poscar_str } from '$lib/structure/export'
import { create_interaction_controller, type InteractionDeps } from '$lib/structure/controllers/interaction.svelte'
import { OrthographicCamera } from 'three'
import { setup_hover_detection, type GpuPickerDeps, type ReplicaPickerHandle } from '$lib/structure/gpu-picker-integration.svelte'

const site = (xyz: Vec3, properties = {}): Site => ({
  species: [{ element: 'Si', occu: 1 }], xyz, abc: xyz.map((v, i) => v / (i === 2 ? 20 : 4)) as Vec3,
  label: 'Si', properties,
})
function base(): AnyStructure {
  return {
    sites: [site([0, 0, 10]), site([2, 2, 10])],
    lattice: { matrix: [[4, 0, 0], [0, 4, 0], [0, 0, 20]], pbc: [true, true, true] },
  } as AnyStructure
}
function expanded(structure = base()): AnyStructure & { num_original_sites: number; image_to_original_map: number[] } {
  return {
    ...structure,
    sites: [...structure.sites, site([4, 0, 10], { orig_site_idx: 0 }), site([0, 4, 10], { orig_site_idx: 0 })],
    num_original_sites: 2,
    image_to_original_map: [0, 0],
  }
}
const project = ([x, y]: Vec3) => ({ x, y })
const box = (source: AtomInstanceSource, x: number, y = 0) =>
  atoms_in_screen_box(source, project, { x: x - 0.1, y: y - 0.1 }, { x: x + 0.1, y: y + 0.1 })

describe('periodic atom selection and indicators', () => {
  it('selects the original when only an outside image is in the box', () => {
    expect(box({ structure: base() }, 4)).toEqual([])
    expect(box({ structure: expanded() }, 4)).toEqual([0])
  })

  it('deduplicates originals and multiple images, including reverse drags', () => {
    expect(atoms_in_screen_box({ structure: expanded() }, project, { x: 5, y: 5 }, { x: -1, y: -1 })).toEqual([0, 1])
  })

  it('highlights every image of the selected original, without selecting unrelated atoms', () => {
    const instances: AtomInstance[] = []
    visit_atom_instances({ structure: expanded() }, i => instances.push(i), new Set([0]))
    expect(instances.map(i => i.position)).toEqual([[0, 0, 10], [4, 0, 10], [0, 4, 10]])
    expect(instances.map(i => i.site_idx)).toEqual([0, 0, 0])
  })

  it('preserves directly clicked image selection and legacy image-map metadata', () => {
    const structure = expanded()
    structure.sites[2].properties = {}
    const instances: AtomInstance[] = []
    visit_atom_instances({ structure }, i => instances.push(i), new Set([2]))
    expect(instances.map(i => i.radius_idx)).toEqual([0, 2, 3])
    expect(box({ structure }, 4)).toEqual([0])
  })

  it('keeps image indicators attached to a moved original', () => {
    const source = { structure: expanded(), position_overrides: new Map<number, Vec3>([[0, [1, 0, 10]]]) }
    expect(box(source, 5)).toEqual([0])
    expect(box(source, 4)).toEqual([])
    const instances: AtomInstance[] = []
    visit_atom_instances(source, i => instances.push(i), new Set([0]))
    expect(instances.map(i => i.position)).toEqual([[1, 0, 10], [5, 0, 10], [1, 4, 10]])
  })

  it('does not collapse distinct physical atoms that carry supercell provenance', () => {
    const structure = base()
    structure.sites[1].properties = { orig_unit_cell_idx: 0 }
    expect(box({ structure }, 2, 2)).toEqual([1])
  })

  it('uses packet frame positions and live lattice for replicas and sparse boundary images', () => {
    const structure = base()
    const packet = create_render_packet_builder().build({
      structure, dims: [2, 1, 1], boundary_policy: 'ghost-images',
      frame_positions: new Float32Array([1, 0, 10, 2, 2, 10]),
      frame_lattice: [[5, 0, 0], [1, 4, 0], [0, 0, 20]],
    })
    const images = { count: 2, base_sites: new Uint32Array([0, 0]), jimages: new Int8Array([-1, 0, 0, 2, 0, 0]) }
    const source = { structure, packet, images }
    expect(box(source, -4)).toEqual([0])
    expect(box(source, 6)).toEqual([0])
    expect(box(source, 11)).toEqual([0])
    expect(box(source, 0)).toEqual([]) // stale structure coordinate must not win
    const selected: AtomInstance[] = []
    visit_atom_instances(source, i => selected.push(i), new Set([0]))
    expect(selected.map(i => i.position[0])).toEqual([1, 6, -4, 11])
    packet.replicas = { ...packet.replicas, boundary_policy: 'hide' }
    expect(box(source, 11)).toEqual([])
  })

  it('maps physical packet ghosts to the wrapped physical site', () => {
    const structure = base()
    const packet = create_render_packet_builder().build({ structure, dims: [2, 1, 1], boundary_policy: 'ghost-images' })
    packet.replicas = { ...packet.replicas, semantics: 'physical-distinct-sites', physical_site_map: new Uint32Array([0, 1, 2, 3]) }
    const source = { structure, packet, images: { count: 1, base_sites: new Uint32Array([0]), jimages: new Int8Array([-1, 0, 0]) } }
    expect(box(source, -4)).toEqual([2])
    expect(box({ ...source, position_overrides: new Map<number, Vec3>([[2, [4.5, 0, 10]]]) }, -3.5)).toEqual([2])
  })

  it('freezes the selected original and exports one constraint per real atom', () => {
    let structure = base()
    const selected = box({ structure: expanded(structure) }, 4)
    const actions = create_context_menu_actions({
      get_structure: () => structure,
      set_structure: (next: AnyStructure) => { structure = next },
      get_displayed_structure: () => expanded(structure),
      get_selected_sites: () => selected,
      get_context_menu_target_site: () => null,
      push_to_undo: vi.fn(),
      set_context_menu_visible: vi.fn(),
    } as unknown as ContextMenuDeps)
    actions.handle_select('Constraints', { value: 'freeze_all' })
    expect(structure.sites).toHaveLength(2)
    expect(structure.sites[0].properties?.selective_dynamics).toEqual([false, false, false])
    expect(structure.sites[1].properties?.selective_dynamics).toEqual([true, true, true])
    const text = structure_to_poscar_str(structure)
    expect(text).toMatch(/Selective dynamics/i)
    expect(text.match(/F\s+F\s+F/g)).toHaveLength(1)
    expect(text.match(/T\s+T\s+T/g)).toHaveLength(1)
    actions.handle_select('Constraints', { value: 'unfreeze_selected' })
    expect(structure.sites[0].properties?.selective_dynamics).toEqual([true, true, true])
  })

  it('keeps a multi-atom selection when the freeze menu is opened on an image', () => {
    let structure = base()
    const selected = atoms_in_screen_box({ structure: expanded() }, project, { x: -1, y: -1 }, { x: 5, y: 5 })
    const actions = create_context_menu_actions({
      get_structure: () => structure,
      set_structure: (next: AnyStructure) => { structure = next },
      get_displayed_structure: () => expanded(structure),
      get_selected_sites: () => selected,
      get_context_menu_target_site: () => 2,
      push_to_undo: vi.fn(),
      set_context_menu_visible: vi.fn(),
    } as unknown as ContextMenuDeps)
    actions.handle_select('Constraints', { value: 'freeze_all' })
    expect(structure.sites.map(s => s.properties?.selective_dynamics)).toEqual([[false, false, false], [false, false, false]])
  })

  it('consumes the box gesture click without blocking the next click or keyboard activation', () => {
    const structure = base()
    const wrapper = document.createElement('div')
    wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100)
    camera.position.set(0, 0, 30)
    camera.lookAt(0, 0, 10)
    camera.updateProjectionMatrix()
    let selected: number[] = []
    const controller = create_interaction_controller({
      get_structure: () => structure,
      get_displayed_structure: () => expanded(structure),
      get_selected_sites: () => selected,
      set_selected_sites: (next: number[]) => { selected = next },
      get_selected_bonds: () => [],
      set_selected_bonds: vi.fn(),
      get_scene_bond_pairs: () => [],
      get_wrapper: () => wrapper,
      get_camera: () => camera,
      get_scene_props: () => ({ rotation: [0, 0, 0] }),
      get_rotation_target_ref: () => [0, 0, 0],
      get_pencil_drag_active: () => false,
    } as unknown as InteractionDeps)
    const cleanup = controller.setup_global_listeners()
    try {
      controller.handleShiftClickCapture(new PointerEvent('pointerdown', {
        ctrlKey: true, clientX: 175, clientY: 95, button: 0, pointerType: 'mouse',
      }))
      document.dispatchEvent(new MouseEvent('mousemove', { ctrlKey: true, clientX: 185, clientY: 105 }))
      controller.handlePointerUpCapture(new PointerEvent('pointerup', { ctrlKey: true, cancelable: true }))
      expect(selected).toEqual([0])
      for (const [type, detail] of [['click', 1], ['dblclick', 2]] as const) {
        const event = new MouseEvent(type, { detail, cancelable: true })
        controller.handleSelectionClickCapture(event)
        expect(event.defaultPrevented).toBe(true)
      }
      const keyboard = new MouseEvent('click', { detail: 0, cancelable: true })
      controller.handleSelectionClickCapture(keyboard)
      expect(keyboard.defaultPrevented).toBe(false)
      controller.handleShiftClickCapture(new PointerEvent('pointerdown', { button: 0, pointerType: 'mouse' }))
      const next = new MouseEvent('click', { detail: 1, cancelable: true })
      controller.handleSelectionClickCapture(next)
      expect(next.defaultPrevented).toBe(false)
    } finally {
      cleanup()
    }
  })

  it('preserves packet selection for right/middle clicks and still selects with the left button', () => {
    vi.useFakeTimers()
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect
    const packet = create_render_packet_builder().build({ structure: base(), dims: [2, 1, 1] })
    const select = vi.fn()
    const pick = vi.fn(() => ({
      pick: { kind: 'atom', base_site: 0, cell: [2, 0, 0], ghost: true }, logical_site: 0,
    }))
    const deps = {
      get_threlte: () => ({ renderer: { domElement: canvas }, camera: { current: new OrthographicCamera() } }),
      get_render_packet: () => packet,
      get_external_dragging: () => false,
      get_is_rotating_atoms: () => false,
      get_is_box_selecting: () => false,
      get_show_bulk_atoms: () => true,
      get_incomplete_edge: () => null,
      get_bond_thickness: () => 0.1,
      get_rotation: () => [0, 0, 0],
      get_rotation_target: () => undefined,
      get_cutting_active: () => false,
      get_cutting_visibility_map: () => new Map(),
      on_packet_atom_click: select,
    } as unknown as GpuPickerDeps
    const replica_picker = { sync: () => ({ pick }) } as unknown as ReplicaPickerHandle
    const cleanup = setup_hover_detection(deps, {} as Parameters<typeof setup_hover_detection>[1], replica_picker)
    try {
      for (const button of [2, 1, 0]) {
        for (const type of ['pointerdown', 'pointerup']) {
          canvas.dispatchEvent(new PointerEvent(type, { button, clientX: 100, clientY: 100, bubbles: true }))
        }
        vi.runAllTimers()
        expect(select).toHaveBeenCalledTimes(button === 0 ? 1 : 0)
      }
      expect(pick).toHaveBeenCalledTimes(1)
      expect(select.mock.calls[0][0]).toBe(0)
    } finally {
      cleanup?.()
      canvas.remove()
      vi.useRealTimers()
    }
  })
})
