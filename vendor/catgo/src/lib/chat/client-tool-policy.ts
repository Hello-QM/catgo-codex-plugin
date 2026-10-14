import type { ToolKind } from './types'

export const DSH_NATIVE_CAPABILITIES = [
  `catgo_list_panes`,
  `catgo_inspect_structure`,
  `catgo_get_structure_info`,
  `catgo_search_optimade`,
  `catgo_load_optimade_structure`,
  `catgo_search_pubchem`,
  `catgo_load_pubchem_molecule`,
  `catgo_make_supercell`,
  `catgo_set_lattice`,
  `catgo_substitute_element`,
  `catgo_generate_slab`,
  `catgo_place_adsorbate`,
  `catgo_get_spacegroup`,
  `catgo_get_distance`,
  `catgo_compute_xrd`,
  `catgo_build_nanotube`,
  `catgo_build_nanoscroll`,
  `catgo_build_moire`,
  `catgo_set_heterostructure_film`,
  `catgo_search_heterostructure`,
  `catgo_build_heterostructure`,
  `catgo_search_lateral_heterostructure`,
  `catgo_build_lateral_heterostructure`,
  `catgo_set_bulk_reference`,
  `catgo_passivate_surface`,
  `catgo_preview_structure_change`,
  `catgo_apply_structure_change`,
  `catgo_read_terminal`,
  `catgo_run_terminal_command`,
  `catgo_send_terminal_keys`,
  `catgo_interrupt_terminal`,
] as const

export type DshNativeCapability = typeof DSH_NATIVE_CAPABILITIES[number]

export interface DshClientToolRequest {
  type: `client_tool_request`
  streamId: string
  requestId: string
  callId: string
  toolName: string
  input: Record<string, unknown>
  deadlineAt: number
}

export interface MappedClientToolCall {
  capability: DshNativeCapability
  kind: ToolKind
  toolName:
    | `catgo_pane`
    | `get_structure_info`
    | `fetch_optimade`
    | `load_optimade_structure`
    | `fetch_pubchem`
    | `load_pubchem`
    | `make_supercell`
    | `set_lattice`
    | `substitute_element`
    | `generate_slab`
    | `place_adsorbate`
    | `get_spacegroup`
    | `get_distance`
    | `compute_xrd`
    | `build_nanotube`
    | `build_nanoscroll`
    | `build_moire`
    | `set_film`
    | `heterostructure_search`
    | `build_heterostructure`
    | `lateral_heterostructure_search`
    | `build_lateral_heterostructure`
    | `set_bulk_reference`
    | `passivate_surface`
    | `read_terminal`
    | `run_command`
    | `send_keys`
    | `interrupt_terminal`
  input: Record<string, unknown>
  mutation?:
    | {
      mode: `structure-revision`
      reason: string
      deniedMessage: string
    }
    | {
      mode: `direct`
      preview: Record<string, unknown>
      reason: string
      deniedMessage: string
    }
}

const OPERATION_KEYS = new Set([
  `type`, `element`, `position`, `indices`, `moves`, `factor`,
  `miller_index`, `thickness`, `vacuum`,
])

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== `object` || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function exact_keys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  if (extra.length) throw new Error(`${label} contains unsupported fields: ${extra.join(`, `)}.`)
}

function viewer_id(value: unknown): string {
  if (typeof value !== `string` || !value.trim()) throw new Error(`viewer_id is required.`)
  return value.trim()
}

function vector(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must contain three numbers.`)
  const numbers = value.map(Number)
  if (!numbers.every(Number.isFinite)) throw new Error(`${label} must contain three finite numbers.`)
  return [numbers[0], numbers[1], numbers[2]]
}

function vector2(value: unknown, label: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${label} must contain two numbers.`)
  const numbers = value.map(Number)
  if (!numbers.every(Number.isFinite)) throw new Error(`${label} must contain two finite numbers.`)
  return [numbers[0], numbers[1]]
}

function miller_index(value: unknown): [number, number, number] {
  const hkl = vector(value, `miller_index`)
  if (!hkl.every(Number.isInteger) || hkl.every((component) => component === 0)) {
    throw new Error(`miller_index must contain three integers and cannot be (0, 0, 0).`)
  }
  return hkl
}

function slab_parameters(input: Record<string, unknown>): {
  miller_index: [number, number, number]
  thickness: number
  vacuum: number
} {
  const hkl = miller_index(input.miller_index)
  const thickness = Number(input.thickness)
  const vacuum = Number(input.vacuum)
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new Error(`thickness must be a positive number in Angstroms.`)
  }
  if (!Number.isFinite(vacuum) || vacuum < 0) {
    throw new Error(`vacuum must be a non-negative number in Angstroms.`)
  }
  return { miller_index: hkl, thickness, vacuum }
}

function indices(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`indices must be a non-empty array.`)
  const normalized = value.map(Number)
  if (!normalized.every((index) => Number.isInteger(index) && index >= 0)) {
    throw new Error(`indices must contain non-negative integers.`)
  }
  return [...new Set(normalized)]
}

function bounded_text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== `string`) throw new Error(`${label} must be a string.`)
  if (!value.length || value.length > maxLength || value.includes(`\0`)) {
    throw new Error(`${label} must contain 1-${maxLength} characters and no NUL byte.`)
  }
  return value
}

function optional_finite(
  input: Record<string, unknown>,
  key: string,
  options: { minimum?: number; integer?: boolean } = {},
): number | undefined {
  if (input[key] === undefined) return undefined
  const value = Number(input[key])
  if (!Number.isFinite(value) || (options.integer && !Number.isInteger(value)) ||
      (options.minimum !== undefined && value < options.minimum)) {
    throw new Error(`${key} must be ${options.integer ? `an integer` : `a number`}${
      options.minimum === undefined ? `` : ` greater than or equal to ${options.minimum}`
    }.`)
  }
  return value
}

function optional_miller(input: Record<string, unknown>, key: string): [number, number, number] | undefined {
  if (input[key] === undefined) return undefined
  const hkl = vector(input[key], key)
  if (!hkl.every(Number.isInteger) || hkl.every((component) => component === 0)) {
    throw new Error(`${key} must contain three integers and cannot be (0, 0, 0).`)
  }
  return hkl
}

function exact_structure_target(input: Record<string, unknown>): {
  viewer_id: string
  base_revision: number
} {
  const base_revision = Number(input.base_revision)
  if (!Number.isInteger(base_revision) || base_revision < 0) {
    throw new Error(`base_revision must be a non-negative integer.`)
  }
  return { viewer_id: viewer_id(input.viewer_id), base_revision }
}

function required_text(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== `string`) throw new Error(`${label} must be a string.`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength || normalized.includes(`\0`)) {
    throw new Error(`${label} must contain 1-${maxLength} characters and no NUL byte.`)
  }
  return normalized
}

function element_symbol(value: unknown, label: string): string {
  const symbol = required_text(value, label, 3)
  if (!/^[A-Z][a-z]?$/.test(symbol)) throw new Error(`${label} must be an element symbol.`)
  return symbol
}

function optional_boolean(input: Record<string, unknown>, key: string): boolean | undefined {
  if (input[key] === undefined) return undefined
  if (typeof input[key] !== `boolean`) throw new Error(`${key} must be boolean.`)
  return input[key]
}

function bulk_coordination(value: unknown): Record<string, number> {
  const raw = object(value, `bulk_coordination`)
  const normalized: Record<string, number> = {}
  for (const [key, item] of Object.entries(raw)) {
    const symbol = element_symbol(key, `bulk_coordination key`)
    const coordination = Number(item)
    if (!Number.isFinite(coordination) || coordination <= 0) {
      throw new Error(`bulk_coordination.${symbol} must be a positive number.`)
    }
    normalized[symbol] = coordination
  }
  if (!Object.keys(normalized).length) throw new Error(`bulk_coordination cannot be empty.`)
  return normalized
}

function map_operation(value: unknown): Record<string, unknown> {
  const operation = object(value, `operation`)
  exact_keys(operation, OPERATION_KEYS, `operation`)
  const type = operation.type
  if (type === `add_atom`) {
    if (typeof operation.element !== `string` || !operation.element.trim()) {
      throw new Error(`add_atom requires element.`)
    }
    return {
      action: type,
      element: operation.element.trim(),
      position: vector(operation.position, `position`),
    }
  }
  if (type === `delete_atoms`) return { action: type, indices: indices(operation.indices) }
  if (type === `replace_atoms`) {
    if (typeof operation.element !== `string` || !operation.element.trim()) {
      throw new Error(`replace_atoms requires element.`)
    }
    return { action: type, indices: indices(operation.indices), element: operation.element.trim() }
  }
  if (type === `move_atoms`) {
    if (!Array.isArray(operation.moves) || operation.moves.length === 0) {
      throw new Error(`move_atoms requires moves.`)
    }
    const seen = new Set<number>()
    const moves = operation.moves.map((item, index) => {
      const move = object(item, `moves[${index}]`)
      exact_keys(move, new Set([`index`, `displacement`]), `moves[${index}]`)
      const atomIndex = Number(move.index)
      if (!Number.isInteger(atomIndex) || atomIndex < 0 || seen.has(atomIndex)) {
        throw new Error(`Each move index must be a unique non-negative integer.`)
      }
      seen.add(atomIndex)
      return { index: atomIndex, displacement: vector(move.displacement, `moves[${index}].displacement`) }
    })
    return { action: type, moves }
  }
  if (type === `scale_geometry`) {
    const factor = Number(operation.factor)
    if (!Number.isFinite(factor) || factor <= 0) throw new Error(`scale_geometry requires a positive factor.`)
    return { action: type, factor }
  }
  if (type === `generate_slab`) {
    return { action: type, ...slab_parameters(operation) }
  }
  throw new Error(`Unsupported structure operation: ${String(type)}.`)
}

/**
 * Map a DSH-facing capability onto CatBot's existing in-browser native tool.
 * The model cannot choose the permission class or target tab; both are owned
 * by this host policy and the caller's stream closure.
 */
export function map_dsh_client_tool(
  name: string,
  rawInput: Record<string, unknown>,
): MappedClientToolCall {
  const input = object(rawInput, `input`)
  if (name === `catgo_list_panes`) {
    exact_keys(input, new Set(), `input`)
    return { capability: name, kind: `read`, toolName: `catgo_pane`, input: { action: `list` } }
  }
  if (name === `catgo_inspect_structure`) {
    exact_keys(input, new Set([`viewer_id`, `element`, `terminal_only`]), `input`)
    const mapped: Record<string, unknown> = {
      action: `inspect`,
      viewer_id: viewer_id(input.viewer_id),
    }
    if (input.element !== undefined) {
      if (typeof input.element !== `string`) throw new Error(`element must be a string.`)
      // Older/less strict model clients sometimes serialize an omitted
      // optional filter as "". Treat blank optional input as absent while the
      // DSH schema's minLength prevents new calls from producing it.
      const element = input.element.trim()
      if (element) mapped.element = element
    }
    if (input.terminal_only !== undefined) {
      if (typeof input.terminal_only !== `boolean`) throw new Error(`terminal_only must be boolean.`)
      mapped.terminal_only = input.terminal_only
    }
    return { capability: name, kind: `read`, toolName: `catgo_pane`, input: mapped }
  }
  if (name === `catgo_get_structure_info`) {
    exact_keys(input, new Set([`viewer_id`]), `input`)
    return {
      capability: name,
      kind: `read`,
      toolName: `get_structure_info`,
      input: { viewer_id: viewer_id(input.viewer_id) },
    }
  }
  if (name === `catgo_search_optimade`) {
    exact_keys(input, new Set([`provider`, `formula`, `limit`]), `input`)
    const provider = required_text(input.provider, `provider`, 20)
    if (![`mp`, `alexandria`, `odbx`].includes(provider)) throw new Error(`Unsupported OPTIMADE provider.`)
    const limit = input.limit === undefined
      ? undefined
      : optional_finite(input, `limit`, { minimum: 1, integer: true })
    if (limit !== undefined && limit > 50) throw new Error(`limit cannot exceed 50.`)
    return {
      capability: name,
      kind: `read`,
      toolName: `fetch_optimade`,
      input: {
        provider,
        formula: required_text(input.formula, `formula`, 80),
        ...(limit === undefined ? {} : { limit }),
      },
    }
  }
  if (name === `catgo_load_optimade_structure`) {
    exact_keys(input, new Set([`viewer_id`, `base_revision`, `provider`, `id`]), `input`)
    const target = exact_structure_target(input)
    const provider = required_text(input.provider, `provider`, 20)
    if (![`mp`, `alexandria`, `odbx`].includes(provider)) throw new Error(`Unsupported OPTIMADE provider.`)
    const mapped = {
      ...target,
      provider,
      id: required_text(input.id, `id`, 200),
      dsh_overwrite_current: true,
    }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `load_optimade_structure`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `replace current structure from OPTIMADE`, ...target, provider, id: mapped.id },
        reason: `Review this database structure request. Allowing it replaces the exact current structure immediately.`,
        deniedMessage: `OPTIMADE structure load was denied by the user.`,
      },
    }
  }
  if (name === `catgo_search_pubchem`) {
    exact_keys(input, new Set([`name`]), `input`)
    return {
      capability: name,
      kind: `read`,
      toolName: `fetch_pubchem`,
      input: { name: required_text(input.name, `name`, 200) },
    }
  }
  if (name === `catgo_load_pubchem_molecule`) {
    exact_keys(input, new Set([`viewer_id`, `base_revision`, `name`, `cid`]), `input`)
    const target = exact_structure_target(input)
    const hasName = input.name !== undefined
    const hasCid = input.cid !== undefined
    if (hasName === hasCid) throw new Error(`Pass exactly one of name or cid.`)
    const mapped = hasName
      ? { ...target, name: required_text(input.name, `name`, 200), dsh_overwrite_current: true }
      : { ...target, cid: optional_finite(input, `cid`, { minimum: 1, integer: true })!, dsh_overwrite_current: true }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `load_pubchem`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `replace current structure from PubChem`, ...mapped },
        reason: `Review this PubChem molecule request. Allowing it replaces the exact current structure immediately.`,
        deniedMessage: `PubChem molecule load was denied by the user.`,
      },
    }
  }
  if (name === `catgo_make_supercell`) {
    exact_keys(input, new Set([`viewer_id`, `base_revision`, `nx`, `ny`, `nz`]), `input`)
    const target = exact_structure_target(input)
    const repeats = [`nx`, `ny`, `nz`].map((key) => optional_finite(input, key, {
      minimum: 1,
      integer: true,
    }))
    if (repeats.some((value) => value === undefined)) throw new Error(`nx, ny, and nz are required.`)
    const mapped = { ...target, nx: repeats[0], ny: repeats[1], nz: repeats[2] }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `make_supercell`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `make supercell`, ...mapped },
        reason: `Review the exact supercell replication before generation. The result will wait for your placement choice.`,
        deniedMessage: `Supercell generation was denied by the user.`,
      },
    }
  }
  if (name === `catgo_set_lattice`) {
    exact_keys(input, new Set([
      `viewer_id`, `base_revision`, `a`, `b`, `c`, `padding`, `cubic`,
    ]), `input`)
    const target = exact_structure_target(input)
    const mapped: Record<string, unknown> = { ...target }
    for (const key of [`a`, `b`, `c`] as const) {
      const value = optional_finite(input, key, { minimum: 0.000001 })
      if (value !== undefined) mapped[key] = value
    }
    const padding = optional_finite(input, `padding`, { minimum: 0 })
    const cubic = optional_boolean(input, `cubic`)
    if (padding !== undefined) mapped.padding = padding
    if (cubic !== undefined) mapped.cubic = cubic
    return {
      capability: name,
      kind: `mutate`,
      toolName: `set_lattice`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `set lattice`, ...mapped },
        reason: `Review the new periodic box before generation. The result will wait for your placement choice.`,
        deniedMessage: `Lattice generation was denied by the user.`,
      },
    }
  }
  if (name === `catgo_substitute_element`) {
    exact_keys(input, new Set([`viewer_id`, `base_revision`, `from`, `to`]), `input`)
    const mapped = {
      ...exact_structure_target(input),
      from: element_symbol(input.from, `from`),
      to: element_symbol(input.to, `to`),
    }
    if (mapped.from === mapped.to) throw new Error(`from and to must be different elements.`)
    return {
      capability: name,
      kind: `mutate`,
      toolName: `substitute_element`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `substitute element`, ...mapped },
        reason: `Review the global element substitution before generation. The result will wait for your placement choice.`,
        deniedMessage: `Element substitution was denied by the user.`,
      },
    }
  }
  if (name === `catgo_generate_slab`) {
    exact_keys(input, new Set([
      `viewer_id`, `miller_index`, `thickness`, `vacuum`, `base_revision`,
    ]), `input`)
    const target = exact_structure_target(input)
    const slab = slab_parameters(input)
    const [h, k, l] = slab.miller_index
    const mapped = {
      ...target,
      h,
      k,
      l,
      thickness: slab.thickness,
      vacuum: slab.vacuum,
    }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `generate_slab`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `generate Miller slab`, miller_index: slab.miller_index, ...mapped },
        reason: `Review the exact Miller slab request before generation. The result will wait for your placement choice.`,
        deniedMessage: `Slab generation was denied by the user.`,
      },
    }
  }
  if (name === `catgo_place_adsorbate`) {
    exact_keys(input, new Set([`viewer_id`, `base_revision`, `element`, `position`]), `input`)
    const mapped = {
      ...exact_structure_target(input),
      element: element_symbol(input.element, `element`),
      position: vector(input.position, `position`),
    }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `place_adsorbate`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `place adsorbate`, ...mapped },
        reason: `Review the adsorbate element and Cartesian position before generation. The result will wait for your placement choice.`,
        deniedMessage: `Adsorbate placement was denied by the user.`,
      },
    }
  }
  if (name === `catgo_get_spacegroup`) {
    exact_keys(input, new Set([`viewer_id`, `symprec`]), `input`)
    const mapped: Record<string, unknown> = { viewer_id: viewer_id(input.viewer_id) }
    const symprec = optional_finite(input, `symprec`, { minimum: 0.000000000001 })
    if (symprec !== undefined) mapped.symprec = symprec
    return { capability: name, kind: `read`, toolName: `get_spacegroup`, input: mapped }
  }
  if (name === `catgo_get_distance`) {
    exact_keys(input, new Set([`viewer_id`, `i`, `j`]), `input`)
    const i = optional_finite(input, `i`, { minimum: 0, integer: true })
    const j = optional_finite(input, `j`, { minimum: 0, integer: true })
    if (i === undefined || j === undefined) throw new Error(`i and j are required.`)
    if (i === j) throw new Error(`i and j must identify different atoms.`)
    return {
      capability: name,
      kind: `read`,
      toolName: `get_distance`,
      input: { viewer_id: viewer_id(input.viewer_id), i, j },
    }
  }
  if (name === `catgo_compute_xrd`) {
    exact_keys(input, new Set([`viewer_id`]), `input`)
    return {
      capability: name,
      kind: `read`,
      toolName: `compute_xrd`,
      input: { viewer_id: viewer_id(input.viewer_id) },
    }
  }
  if (name === `catgo_build_nanotube`) {
    exact_keys(input, new Set([
      `viewer_id`, `base_revision`, `n`, `m`, `NL`, `vacuum`,
    ]), `input`)
    const n = optional_finite(input, `n`, { minimum: 0, integer: true })
    const m = optional_finite(input, `m`, { minimum: 0, integer: true })
    if (n === undefined || m === undefined || (n === 0 && m === 0)) {
      throw new Error(`n and m are required non-negative integers and cannot both be zero.`)
    }
    const mapped: Record<string, unknown> = { ...exact_structure_target(input), n, m }
    const NL = optional_finite(input, `NL`, { minimum: 1, integer: true })
    const vacuum = optional_finite(input, `vacuum`, { minimum: 0 })
    if (NL !== undefined) mapped.NL = NL
    if (vacuum !== undefined) mapped.vacuum = vacuum
    return {
      capability: name,
      kind: `mutate`,
      toolName: `build_nanotube`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `build nanotube`, ...mapped },
        reason: `Review the chirality and tube dimensions before generation. The result will wait for your placement choice.`,
        deniedMessage: `Nanotube generation was denied by the user.`,
      },
    }
  }
  if (name === `catgo_build_nanoscroll`) {
    exact_keys(input, new Set([
      `viewer_id`, `base_revision`, `turns`, `inner_radius`, `length`,
    ]), `input`)
    const mapped: Record<string, unknown> = { ...exact_structure_target(input) }
    for (const key of [`turns`, `inner_radius`, `length`] as const) {
      const value = optional_finite(input, key, key === `turns`
        ? { minimum: 1, integer: true }
        : { minimum: 0.000001 })
      if (value !== undefined) mapped[key] = value
    }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `build_nanoscroll`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `build nanoscroll`, ...mapped },
        reason: `Review the nanoscroll geometry before generation. The result will wait for your placement choice.`,
        deniedMessage: `Nanoscroll generation was denied by the user.`,
      },
    }
  }
  if (name === `catgo_build_moire`) {
    exact_keys(input, new Set([
      `viewer_id`, `base_revision`, `twist_angle`, `max_index`,
    ]), `input`)
    const twist_angle = optional_finite(input, `twist_angle`)
    if (twist_angle === undefined || twist_angle < 0 || twist_angle > 180) {
      throw new Error(`twist_angle must be between 0 and 180 degrees.`)
    }
    const mapped: Record<string, unknown> = {
      ...exact_structure_target(input),
      twist_angle,
    }
    const max_index = optional_finite(input, `max_index`, { minimum: 1, integer: true })
    if (max_index !== undefined) mapped.max_index = max_index
    return {
      capability: name,
      kind: `mutate`,
      toolName: `build_moire`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `build moire bilayer`, ...mapped },
        reason: `Review the twist angle and commensurate-cell search limit before generation. The result will wait for your placement choice.`,
        deniedMessage: `Moiré bilayer generation was denied by the user.`,
      },
    }
  }
  if (name === `catgo_set_heterostructure_film`) {
    exact_keys(input, new Set([`viewer_id`]), `input`)
    return {
      capability: name,
      kind: `read`,
      toolName: `set_film`,
      input: { viewer_id: viewer_id(input.viewer_id) },
    }
  }
  if (name === `catgo_search_heterostructure`) {
    exact_keys(input, new Set([
      `viewer_id`, `substrate_miller`, `film_miller`, `max_area`,
      `max_strain_pct`, `max_results`,
    ]), `input`)
    const mapped: Record<string, unknown> = { viewer_id: viewer_id(input.viewer_id) }
    const substrate_miller = optional_miller(input, `substrate_miller`)
    const film_miller = optional_miller(input, `film_miller`)
    const max_area = optional_finite(input, `max_area`, { minimum: 0.000001 })
    const max_strain_pct = optional_finite(input, `max_strain_pct`, { minimum: 0 })
    const max_results = optional_finite(input, `max_results`, { minimum: 1, integer: true })
    if (substrate_miller) mapped.substrate_miller = substrate_miller
    if (film_miller) mapped.film_miller = film_miller
    if (max_area !== undefined) mapped.max_area = max_area
    if (max_strain_pct !== undefined) mapped.max_strain_pct = max_strain_pct
    if (max_results !== undefined) mapped.max_results = max_results
    return { capability: name, kind: `read`, toolName: `heterostructure_search`, input: mapped }
  }
  if (name === `catgo_build_heterostructure`) {
    exact_keys(input, new Set([
      `viewer_id`, `base_revision`, `match_index`, `gap`, `vacuum`,
      `twist_angle`, `swap`, `xy_shift`,
    ]), `input`)
    const target = exact_structure_target(input)
    const mapped: Record<string, unknown> = { ...target }
    const match_index = optional_finite(input, `match_index`, { minimum: 0, integer: true })
    const gap = optional_finite(input, `gap`, { minimum: 0 })
    const vacuum = optional_finite(input, `vacuum`, { minimum: 0 })
    const twist_angle = optional_finite(input, `twist_angle`)
    if (match_index !== undefined) mapped.match_index = match_index
    if (gap !== undefined) mapped.gap = gap
    if (vacuum !== undefined) mapped.vacuum = vacuum
    if (twist_angle !== undefined) mapped.twist_angle = twist_angle
    if (input.swap !== undefined) {
      if (typeof input.swap !== `boolean`) throw new Error(`swap must be boolean.`)
      mapped.swap = input.swap
    }
    if (input.xy_shift !== undefined) mapped.xy_shift = vector2(input.xy_shift, `xy_shift`)
    return {
      capability: name,
      kind: `mutate`,
      toolName: `build_heterostructure`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `vertical heterostructure`, ...mapped },
        reason: `Review this exact heterostructure candidate and geometry before CatBot builds it. The result will still wait for your Overwrite, Split, or New window choice.`,
        deniedMessage: `Heterostructure build was denied by the user.`,
      },
    }
  }
  if (name === `catgo_search_lateral_heterostructure`) {
    exact_keys(input, new Set([
      `viewer_id`, `interface_axis`, `max_strain_pct`, `max_length`, `max_results`,
    ]), `input`)
    const mapped: Record<string, unknown> = { viewer_id: viewer_id(input.viewer_id) }
    const interface_axis = optional_finite(input, `interface_axis`, { minimum: 0, integer: true })
    if (interface_axis !== undefined && interface_axis !== 0 && interface_axis !== 1) {
      throw new Error(`interface_axis must be 0 or 1.`)
    }
    const max_strain_pct = optional_finite(input, `max_strain_pct`, { minimum: 0 })
    const max_length = optional_finite(input, `max_length`, { minimum: 0.000001 })
    const max_results = optional_finite(input, `max_results`, { minimum: 1, integer: true })
    if (interface_axis !== undefined) mapped.interface_axis = interface_axis
    if (max_strain_pct !== undefined) mapped.max_strain_pct = max_strain_pct
    if (max_length !== undefined) mapped.max_length = max_length
    if (max_results !== undefined) mapped.max_results = max_results
    return {
      capability: name,
      kind: `read`,
      toolName: `lateral_heterostructure_search`,
      input: mapped,
    }
  }
  if (name === `catgo_build_lateral_heterostructure`) {
    exact_keys(input, new Set([
      `viewer_id`, `base_revision`, `match_index`, `width_A`, `width_B`, `buffer`, `vacuum`,
    ]), `input`)
    const target = exact_structure_target(input)
    const mapped: Record<string, unknown> = { ...target }
    const match_index = optional_finite(input, `match_index`, { minimum: 0, integer: true })
    const width_A = optional_finite(input, `width_A`, { minimum: 1, integer: true })
    const width_B = optional_finite(input, `width_B`, { minimum: 1, integer: true })
    const buffer = optional_finite(input, `buffer`, { minimum: 0 })
    const vacuum = optional_finite(input, `vacuum`, { minimum: 0 })
    if (match_index !== undefined) mapped.match_index = match_index
    if (width_A !== undefined) mapped.width_A = width_A
    if (width_B !== undefined) mapped.width_B = width_B
    if (buffer !== undefined) mapped.buffer = buffer
    if (vacuum !== undefined) mapped.vacuum = vacuum
    return {
      capability: name,
      kind: `mutate`,
      toolName: `build_lateral_heterostructure`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `lateral heterostructure`, ...mapped },
        reason: `Review this exact lateral heterojunction candidate and geometry before CatBot builds it. The result will still wait for your placement choice.`,
        deniedMessage: `Lateral heterostructure build was denied by the user.`,
      },
    }
  }
  if (name === `catgo_set_bulk_reference`) {
    exact_keys(input, new Set([`viewer_id`]), `input`)
    return {
      capability: name,
      kind: `read`,
      toolName: `set_bulk_reference`,
      input: { viewer_id: viewer_id(input.viewer_id) },
    }
  }
  if (name === `catgo_passivate_surface`) {
    exact_keys(input, new Set([
      `viewer_id`, `base_revision`, `bulk_coordination`,
    ]), `input`)
    const mapped: Record<string, unknown> = { ...exact_structure_target(input) }
    if (input.bulk_coordination !== undefined) {
      mapped.bulk_coordination = bulk_coordination(input.bulk_coordination)
    }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `passivate_surface`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { workflow: `passivate surface`, ...mapped },
        reason: `Review the target slab and reference coordination before adding pseudo-hydrogen. The result will wait for your placement choice.`,
        deniedMessage: `Surface passivation was denied by the user.`,
      },
    }
  }
  if (name === `catgo_preview_structure_change` || name === `catgo_apply_structure_change`) {
    const apply = name === `catgo_apply_structure_change`
    exact_keys(input, new Set(apply
      ? [`viewer_id`, `operation`, `base_revision`]
      : [`viewer_id`, `operation`]), `input`)
    const mapped = {
      ...map_operation(input.operation),
      viewer_id: viewer_id(input.viewer_id),
      ...(apply ? { base_revision: input.base_revision } : { preview: true }),
    }
    if (apply && (!Number.isInteger(input.base_revision) || Number(input.base_revision) < 0)) {
      throw new Error(`base_revision must be a non-negative integer.`)
    }
    return {
      capability: name,
      kind: apply ? `mutate` : `read`,
      toolName: `catgo_pane`,
      input: mapped,
      ...(apply
        ? {
          mutation: {
            mode: `structure-revision` as const,
            reason: `Review this exact native structure preview before CatGo commits it.`,
            deniedMessage: `Structure change was denied by the user.`,
          },
        }
        : {}),
    }
  }
  if (name === `catgo_read_terminal`) {
    exact_keys(input, new Set([`lines`]), `input`)
    const lines = input.lines === undefined ? 40 : Number(input.lines)
    if (!Number.isInteger(lines) || lines < 1 || lines > 500) {
      throw new Error(`lines must be an integer from 1 to 500.`)
    }
    return {
      capability: name,
      kind: `read`,
      toolName: `read_terminal`,
      input: { lines },
    }
  }
  if (name === `catgo_run_terminal_command`) {
    exact_keys(input, new Set([`command`, `timeout_ms`]), `input`)
    const command = bounded_text(input.command, `command`, 32_768)
    const timeoutMs = input.timeout_ms === undefined ? undefined : Number(input.timeout_ms)
    if (timeoutMs !== undefined &&
      (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000)) {
      throw new Error(`timeout_ms must be an integer from 1000 to 60000.`)
    }
    const mapped = { command, ...(timeoutMs === undefined ? {} : { timeout_ms: timeoutMs }) }
    return {
      capability: name,
      kind: `mutate`,
      toolName: `run_command`,
      input: mapped,
      mutation: {
        mode: `direct`,
        preview: { target: `active visible terminal`, ...mapped },
        reason: `Review this exact command before CatBot types it into the active visible terminal.`,
        deniedMessage: `Terminal command was denied by the user.`,
      },
    }
  }
  if (name === `catgo_send_terminal_keys`) {
    exact_keys(input, new Set([`keys`]), `input`)
    const keys = bounded_text(input.keys, `keys`, 8_192)
    return {
      capability: name,
      kind: `mutate`,
      toolName: `send_keys`,
      input: { keys },
      mutation: {
        mode: `direct`,
        preview: { target: `active visible terminal`, keys },
        reason: `Review these exact keystrokes before CatBot sends them to the active visible terminal.`,
        deniedMessage: `Terminal keystrokes were denied by the user.`,
      },
    }
  }
  if (name === `catgo_interrupt_terminal`) {
    exact_keys(input, new Set(), `input`)
    return {
      capability: name,
      kind: `mutate`,
      toolName: `interrupt_terminal`,
      input: {},
      mutation: {
        mode: `direct`,
        preview: { target: `active visible terminal`, keys: `<c-c>` },
        reason: `Review before CatBot sends Ctrl-C to the active visible terminal.`,
        deniedMessage: `Terminal interrupt was denied by the user.`,
      },
    }
  }
  throw new Error(`DSH capability is not allowed: ${name}.`)
}
