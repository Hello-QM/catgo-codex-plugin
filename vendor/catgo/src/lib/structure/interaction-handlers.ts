// Pure interaction handler functions extracted from StructureScene.svelte.
// These handle right-drag roll rotation, keyboard rotation, and context menu helpers.

import { Vector3, type Camera } from 'three'
import type { Vec3 } from '$lib'

/** State bag for right-drag roll rotation, managed by the component. */
export interface RollDragState {
  is_right_dragging: boolean
  right_drag_prev_x: number
  right_drag_suppress_context: boolean
}

function sync_controls_after_rotation(
  camera: Camera,
  orbit_controls: any,
  target_pos: Vector3,
): void {
  if (orbit_controls.target) orbit_controls.target.copy(target_pos)

  const ctrl = orbit_controls as any
  ctrl._lastAngle = 0
  if (ctrl._lastAxis) ctrl._lastAxis.set(0, 0, 0)
  if (ctrl._target0) ctrl._target0.copy(target_pos)
  if (ctrl._eye0) ctrl._eye0.subVectors(camera.position, target_pos)
  if (ctrl._up0) ctrl._up0.copy(camera.up)
  if (orbit_controls.update) orbit_controls.update()
}

function rotate_camera_and_target_about_pivot(
  camera: Camera,
  orbit_controls: any,
  current_camera_target: Vec3,
  rotation_pivot: Vec3,
  rotation_axis: Vector3,
  angle: number,
): Vec3 {
  const pivot_pos = new Vector3(...rotation_pivot)
  const target_pos = new Vector3(...current_camera_target)

  const relative_camera_pos = camera.position.clone().sub(pivot_pos)
  relative_camera_pos.applyAxisAngle(rotation_axis, angle)
  camera.position.copy(relative_camera_pos.add(pivot_pos))

  const relative_target_pos = target_pos.clone().sub(pivot_pos)
  relative_target_pos.applyAxisAngle(rotation_axis, angle)
  target_pos.copy(relative_target_pos.add(pivot_pos))

  camera.up.applyAxisAngle(rotation_axis, angle).normalize()
  camera.lookAt(target_pos)
  sync_controls_after_rotation(camera, orbit_controls, target_pos)

  return [target_pos.x, target_pos.y, target_pos.z] as Vec3
}

/**
 * Begin right-drag roll rotation (pointerdown handler).
 * Mutates `state` in-place. Only acts on right button when no atoms are selected
 * and the viewer is hovered.
 */
export function handle_scene_roll_start(
  event: PointerEvent,
  state: RollDragState,
  selected_sites: number[],
  hovered: boolean,
): void {
  if (event.button !== 2) return
  if (selected_sites.length > 0) return
  if (!hovered) return

  state.is_right_dragging = true
  state.right_drag_prev_x = event.clientX
  state.right_drag_suppress_context = false
}

/**
 * Continue right-drag roll rotation (pointermove handler).
 * Mutates camera position/up and updates orbit controls.
 */
export function handle_scene_roll_move(
  event: PointerEvent,
  state: RollDragState,
  camera: Camera | undefined,
  orbit_controls: any,
  current_camera_target: Vec3,
  rotation_pivot: Vec3,
): Vec3 | null {
  if (!state.is_right_dragging || !camera || !orbit_controls) return null

  const delta_x = event.clientX - state.right_drag_prev_x
  state.right_drag_prev_x = event.clientX

  // Mark that we've actually dragged (to suppress context menu)
  if (Math.abs(delta_x) > 2) {
    state.right_drag_suppress_context = true
  }

  const rotation_amount = delta_x * 0.01 // Sensitivity

  // Get camera forward axis for roll rotation
  const camera_forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
  return rotate_camera_and_target_about_pivot(
    camera,
    orbit_controls,
    current_camera_target,
    rotation_pivot,
    camera_forward,
    rotation_amount,
  )
}

/**
 * End right-drag roll rotation (pointerup handler).
 */
export function handle_scene_roll_end(state: RollDragState): void {
  state.is_right_dragging = false
}

/**
 * Handle keyboard-driven rotation of the scene (arrow keys + W/S for roll).
 * Uses trackball-style rotation around camera axes.
 */
export function handle_keyboard_rotation(
  event: KeyboardEvent,
  camera: Camera | undefined,
  orbit_controls: any,
  selected_sites: number[],
  hovered: boolean,
  current_camera_target: Vec3,
  rotation_pivot: Vec3,
): Vec3 | null {
  if (!camera || !orbit_controls) return null

  // Ignore if user is typing in an input field. Monaco (EditContext) focuses a
  // <div>, not a <textarea>, so also bail on embedded editors / contenteditable
  // — otherwise plain s/w/arrow keys typed in the editor get swallowed.
  const target = event.target as HTMLElement
  if (
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target?.closest?.('.monaco-editor, .native-edit-context, [contenteditable=""], [contenteditable="true"]')
  ) return null

  // Don't handle if modifier keys are pressed (for browser shortcuts)
  if (event.ctrlKey || event.metaKey || event.altKey) return null

  // With atoms selected, bail so the interaction controller can claim
  // modified-arrow bindings (Shift+Alt+Arrow = move, Shift+Arrow = rotate,
  // Ctrl+Arrow = move legacy). Plain arrow + selection is currently a no-op
  // by design — use the modifiers above to act on the selection, or deselect
  // to rotate the view.
  if (selected_sites.length > 0) {
    return null
  }

  // Don't intercept arrow keys if viewer is not hovered (let page scroll)
  const is_arrow_key = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
    event.key,
  )
  if (is_arrow_key && !hovered) {
    return null
  }

  const rotation_amount = 0.1 // radians per keypress

  // Get camera's current orientation vectors in world space
  const camera_right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    .normalize()
  const camera_up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    .normalize()
  const camera_forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    .normalize()

  let rotation_axis: Vector3 | null = null
  let rotation_direction = 1
  let should_prevent = false

  switch (event.key) {
    case 'ArrowUp':
      rotation_axis = camera_right
      rotation_direction = 1
      should_prevent = true
      break
    case 'ArrowDown':
      rotation_axis = camera_right
      rotation_direction = -1
      should_prevent = true
      break
    case 'ArrowLeft':
      rotation_axis = camera_up
      rotation_direction = 1
      should_prevent = true
      break
    case 'ArrowRight':
      rotation_axis = camera_up
      rotation_direction = -1
      should_prevent = true
      break
    case 'w':
    case 'W':
      rotation_axis = camera_forward
      rotation_direction = 1
      should_prevent = true
      break
    case 's':
    case 'S':
      rotation_axis = camera_forward
      rotation_direction = -1
      should_prevent = true
      break
    default:
      return null
  }

  if (!rotation_axis || !should_prevent) return null

  event.preventDefault()
  event.stopPropagation()

  return rotate_camera_and_target_about_pivot(
    camera,
    orbit_controls,
    current_camera_target,
    rotation_pivot,
    rotation_axis,
    rotation_amount * rotation_direction,
  )
}
