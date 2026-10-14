import type { AnyStructure } from '$lib'
import type { ClientTool, ToolExecutionContext, ToolKind } from './types'
import {
  clear_pending_client_load,
  client_load_or_card,
  get_current_structure,
  set_current_structure,
  stage_client_load_card,
} from '$lib/structure/current-structure.svelte'
import { relay_fetch } from './provider-routing'
import { fetch_optimade_structure, search_optimade_structures } from '$lib/api/optimade'
import { extract_atoms_from_pubchem, fetch_pubchem_compound } from '$lib/api/pubchem'
import { atomic_number_to_symbol } from '$lib/composition/parse'
import { optimade_to_pymatgen } from '$lib/structure/parse'
import {
  create_supercell,
  get_distance as ferrox_distance,
  get_spacegroup as ferrox_spacegroup,
  wasm_compute_xrd as ferrox_xrd,
} from '$lib/structure/ferrox-wasm'
import { generate_slab as ferrox_generate_slab } from '$lib/structure/miller-slab'
import { cartesian_to_fractional } from '$lib/structure/lattice-ops'
import { buildNanotube } from '$lib/api/nanotube'
import { buildNanoscroll } from '$lib/api/nanoscroll'
import { buildMoireBilayer, searchMoireAngles } from '$lib/api/moire'
import {
  buildHeterostructureManual,
  buildLateralInterface,
  searchHeterostructureMatches,
  searchLateralMatches,
} from '$lib/api/heterostructure'
import type {
  HeterostructureSearchParams,
  LateralBuildParams,
  LateralSearchParams,
} from '$lib/api/heterostructure'
import { passivateSlab } from '$lib/api/pseudo-hydrogen'
import type { PseudoHydrogenParams } from '$lib/api/pseudo-hydrogen'
import { preflightVasp } from '$lib/api/hpc'
import { hpc_session_store } from '$lib/hpc-sessions.svelte'
import { API_BASE } from '$lib/api/config'
import {
  get_bulk_stash,
  get_film_stash,
  get_hetero_matches,
  get_lateral_matches,
  get_lateral_search_params,
  set_bulk_stash,
  set_film_stash,
  set_hetero_matches,
  set_lateral_matches,
  set_lateral_search_params,
} from './hetero-stash.svelte'
import { get_run_status, run_workflow as api_run_workflow } from '$lib/api/workflow'
import { load_run_config } from '$lib/workflow/run-config-store'
import { iter_workflow_slices } from '$lib/workflow/workflow-state.svelte'
import { VIEWER_TOOLS } from './viewer-tools'
import { TERMINAL_TOOLS } from './terminal-tools'
import { CAMPAIGN_TOOLS } from './campaign-tools'
import { WORKFLOW_TOOL_DEFINITIONS } from './workflow-tools'
import { execute_workflow_tool } from './workflow-tool-executor'
import {
  list_viewers,
  refresh_viewer_manifest,
  resolve_viewer,
} from '$lib/structure/viewer-registry.svelte'
import {
  apply_native_structure_change,
  native_structure_revision,
  preview_native_structure_change,
  type NativeStructureOperation,
} from '$lib/structure/native-structure-service'

/** Minimal pymatgen-site shape the mutate executors read/write. */
interface MutSite {
  species: { element: string; occu?: number }[]
  abc?: number[]
  xyz?: number[]
  label?: string
}
interface MutStructure {
  sites: MutSite[]
  lattice?: { matrix: number[][] }
}

/** Deep-clone the current structure. `structuredClone` cannot handle the
 *  Svelte `$state` proxy the store holds ("could not be cloned"), so we use a
 *  JSON round-trip — safe for plain pymatgen structures (no functions/cycles).
 *  NOTE: requires JSON-safe `properties` (no functions, cycles, or class
 *  instances); anything not JSON-serializable is silently dropped. */
function clone_structure(): MutStructure {
  return JSON.parse(JSON.stringify(require_structure())) as MutStructure
}

type Executor = (
  input: Record<string, unknown>,
  context?: ToolExecutionContext,
) => Promise<unknown> | unknown

interface ToolEntry {
  def: ClientTool
  run: Executor
}

const REGISTRY = new Map<string, ToolEntry>()

/**
 * Exported tool-schema list. Kept as a stable array reference (the test and
 * later tasks import it directly), but `register()` pushes into it on every
 * registration, so it always reflects ALL registered tools regardless of the
 * order in which `register(...)` calls appear in this file.
 */
export const CLIENT_TOOLS: ClientTool[] = []

function register(def: ClientTool, run: Executor): void {
  REGISTRY.set(def.name, { def, run })
  if (!CLIENT_TOOLS.some((t) => t.name === def.name)) CLIENT_TOOLS.push(def)
}

function require_viewer(ref?: unknown, tab_id?: string) {
  const resolved = resolve_viewer(typeof ref === `string` ? ref : undefined, tab_id)
  if (resolved.error || !resolved.handle || !resolved.manifest) {
    throw new Error(resolved.error ?? `Viewer is not available.`)
  }
  return { handle: resolved.handle, manifest: resolved.manifest }
}

function structure_target(input: Record<string, unknown>, tab_id?: string): {
  structure: AnyStructure
  viewer_id?: string
  revision?: number
} {
  if (typeof input.viewer_id === `string` && input.viewer_id.trim()) {
    const { handle, manifest } = require_viewer(input.viewer_id, tab_id)
    const structure = handle.get_structure()
    if (!structure) throw new Error(`Viewer ${manifest.viewer_id} has no structure loaded.`)
    return {
      structure,
      viewer_id: manifest.viewer_id,
      revision: native_structure_revision(manifest.viewer_id, tab_id),
    }
  }
  return { structure: require_structure() }
}

function require_matching_revision(
  target: ReturnType<typeof structure_target>,
  input: Record<string, unknown>,
): void {
  if (!target.viewer_id) return
  const base_revision = Number(input.base_revision)
  if (!Number.isInteger(base_revision) || base_revision < 0) {
    throw new Error(`base_revision is required for an exact structure target.`)
  }
  if (target.revision !== base_revision) {
    throw new Error(
      `Stale structure revision for ${target.viewer_id}: expected ${base_revision}, current ${String(target.revision)}. Inspect the pane again before continuing.`,
    )
  }
}

function clone_target(target: ReturnType<typeof structure_target>): MutStructure {
  return JSON.parse(JSON.stringify(target.structure)) as MutStructure
}

/** DSH exact-pane builders never choose a destination on the user's behalf.
 * Legacy client-direct calls keep their historical immediate-current-viewer
 * behavior, while exact viewer calls stage a placement card. */
function stage_exact_result(
  target: ReturnType<typeof structure_target>,
  structure: AnyStructure,
): boolean {
  if (!target.viewer_id) return client_load_or_card(
    structure,
    plain_formula(structure),
    (structure as { sites?: unknown[] }).sites?.length ?? 0,
  )
  stage_client_load_card(
    structure,
    plain_formula(structure),
    (structure as { sites?: unknown[] }).sites?.length ?? 0,
  )
  return false
}

/** Apply an approved database import to the exact originating viewer.
 *
 * DSH already showed the user a permission card containing the provider and
 * identifier. Requiring a second placement-card click made a successful
 * "import" leave the old H2O structure on screen and look broken. Exact-pane
 * imports therefore replace the reviewed target atomically after approval;
 * legacy/direct providers retain the existing placement-card behavior.
 */
function apply_import_result(
  input: Record<string, unknown>,
  context: ToolExecutionContext | undefined,
  structure: AnyStructure,
  formula: string,
  n: number,
): { applied: boolean; viewer_id?: string; revision?: number } {
  if (input.dsh_overwrite_current === true) {
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    if (!target.viewer_id) throw new Error(`viewer_id is required for an approved DSH import.`)
    const { handle, manifest } = require_viewer(target.viewer_id, context?.tab_id)
    if (!manifest.editable) throw new Error(`Viewer ${manifest.viewer_id} is read-only.`)
    handle.set_structure(structure)
    clear_pending_client_load()
    refresh_viewer_manifest(manifest.viewer_id)
    return {
      applied: true,
      viewer_id: manifest.viewer_id,
      revision: native_structure_revision(manifest.viewer_id, context?.tab_id),
    }
  }
  const applied = input.dsh_stage === true
    ? (stage_client_load_card(structure, formula, n), false)
    : client_load_or_card(structure, formula, n)
  return { applied }
}

register(
  {
    name: `catgo_pane`,
    description:
      `Native in-process adapter for one exact structure/trajectory pane. list returns all panes. inspect returns indexed atoms, neighbors, coordination, connected components, terminal and branch candidates plus a revision. Atomic edits and generate_slab target only viewer_id; set preview=true to validate without changing the viewer, then pass the returned revision as base_revision when applying. generate_slab cuts a periodic bulk crystal along miller_index with thickness and vacuum in Angstroms. Trajectory edits apply to all frames after topology validation. Inspect semantic atom descriptions first and never guess among equivalent candidates. MCP is not used for these operations.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        action: {
          type: `string`,
          enum: [`list`, `inspect`, `revision`, `add_atom`, `delete_atoms`, `replace_atoms`, `move_atoms`, `scale_geometry`, `generate_slab`],
        },
        viewer_id: {
          type: `string`,
          description: `Stable viewer_id or a unique position alias such as bottom-right/右下角.`,
        },
        terminal_only: { type: `boolean`, description: `Optional inspect filter.` },
        element: { type: `string`, description: `Element for add_atom/replace_atoms or inspect filter.` },
        position: {
          type: `array`,
          items: { type: `number` },
          minItems: 3,
          maxItems: 3,
          description: `Cartesian position in Angstrom for add_atom.`,
        },
        indices: { type: `array`, items: { type: `integer` } },
        moves: {
          type: `array`,
          items: {
            type: `object`,
            properties: {
              index: { type: `integer` },
              displacement: {
                type: `array`,
                items: { type: `number` },
                minItems: 3,
                maxItems: 3,
              },
            },
            required: [`index`, `displacement`],
          },
        },
        factor: { type: `number`, exclusiveMinimum: 0 },
        miller_index: {
          type: `array`,
          items: { type: `integer` },
          minItems: 3,
          maxItems: 3,
          description: `Miller index [h, k, l] for generate_slab; (0,0,0) is invalid.`,
        },
        thickness: {
          type: `number`,
          exclusiveMinimum: 0,
          description: `Requested slab thickness in Angstroms.`,
        },
        vacuum: {
          type: `number`,
          minimum: 0,
          description: `Vacuum thickness in Angstroms.`,
        },
        preview: {
          type: `boolean`,
          description: `Validate and summarize a mutation without changing the viewer.`,
        },
        base_revision: {
          type: `integer`,
          minimum: 0,
          description: `Optimistic concurrency guard returned by inspect or preview.`,
        },
      },
      required: [`action`],
    },
  },
  (input, context) => {
    const action = String(input.action ?? ``)
    if (action === `list`) return { viewers: list_viewers(context?.tab_id) }

    const { handle, manifest } = require_viewer(input.viewer_id, context?.tab_id)
    if (action === `inspect`) {
      let atoms = handle.inspect_atoms?.() ?? []
      if (input.element) atoms = atoms.filter((atom) => atom.element === String(input.element))
      if (input.terminal_only === true) atoms = atoms.filter((atom) => atom.terminal)
      return {
        viewer: manifest,
        revision: native_structure_revision(manifest.viewer_id, context?.tab_id),
        atoms,
      }
    }
    if (action === `revision`) {
      return {
        viewer_id: manifest.viewer_id,
        revision: native_structure_revision(manifest.viewer_id, context?.tab_id),
      }
    }

    let operation: NativeStructureOperation
    if (action === `add_atom`) {
      const element = String(input.element ?? ``).trim()
      const position = Array.isArray(input.position) ? input.position.map(Number) : []
      if (!element || position.length !== 3 || !position.every(Number.isFinite)) {
        throw new Error(`element and a 3D Cartesian position are required.`)
      }
      operation = { type: `add_atom`, element, position: [position[0], position[1], position[2]] }
    } else if (action === `delete_atoms`) {
      const indices = [...new Set((Array.isArray(input.indices) ? input.indices : []).map(Number))]
        .filter((idx) => Number.isInteger(idx) && idx >= 0)
      if (!indices.length) throw new Error(`At least one valid atom index is required.`)
      operation = { type: `delete_atoms`, indices }
    } else if (action === `move_atoms`) {
      const moves: { index: number; displacement: [number, number, number] }[] = []
      for (const move of Array.isArray(input.moves) ? input.moves as Record<string, unknown>[] : []) {
        const d = Array.isArray(move.displacement) ? move.displacement.map(Number) : []
        if (Number.isInteger(Number(move.index)) && d.length === 3 && d.every(Number.isFinite)) {
          moves.push({ index: Number(move.index), displacement: [d[0], d[1], d[2]] })
        }
      }
      if (!moves.length) throw new Error(`No valid atom moves were supplied.`)
      operation = { type: `move_atoms`, moves }
    } else if (action === `replace_atoms`) {
      const element = String(input.element ?? ``).trim()
      const indices = [...new Set((Array.isArray(input.indices) ? input.indices : []).map(Number))]
        .filter((idx) => Number.isInteger(idx) && idx >= 0)
      if (!element || !indices.length) throw new Error(`element and atom indices are required.`)
      operation = { type: `replace_atoms`, indices, element }
    } else if (action === `scale_geometry`) {
      const factor = Number(input.factor)
      if (!Number.isFinite(factor) || factor <= 0) throw new Error(`factor must be a positive number.`)
      operation = { type: `scale_geometry`, factor }
    } else if (action === `generate_slab`) {
      const miller_index = Array.isArray(input.miller_index) ? input.miller_index.map(Number) : []
      const thickness = Number(input.thickness)
      const vacuum = Number(input.vacuum)
      if (
        miller_index.length !== 3 ||
        !miller_index.every(Number.isInteger) ||
        miller_index.every((value) => value === 0)
      ) {
        throw new Error(`miller_index must contain three integers and cannot be (0, 0, 0).`)
      }
      if (!Number.isFinite(thickness) || thickness <= 0) {
        throw new Error(`thickness must be a positive number in Angstroms.`)
      }
      if (!Number.isFinite(vacuum) || vacuum < 0) {
        throw new Error(`vacuum must be a non-negative number in Angstroms.`)
      }
      operation = {
        type: `generate_slab`,
        miller_index: [miller_index[0], miller_index[1], miller_index[2]],
        thickness,
        vacuum,
      }
    } else {
      throw new Error(`Unsupported catgo_pane action: ${action}`)
    }

    if (input.preview === true) {
      return preview_native_structure_change(manifest.viewer_id, operation, context?.tab_id)
    }
    const base_revision = Number(input.base_revision)
    if (input.base_revision === undefined || !Number.isInteger(base_revision) || base_revision < 0) {
      throw new Error(
        `base_revision is required for mutations. Inspect or preview again, then pass its revision.`,
      )
    }
    return apply_native_structure_change(manifest.viewer_id, operation, {
      base_revision,
      tab_id: context?.tab_id,
    })
  },
)

/** Require an active structure or throw a user-facing error. */
function require_structure(): AnyStructure {
  const s = get_current_structure()
  if (!s) throw new Error(`No structure is currently loaded in the viewer.`)
  return s
}

/** Plain-text (no markup) reduced-count formula derived directly from sites.
 *  Synchronous + node-safe (no WASM), suitable for compact tool results. */
function plain_formula(structure: AnyStructure): string {
  const sites = (structure as { sites?: { species?: { element?: string }[] }[] }).sites ??
    []
  const counts = new Map<string, number>()
  for (const site of sites) {
    const el = site.species?.[0]?.element
    if (el) counts.set(el, (counts.get(el) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([el, n]) => (n === 1 ? el : `${el}${n}`))
    .join(``)
}

/** Element symbols of the currently loaded structure (POSCAR-style set). */
function current_elements(): string[] {
  const s = get_current_structure() as
    | { sites?: { species?: { element?: string }[] }[] }
    | null
  if (!s?.sites) return []
  const set = new Set<string>()
  for (const site of s.sites) {
    const el = site.species?.[0]?.element
    if (el) set.add(el)
  }
  return [...set]
}

// ── validate_hpc_config (read) ──
// Lets the in-app AI (any API-key provider, not just Claude Code) validate a
// VASP cluster config against the LIVE cluster over SSH, reusing the same
// /hpc/preflight/vasp probe the "Test configuration" button uses.
register(
  {
    name: `validate_hpc_config`,
    description:
      `Validate the VASP/HPC cluster configuration against the LIVE connected cluster before submitting a workflow. Over SSH it checks that the POTCAR root and functional directories exist, that the pseudopotential for each element of the current structure is present, and that the VASP binary resolves under the given module loads + conda/Python environment (the real submit-script environment, not a bare login shell). Use this whenever the user asks to test/verify/debug their cluster setup or before running a VASP workflow — never guess whether a cluster is configured correctly. Read potcar_root, potcar_functional, vasp_command, module_loads and python_env from the user's run configuration or their submit script; the session and element list are filled automatically.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        potcar_root: {
          type: `string`,
          description:
            `Remote directory holding the POTCAR pseudopotential tree, e.g. /scratch/user/VASP/pot64`,
        },
        potcar_functional: {
          type: `string`,
          description:
            `Functional subdirectory, e.g. potpaw_PBE (default), potpaw_PBE.54, potpaw_LDA`,
        },
        vasp_command: {
          type: `string`,
          description:
            `VASP run command from the submit script, e.g. "srun --hint=nomultithread vasp_std"`,
        },
        module_loads: {
          type: `string`,
          description: `module load lines from the submit script, newline-separated`,
        },
        python_env: {
          type: `string`,
          description: `conda/env activation lines from the submit script`,
        },
        elements: {
          type: `array`,
          items: { type: `string` },
          description:
            `Element symbols to check; defaults to the current structure's elements`,
        },
        session_id: {
          type: `string`,
          description: `HPC session id; defaults to the active connected cluster`,
        },
      },
      required: [`potcar_root`],
    },
  },
  async (input, context) => {
    const sessions = hpc_session_store.sessions || []
    const session_id = (input.session_id as string) || sessions[0]?.session_id
    if (!session_id) {
      throw new Error(
        `No connected HPC cluster. Connect a cluster in the HPC panel first, then retry.`,
      )
    }
    const elements = Array.isArray(input.elements) && input.elements.length
      ? (input.elements as string[])
      : current_elements()
    return await preflightVasp(session_id, {
      potcar_root: String(input.potcar_root ?? ``),
      potcar_functional: input.potcar_functional
        ? String(input.potcar_functional)
        : `potpaw_PBE`,
      vasp_command: input.vasp_command ? String(input.vasp_command) : undefined,
      module_loads: input.module_loads ? String(input.module_loads) : undefined,
      python_env: input.python_env ? String(input.python_env) : undefined,
      elements,
    })
  },
)

// ── get_skill (read): progressive skill loading for the in-app AI ──
// CatBot's live loop only passes CLIENT_TOOLS, so without this tool the
// in-app AI (DeepSeek/Qwen/etc.) cannot reach the /api/skills guides at all.
// Call with no arg to LIST, then with skill_path to READ — progressive
// disclosure, not the whole skill corpus in the prompt.
register(
  {
    name: `get_skill`,
    description:
      `Load a CatGo skill guide — a domain playbook / best-practice checklist for VASP/CP2K/ORCA/QE calculations, structure building, analysis, or troubleshooting. Call with NO argument to LIST available skills, then call again with a skill_path (e.g. "vasp/relax", "troubleshooting/cluster_config_test", "analysis/oer") to READ that skill and follow its guidance. Consult the relevant skill BEFORE building a workflow or diagnosing a cluster/job problem, instead of guessing.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        skill_path: {
          type: `string`,
          description:
            `Skill path to read, e.g. "vasp/relax". Omit to list all available skills.`,
        },
      },
    },
  },
  async (input) => {
    const path = String((input.skill_path as string) ?? ``).trim().replace(
      /^\/+|\/+$/g,
      ``,
    )
    const url = path ? `${API_BASE}/skills/${path}` : `${API_BASE}/skills/`
    let res: Response
    try {
      res = await fetch(url)
    } catch {
      // fetch() rejects only on network-level failure: mobile/static builds
      // have no Python backend at API_BASE, and desktop may not have it running.
      throw new Error(
        `Skill guides require the CatGo backend, which is unreachable (mobile/static build, or backend not running). Proceed with your own domain knowledge instead of retrying.`,
      )
    }
    if (!res.ok) {
      throw new Error(
        `Skill fetch failed (HTTP ${res.status}). Call get_skill with no argument to list available skills.`,
      )
    }
    const data = await res.json()
    return path ? (data.content ?? data) : (data.skills ?? data)
  },
)

// ── get_structure_info (read) ──
register(
  {
    name: `get_structure_info`,
    description:
      `Get composition, formula, site count, and lattice of the currently loaded structure.`,
    kind: `read`,
    input_schema: { type: `object`, properties: {} },
  },
  (input, context) => {
    const target = structure_target(input, context?.tab_id)
    const s = target.structure as {
      sites: { species: { element: string }[] }[]
      lattice?: { matrix: number[][] }
    }
    const elements = [
      ...new Set(s.sites.map((site) => site.species[0]?.element).filter(Boolean)),
    ]
    return {
      viewer_id: target.viewer_id,
      revision: target.revision,
      num_sites: s.sites.length,
      elements,
      lattice: s.lattice?.matrix ?? null,
    }
  },
)

const OPTIMADE_BASES: Record<string, string> = {
  mp: `https://optimade.materialsproject.org`,
  alexandria: `https://alexandria.icams.rub.de/pbe`,
  odbx: `https://optimade.odbx.science`,
}

// ── fetch_optimade (read) ──
register(
  {
    name: `fetch_optimade`,
    description:
      `SEARCH an OPTIMADE crystal-structure database by chemical formula; returns a list of {id, formula}. This does NOT load anything into the viewer — call load_optimade_structure with a chosen id to actually load it. Providers: mp (Materials Project), alexandria, odbx.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        provider: {
          type: `string`,
          enum: [`mp`, `alexandria`, `odbx`],
          description: `Database provider id.`,
        },
        formula: {
          type: `string`,
          description: `Reduced chemical formula, e.g. "NaCl".`,
        },
        limit: { type: `integer`, description: `Max results (default 5).` },
      },
      required: [`provider`, `formula`],
    },
  },
  async (input) => {
    const provider = String(input.provider)
    const base = OPTIMADE_BASES[provider]
    if (!base) throw new Error(`Unknown OPTIMADE provider: ${provider}`)
    // Delegate to the shared search used by the Search-Database modal so the
    // formula is normalized correctly: element-only formulas like "NaCl" become
    // an `elements HAS ALL` query (chemical_formula_reduced is alphabetical+reduced,
    // i.e. "ClNa", so a literal "NaCl" match returns nothing). relay routing,
    // provider base_url resolution, and sorting are reused.
    const providers = [{
      id: provider,
      type: `links`,
      attributes: { name: provider, description: ``, base_url: base },
    }]
    const res = await search_optimade_structures(provider, providers as never, {
      formula: String(input.formula),
      limit: Number(input.limit ?? 5),
    })
    return {
      results: res.structures.map((s) => ({
        id: s.id,
        formula: (s.attributes as { chemical_formula_reduced?: string } | undefined)
          ?.chemical_formula_reduced,
      })),
    }
  },
)

// ── load_optimade_structure (mutate) ──
register(
  {
    name: `load_optimade_structure`,
    description:
      `Load a specific OPTIMADE structure (by its id, e.g. "mp-22851") into the viewer so it becomes the current structure. Use the id from fetch_optimade results. This replaces the currently loaded structure.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        provider: {
          type: `string`,
          enum: [`mp`, `alexandria`, `odbx`],
          description: `Database provider id.`,
        },
        id: { type: `string`, description: `OPTIMADE structure id, e.g. "mp-22851".` },
      },
      required: [`provider`, `id`],
    },
  },
  async (input, context) => {
    const provider = String(input.provider)
    const base = OPTIMADE_BASES[provider]
    if (!base) throw new Error(`Unknown OPTIMADE provider: ${provider}`)
    const providers = [{
      id: provider,
      type: `links`,
      attributes: { name: provider, description: ``, base_url: base },
    }]
    const struct = await fetch_optimade_structure(
      String(input.id),
      provider,
      providers as never,
    )
    if (!struct) throw new Error(`Structure "${input.id}" not found on ${provider}.`)
    const pymatgen = optimade_to_pymatgen(struct)
    if (!pymatgen) throw new Error(`Could not parse structure "${input.id}".`)
    const sites = (pymatgen as { sites?: unknown[] }).sites ?? []
    const formula =
      (struct.attributes as { chemical_formula_reduced?: string } | undefined)
        ?.chemical_formula_reduced ?? String(input.id)
    const placement = apply_import_result(
      input,
      context,
      pymatgen as never,
      formula,
      sites.length,
    )
    return {
      loaded: String(input.id),
      formula:
        (struct.attributes as { chemical_formula_reduced?: string } | undefined)
          ?.chemical_formula_reduced,
      num_sites: sites.length,
      ...placement,
      message: placement.applied
        ? `Loaded ${input.id} into ${placement.viewer_id ?? `the viewer`}.`
        : `Loaded ${input.id}. The viewer already has a structure — choose where to put it (Overwrite / Split / New window) in the card.`,
    }
  },
)

/** Look up a molecule by name in PubChem → {cid, smiles}. Shared by
 *  fetch_pubchem (search) and load_pubchem (load). Throws a clear error if
 *  there is no match or no SMILES.
 *
 *  PubChem renamed its SMILES properties (2025): `CanonicalSMILES` →
 *  `ConnectivitySMILES` / `SMILES`. The legacy property name is still accepted
 *  by the request URL (HTTP 200), but the RESPONSE now keys the value under the
 *  new name — so the old read of `p.CanonicalSMILES` silently returned
 *  undefined. Keep the still-accepted legacy request property, but read every
 *  known spelling from the response and fail loudly if none is present. */
async function pubchem_lookup(identifier: string | number): Promise<{ cid: number; smiles: string }> {
  const query = String(identifier).trim()
  const by_cid = /^[1-9]\d*$/.test(query)
  const encoded = encodeURIComponent(query)
  const url =
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${by_cid ? `cid` : `name`}/${encoded}/property/CanonicalSMILES/JSON`
  const resp = await relay_fetch(url)
  if (!resp.ok) throw new Error(`PubChem error ${resp.status}`)
  const data = (await resp.json()) as {
    PropertyTable?: {
      Properties?: {
        CID: number
        SMILES?: string
        ConnectivitySMILES?: string
        CanonicalSMILES?: string
      }[]
    }
  }
  const p = data.PropertyTable?.Properties?.[0]
  if (!p) throw new Error(`No PubChem match for "${query}"`)
  const smiles = p.SMILES ?? p.ConnectivitySMILES ?? p.CanonicalSMILES
  if (!smiles) throw new Error(`PubChem returned no SMILES for "${query}"`)
  return { cid: p.CID, smiles }
}

// ── fetch_pubchem (read) ──
register(
  {
    name: `fetch_pubchem`,
    description:
      `Look up a molecule by name in PubChem and return its CID and canonical SMILES.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        name: { type: `string`, description: `Molecule name, e.g. "water".` },
      },
      required: [`name`],
    },
  },
  async (input, context) => {
    return await pubchem_lookup(String(input.name))
  },
)

// ── load_pubchem (mutate) ──
register(
  {
    name: `load_pubchem`,
    description:
      `Load a molecule from PubChem into the viewer by name (e.g. 'methane', 'benzene') so it becomes the current structure. Fetches the 3D structure. Use this to actually LOAD a molecule (fetch_pubchem only looks up the CID/SMILES). This replaces the currently loaded structure.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        name: { type: `string`, description: `Molecule name, e.g. "methane".` },
        cid: { type: `integer`, minimum: 1, description: `PubChem CID returned by fetch_pubchem.` },
      },
      anyOf: [{ required: [`name`] }, { required: [`cid`] }],
    },
  },
  async (input, context) => {
    const identifier = input.cid ?? input.name
    if (identifier === undefined || identifier === null || String(identifier).trim() === ``) {
      throw new Error(`Pass either a PubChem molecule name or CID.`)
    }
    const display_name = input.name === undefined ? `CID ${identifier}` : String(input.name)
    // 1. name → SMILES (+CID), reusing fetch_pubchem's lookup.
    const { cid, smiles } = await pubchem_lookup(identifier as string | number)
    // 2. Prefer PubChem's own 3D conformer. This works in desktop, browser,
    // and packaged builds without optional RDKit/Open Babel installations.
    const compound = await fetch_pubchem_compound(cid)
    const pubchem_atoms = compound ? extract_atoms_from_pubchem(compound).atoms : []
    let elements: string[] = pubchem_atoms.map((atom) => atomic_number_to_symbol[atom.number])
    let cart_coords = pubchem_atoms.map((atom) => [atom.x, atom.y, atom.z])

    // Some compounds have no PubChem 3D record. Fall back to local SMILES→3D
    // when the optional chemistry backend is available.
    if (!pubchem_atoms.length || elements.some((element) => !element)) {
      let resp: Response
      try {
        resp = await fetch(`${API_BASE}/structure-ops/smiles-to-xyz`, {
          method: `POST`,
          headers: { 'Content-Type': `application/json` },
          body: JSON.stringify({ smiles }),
        })
      } catch {
        throw new Error(
          `PubChem has no usable 3D conformer for ${display_name}, and the optional local SMILES→3D backend is unreachable.`,
        )
      }
      if (!resp.ok) {
        throw new Error(
          `PubChem has no usable 3D conformer for ${display_name}; local SMILES→3D also failed (HTTP ${resp.status}): ${await resp.text()}`,
        )
      }
      const generated = (await resp.json()) as {
        elements: string[]
        cart_coords: number[][]
      }
      elements = generated.elements
      cart_coords = generated.cart_coords
    }
    if (!elements?.length || elements.length !== cart_coords?.length) {
      throw new Error(`SMILES→3D returned no usable coordinates for "${display_name}".`)
    }
    // 3. Build a non-periodic MOLECULE (no lattice). Site shape mirrors the XYZ
    //    parser / pubchem_to_pymatgen: cartesian xyz, abc = xyz for molecules.
    const sites = elements.map((element, idx) => {
      const xyz = (cart_coords[idx] ?? [0, 0, 0]).map(Number)
      return {
        species: [{ element, occu: 1, oxidation_state: 0 }],
        abc: [...xyz],
        xyz,
        label: `${element}${idx + 1}`,
        properties: {},
      }
    })
    const struct = { sites } as unknown as AnyStructure
    // 4. Compact formula (derived from elements) — needed for both the card
    //    label and the result.
    const counts = new Map<string, number>()
    for (const el of elements) counts.set(el, (counts.get(el) ?? 0) + 1)
    const formula = [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([el, n]) => (n === 1 ? el : `${el}${n}`))
      .join(``)
    // 5. Apply if the viewer is empty; otherwise stage a pending load so the
    //    ChatPane card asks where to put it (overwrite / split / new window).
    const n = sites.length
    const placement = apply_import_result(input, context, struct as never, formula, n)
    return {
      loaded: display_name,
      cid,
      formula,
      num_sites: n,
      ...placement,
      message: placement.applied
        ? `Loaded ${display_name} (CID ${cid}) into ${placement.viewer_id ?? `the viewer`}.`
        : `Loaded ${display_name} (CID ${cid}). The viewer already has a structure — choose where to put it (Overwrite / Split / New window) in the card.`,
    }
  },
)

// ── make_supercell (mutate) ──
register(
  {
    name: `make_supercell`,
    description: `Replicate the current structure into an nx×ny×nz supercell.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        nx: { type: `integer`, minimum: 1, description: `Repeats along a (≥1).` },
        ny: { type: `integer`, minimum: 1, description: `Repeats along b (≥1).` },
        nz: { type: `integer`, minimum: 1, description: `Repeats along c (≥1).` },
      },
      required: [`nx`, `ny`, `nz`],
    },
  },
  async (input, context) => {
    const nx = Math.trunc(Number(input.nx))
    const ny = Math.trunc(Number(input.ny))
    const nz = Math.trunc(Number(input.nz))
    if (!(nx >= 1 && ny >= 1 && nz >= 1)) {
      throw new Error(`nx, ny, nz must be integers ≥ 1.`)
    }
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const res = await create_supercell(target.structure as never, nx, ny, nz)
    if (`error` in res) throw new Error(res.error)
    const structure = res.ok as unknown as AnyStructure
    const applied = target.viewer_id
      ? (stage_client_load_card(
        structure,
        plain_formula(structure),
        (structure as unknown as MutStructure).sites.length,
      ), false)
      : (set_current_structure(structure), true)
    return { num_sites: (structure as unknown as MutStructure).sites.length, applied }
  },
)

// ── set_lattice (mutate) — give a molecule a periodic box ──
register(
  {
    name: `set_lattice`,
    description:
      `Add or replace an orthorhombic (box) lattice on the current structure. This is the correct way to give a non-periodic molecule a periodic cell — do NOT use make_supercell for that. Provide explicit box lengths a/b/c in Å, or omit them to auto-size a box around the molecule's extent plus vacuum padding on every side. Set cubic:true to force a cube. Atoms are re-centered in the new box.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        a: {
          type: `number`,
          description:
            `Box length along x in Å (optional; auto-sized from the structure if omitted).`,
        },
        b: { type: `number`, description: `Box length along y in Å (optional).` },
        c: { type: `number`, description: `Box length along z in Å (optional).` },
        padding: {
          type: `number`,
          description:
            `Vacuum padding added on each side when auto-sizing, in Å (default 8).`,
        },
        cubic: {
          type: `boolean`,
          description:
            `Force a cubic box using the largest of the three lengths (default false).`,
        },
      },
    },
  },
  (input, context) => {
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const next = clone_target(target)
    const sites = next.sites
    if (!sites.length) throw new Error(`The current structure has no atoms.`)
    const xyzs = sites.map((s) =>
      (s.xyz ?? [0, 0, 0]).map(Number) as [number, number, number]
    )
    const min = [0, 1, 2].map((k) => Math.min(...xyzs.map((p) => p[k])))
    const max = [0, 1, 2].map((k) => Math.max(...xyzs.map((p) => p[k])))
    const extent = [0, 1, 2].map((k) => max[k] - min[k])

    const pad = input.padding != null ? Number(input.padding) : 8
    const given = [input.a, input.b, input.c].map((v) => (v != null ? Number(v) : null))
    let box = [0, 1, 2].map((k) =>
      given[k] != null && (given[k] as number) > 0
        ? (given[k] as number)
        : extent[k] + 2 * pad
    )
    if (input.cubic === true) {
      const L = Math.max(...box)
      box = [L, L, L]
    }
    if (!box.every((L) => L > 0 && Number.isFinite(L))) {
      throw new Error(`Computed box lengths are invalid: ${box.join(`, `)}`)
    }

    const matrix: number[][] = [
      [box[0], 0, 0],
      [0, box[1], 0],
      [0, 0, box[2]],
    ]
    const mat3 = matrix as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ]
    for (let i = 0; i < sites.length; i++) {
      const p = xyzs[i]
      const centered: [number, number, number] = [
        p[0] - min[0] + (box[0] - extent[0]) / 2,
        p[1] - min[1] + (box[1] - extent[1]) / 2,
        p[2] - min[2] + (box[2] - extent[2]) / 2,
      ]
      sites[i].xyz = centered
      sites[i].abc = cartesian_to_fractional(centered, mat3)
    }
    const lattice = {
      matrix,
      a: box[0],
      b: box[1],
      c: box[2],
      alpha: 90,
      beta: 90,
      gamma: 90,
      volume: box[0] * box[1] * box[2],
      pbc: [true, true, true],
    }
    next.lattice = lattice as MutStructure[`lattice`]
    const applied = target.viewer_id
      ? (stage_client_load_card(next as never, plain_formula(next as never), sites.length), false)
      : (set_current_structure(next as never), true)
    return {
      lattice: { a: +box[0].toFixed(2), b: +box[1].toFixed(2), c: +box[2].toFixed(2) },
      num_sites: sites.length,
      cubic: input.cubic === true,
      applied,
    }
  },
)

// ── substitute_element (mutate) ──
register(
  {
    name: `substitute_element`,
    description: `Replace every atom of one element with another element.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        from: { type: `string`, description: `Element symbol to replace, e.g. "Na".` },
        to: { type: `string`, description: `Replacement element symbol, e.g. "K".` },
      },
      required: [`from`, `to`],
    },
  },
  (input, context) => {
    const from = String(input.from)
    const to = String(input.to)
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const next = clone_target(target)
    let replaced = 0
    for (const site of next.sites) {
      if (site.species[0]?.element === from) {
        site.species[0].element = to
        if (site.label === from) site.label = to
        replaced++
      }
    }
    if (replaced === 0) throw new Error(`No atoms of element "${from}" found.`)
    const applied = target.viewer_id
      ? (stage_client_load_card(next as never, plain_formula(next as never), next.sites.length), false)
      : (set_current_structure(next as never), true)
    return { replaced, applied }
  },
)

// ── generate_slab (mutate) ──
register(
  {
    name: `generate_slab`,
    description:
      `Cut a surface slab from the current bulk structure along a Miller plane (h,k,l) with given thickness and vacuum (Angstroms).`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        h: { type: `integer`, description: `Miller index h.` },
        k: { type: `integer`, description: `Miller index k.` },
        l: { type: `integer`, description: `Miller index l.` },
        thickness: {
          type: `number`,
          description: `Slab thickness in Angstroms (default 10).`,
        },
        vacuum: {
          type: `number`,
          description: `Vacuum layer thickness in Angstroms (default 15).`,
        },
      },
      required: [`h`, `k`, `l`],
    },
  },
  (input, context) => {
    const h = Math.trunc(Number(input.h))
    const k = Math.trunc(Number(input.k))
    const l = Math.trunc(Number(input.l))
    // h,k,l are schema-required (presence checked in execute_tool), but a model
    // can still pass non-numeric junk — guard NaN with a directive message so it
    // retries with real indices instead of cutting a slab on a NaN plane.
    if (![h, k, l].every(Number.isFinite)) {
      return {
        error: `generate_slab needs integer Miller indices h, k, l — e.g. ` +
          `h=1, k=0, l=0 for the (100) surface, or 1,1,1 for (111).`,
      }
    }
    const thickness = input.thickness === undefined ? 10 : Number(input.thickness)
    const vacuum = input.vacuum === undefined ? 15 : Number(input.vacuum)
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const slab = ferrox_generate_slab(target.structure as never, {
      miller_index: [h, k, l],
      offset: 0,
      thickness,
      vacuum,
    })
    const num_sites = (slab as unknown as MutStructure).sites.length
    const applied = stage_exact_result(target, slab as never)
    return {
      num_sites,
      applied,
      message: applied
        ? `Cut a (${h}${k}${l}) slab — the structure now has ${num_sites} sites.`
        : `Generated a (${h}${k}${l}) slab with ${num_sites} sites. Choose Overwrite / Split / New window.`,
      ...(!applied ? { note: `Result is waiting for Overwrite / Split / New window placement.` } : {}),
    }
  },
)

// ── place_adsorbate (mutate) ──
register(
  {
    name: `place_adsorbate`,
    description:
      `Add a single adsorbate atom at a Cartesian position [x, y, z] in the current structure.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        element: { type: `string`, description: `Adsorbate element symbol, e.g. "H".` },
        position: {
          type: `array`,
          items: { type: `number` },
          minItems: 3,
          maxItems: 3,
          description: `Cartesian position [x, y, z] in Angstroms.`,
        },
      },
      required: [`element`, `position`],
    },
  },
  (input, context) => {
    const element = String(input.element)
    const position = (input.position as number[]).map(Number)
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const next = clone_target(target)
    const site: MutSite = {
      species: [{ element, occu: 1 }],
      xyz: [...position],
      label: element,
    }
    // `abc` must be FRACTIONAL coordinates — downstream consumers (e.g.
    // lattice-ops) prefer `abc` over `xyz` when present. With a lattice,
    // convert the Cartesian position to fractional; without one (molecule),
    // omit `abc` so consumers derive it from `xyz`.
    if (next.lattice?.matrix) {
      site.abc = cartesian_to_fractional(
        position as [number, number, number],
        next.lattice.matrix as [
          [number, number, number],
          [number, number, number],
          [number, number, number],
        ],
      )
    }
    next.sites.push(site)
    const applied = target.viewer_id
      ? (stage_client_load_card(next as never, plain_formula(next as never), next.sites.length), false)
      : (set_current_structure(next as never), true)
    return { num_sites: next.sites.length, applied }
  },
)

// ── get_spacegroup (read) ──
register(
  {
    name: `get_spacegroup`,
    description:
      `Determine the international spacegroup number of the current structure (symmetry analysis).`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        symprec: {
          type: `number`,
          description: `Symmetry precision in Angstroms (default 1e-4).`,
        },
      },
    },
  },
  async (input, context) => {
    const symprec = input.symprec === undefined ? 1e-4 : Number(input.symprec)
    const target = structure_target(input, context?.tab_id)
    const res = await ferrox_spacegroup(target.structure as never, symprec)
    if (`error` in res) throw new Error(res.error)
    return { viewer_id: target.viewer_id, revision: target.revision, spacegroup_number: res.ok }
  },
)

// ── get_distance (read) ──
register(
  {
    name: `get_distance`,
    description:
      `Compute the minimum-image distance (Angstroms) between two atoms by site index.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        i: { type: `integer`, minimum: 0, description: `First site index (0-based).` },
        j: { type: `integer`, minimum: 0, description: `Second site index (0-based).` },
      },
      required: [`i`, `j`],
    },
  },
  async (input, context) => {
    const i = Math.trunc(Number(input.i))
    const j = Math.trunc(Number(input.j))
    const target = structure_target(input, context?.tab_id)
    const res = await ferrox_distance(target.structure as never, i, j)
    if (`error` in res) throw new Error(res.error)
    return { viewer_id: target.viewer_id, revision: target.revision, distance: res.ok }
  },
)

// ── compute_xrd (read) ──
register(
  {
    name: `compute_xrd`,
    description:
      `Compute the simulated powder X-ray diffraction (XRD) pattern of the current structure.`,
    kind: `read`,
    input_schema: { type: `object`, properties: {} },
  },
  async (input, context) => {
    const target = structure_target(input, context?.tab_id)
    const res = await ferrox_xrd(target.structure as never)
    if (`error` in res) throw new Error(res.error)
    return res.ok
  },
)

// ── build_nanotube (mutate) ──
register(
  {
    name: `build_nanotube`,
    description:
      `Roll the currently-loaded 2D sheet into an (n, m) nanotube and load the resulting tube as the current structure. The current structure must be a periodic 2D material (it provides the layer that is rolled up).`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        n: { type: `integer`, description: `Chiral index n.` },
        m: { type: `integer`, description: `Chiral index m.` },
        NL: {
          type: `integer`,
          minimum: 1,
          description: `Number of unit cells along the tube axis (default 1).`,
        },
        vacuum: {
          type: `number`,
          description: `Vacuum padding around the tube in Angstroms (default 15).`,
        },
      },
      required: [`n`, `m`],
    },
  },
  async (input, context) => {
    const n = Math.trunc(Number(input.n))
    const m = Math.trunc(Number(input.m))
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const result = await buildNanotube(
      { structure: target.structure as never },
      {
        n,
        m,
        NL: input.NL === undefined ? 1 : Math.trunc(Number(input.NL)),
        vacuum: input.vacuum === undefined ? 15 : Number(input.vacuum),
      },
    )
    const applied = stage_exact_result(target, result.structure as never)
    return {
      num_sites: (result.structure as unknown as MutStructure).sites.length,
      applied,
      note: applied
        ? `Built the nanotube into the viewer.`
        : `Built the nanotube (the viewer already has a structure — choose where to put it: Overwrite / Split / New window in the card).`,
    }
  },
)

// ── build_nanoscroll (mutate) ──
register(
  {
    name: `build_nanoscroll`,
    description:
      `Roll the currently-loaded 2D monolayer into an Archimedean-spiral nanoscroll and load the result as the current structure. The current structure must be a single 2D layer (not a 3D bulk).`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        turns: {
          type: `integer`,
          minimum: 1,
          description: `Integer number of windings/turns (default 6).`,
        },
        inner_radius: {
          type: `number`,
          description: `Inner winding radius in Angstroms (default 25).`,
        },
        length: {
          type: `number`,
          description: `Scroll height along z in Angstroms (default 12).`,
        },
      },
    },
  },
  async (input, context) => {
    const params: { turns?: number; inner_radius?: number; length?: number } = {}
    if (input.turns !== undefined) params.turns = Number(input.turns)
    if (input.inner_radius !== undefined) params.inner_radius = Number(input.inner_radius)
    if (input.length !== undefined) params.length = Number(input.length)
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const result = await buildNanoscroll(target.structure as never, params)
    const applied = stage_exact_result(target, result.structure as never)
    return {
      num_sites: (result.structure as unknown as MutStructure).sites.length,
      applied,
      note: applied
        ? `Built the nanoscroll into the viewer.`
        : `Built the nanoscroll (the viewer already has a structure — choose where to put it: Overwrite / Split / New window in the card).`,
    }
  },
)

// ── build_moire (mutate) ──
register(
  {
    name: `build_moire`,
    description:
      `Build a twisted bilayer (moiré superlattice) of the currently-loaded 2D sheet at the requested twist angle (in degrees) and load it as the current structure. The current structure is used as both layers. Searches commensurate twist angles near the target and uses the closest match.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        twist_angle: {
          type: `number`,
          description: `Target twist angle between the two layers, in degrees.`,
        },
        max_index: {
          type: `integer`,
          minimum: 1,
          description: `Max search index for commensurate cells (default 10).`,
        },
      },
      required: [`twist_angle`],
    },
  },
  async (input, context) => {
    const twist_angle = Number(input.twist_angle)
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const layer = { structure: target.structure as never }
    const search = await searchMoireAngles(layer, null, {
      angle_min: Math.max(0, twist_angle - 5),
      angle_max: twist_angle + 5,
      max_index: input.max_index === undefined ? 10 : Math.trunc(Number(input.max_index)),
      fix_angle: true,
      fixed_angle_value: twist_angle,
    })
    const candidate = search.candidates?.[0]
    if (!candidate) {
      throw new Error(`No commensurate moiré cell found near ${twist_angle}°.`)
    }
    const result = await buildMoireBilayer(layer, candidate, null, {})
    const applied = stage_exact_result(target, result.structure as never)
    return {
      num_sites: (result.structure as unknown as MutStructure).sites.length,
      applied,
      note: applied
        ? `Built the moiré bilayer into the viewer.`
        : `Built the moiré bilayer (the viewer already has a structure — choose where to put it: Overwrite / Split / New window in the card).`,
    }
  },
)

// ── set_film (read) ──
register(
  {
    name: `set_film`,
    description:
      `Mark the currently-loaded structure as the FILM for a heterostructure; then load/fetch the substrate and call heterostructure_search. Slab thickness uses the builder's default — for explicit thickness control, cut a slab with generate_slab first, then call set_film.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        viewer_id: { type: `string`, description: `Optional exact film pane.` },
      },
    },
  },
  (input, context) => {
    const target = structure_target(input, context?.tab_id)
    const film = JSON.parse(JSON.stringify(target.structure)) as AnyStructure
    set_film_stash(film, context?.tab_id)
    const sites = (film as { sites?: unknown[] }).sites ?? []
    return {
      film_formula: plain_formula(film),
      film_num_sites: sites.length,
      ...(target.viewer_id
        ? { film_viewer_id: target.viewer_id, film_revision: target.revision }
        : {}),
    }
  },
)

// ── heterostructure_search (read) ──
register(
  {
    name: `heterostructure_search`,
    description:
      `Search for lattice-matched heterostructure interfaces between the FILM (set earlier via set_film) and the SUBSTRATE (the currently-loaded structure). Returns a list of candidate matches sorted by strain — use the match's index with build_heterostructure. Requires set_film to have been called first.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        viewer_id: { type: `string`, description: `Optional exact substrate pane.` },
        substrate_miller: {
          type: `array`,
          items: { type: `integer` },
          minItems: 3,
          maxItems: 3,
          description: `Substrate Miller plane [h,k,l] (default [0,0,1]).`,
        },
        film_miller: {
          type: `array`,
          items: { type: `integer` },
          minItems: 3,
          maxItems: 3,
          description: `Film Miller plane [h,k,l] (default [0,0,1]).`,
        },
        max_area: {
          type: `number`,
          description: `Max interface supercell area in Å² (default 400).`,
        },
        max_strain_pct: {
          type: `number`,
          description: `Max allowed strain, in percent (default 5).`,
        },
        max_results: {
          type: `integer`,
          minimum: 1,
          description: `Max candidate matches to return (default 10).`,
        },
      },
    },
  },
  async (input, context) => {
    const film = get_film_stash(context?.tab_id)
    if (!film) {
      throw new Error(
        `No film set. Call set_film first to mark the current structure as the film.`,
      )
    }
    const target = structure_target(input, context?.tab_id)
    const substrate = target.structure

    const substrate_miller = (input.substrate_miller as number[] | undefined)?.map((n) =>
      Math.trunc(Number(n))
    ) as
      | [number, number, number]
      | undefined
    const film_miller = (input.film_miller as number[] | undefined)?.map((n) =>
      Math.trunc(Number(n))
    ) as
      | [number, number, number]
      | undefined
    const max_strain_pct = input.max_strain_pct === undefined
      ? 5
      : Number(input.max_strain_pct)
    // Map the user-facing percent strain onto the underlying tolerance fields.
    // ratio_tol is a fractional (0–1) area-ratio tolerance ≈ strain/100; length
    // and angle tolerances scale with the same allowance.
    const ratio_tol = max_strain_pct / 100

    const params: HeterostructureSearchParams = {
      mode: `slab`,
      substrate_miller: substrate_miller ?? [0, 0, 1],
      film_miller: film_miller ?? [0, 0, 1],
      max_area: input.max_area === undefined ? 400 : Number(input.max_area),
      max_area_ratio_tol: ratio_tol,
      max_length_tol: ratio_tol,
      // ZSL expects radians and the backend caps this at 0.5. Reuse the
      // fractional tolerance (1% -> 0.01 rad), not the user-facing percent.
      max_angle_tol: ratio_tol,
      max_results: input.max_results === undefined
        ? 10
        : Math.trunc(Number(input.max_results)),
    }

    const result = await searchHeterostructureMatches(
      substrate as never,
      film as never,
      params,
    )
    set_hetero_matches(result.matches, context?.tab_id)
    return {
      n_matches: result.matches.length,
      ...(target.viewer_id
        ? { substrate_viewer_id: target.viewer_id, base_revision: target.revision }
        : {}),
      matches: result.matches.map((m, i) => ({
        index: i,
        strain: m.strain,
        match_area: m.match_area,
        n_atoms_substrate: m.n_atoms_substrate,
        n_atoms_film: m.n_atoms_film,
        film_miller: m.film_miller,
        substrate_miller: m.substrate_miller,
      })),
    }
  },
)

// ── build_heterostructure (mutate) ──
register(
  {
    name: `build_heterostructure`,
    description:
      `Build the heterostructure for a chosen candidate match (from heterostructure_search) and load it into the viewer. The film (set via set_film) is placed on the substrate (the current structure); use swap=true to invert which is on top. Slab thickness uses the builder's default — for explicit thickness, cut slabs with generate_slab before set_film. Requires heterostructure_search to have been run first. NOTE: twist_angle is not yet supported on the client-side (WASM) path and is ignored there; twist≠0 requires the Python backend, default 0 works offline.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        viewer_id: { type: `string`, description: `Optional exact substrate pane.` },
        base_revision: {
          type: `integer`,
          minimum: 0,
          description: `Revision returned by heterostructure_search for an exact pane.`,
        },
        match_index: {
          type: `integer`,
          minimum: 0,
          description:
            `Index of the match from heterostructure_search (default 0 = lowest strain).`,
        },
        gap: {
          type: `number`,
          description: `Interface gap between film and substrate in Å (default 2.0).`,
        },
        vacuum: { type: `number`, description: `Vacuum padding in Å (default 20.0).` },
        twist_angle: {
          type: `number`,
          description:
            `Twist between layers in degrees (default 0; backend-only, ignored client-side).`,
        },
        swap: {
          type: `boolean`,
          description: `Swap which structure is substrate vs film (default false).`,
        },
        xy_shift: {
          type: `array`,
          items: { type: `number` },
          minItems: 2,
          maxItems: 2,
          description: `Fractional in-plane shift [a, b] of the film (default [0, 0]).`,
        },
      },
    },
  },
  async (input, context) => {
    const matches = get_hetero_matches(context?.tab_id)
    if (matches.length === 0) {
      throw new Error(
        `No heterostructure matches available. Run heterostructure_search first.`,
      )
    }
    const match_index = input.match_index === undefined
      ? 0
      : Math.trunc(Number(input.match_index))
    const m = matches[match_index]
    if (!m) {
      throw new Error(
        `match_index ${match_index} is out of range (0–${
          matches.length - 1
        }). Run heterostructure_search again or pick a valid index.`,
      )
    }

    const swap = input.swap === true
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const current = target.structure
    const film = get_film_stash(context?.tab_id)
    if (!film) throw new Error(`No film set. Call set_film first.`)
    // Default: substrate = current structure, film = stashed film.
    const substrate = swap ? film : current
    const film_struct = swap ? current : film

    const gap = input.gap === undefined ? 2.0 : Number(input.gap)
    const vacuum = input.vacuum === undefined ? 20.0 : Number(input.vacuum)
    const twist_angle = input.twist_angle === undefined ? 0 : Number(input.twist_angle)
    const xy_shift = (input.xy_shift as number[] | undefined)?.map(Number) as [
      number,
      number,
    ] | undefined

    const result = await buildHeterostructureManual(
      substrate as never,
      film_struct as never,
      m.substrate_transformation,
      m.film_transformation,
      gap,
      vacuum,
      twist_angle,
      xy_shift ?? [0, 0],
    )
    const formula = plain_formula(result.structure as never)
    const site_count = (result.structure as { sites?: unknown[] }).sites?.length ?? 0
    const applied = target.viewer_id
      ? (stage_client_load_card(result.structure as never, formula, site_count), false)
      : client_load_or_card(result.structure as never, formula, site_count)
    return {
      num_sites: result.n_atoms,
      strain: result.strain,
      match_area: result.match_area,
      applied,
      note: applied
        ? `Built the heterostructure into the viewer.`
        : `Built the heterostructure (the viewer already has a structure — choose where to put it: Overwrite / Split / New window in the card).`,
    }
  },
)

// ── lateral_heterostructure_search (read) ──
register(
  {
    name: `lateral_heterostructure_search`,
    description:
      `Search for LATERAL (in-plane) heterojunction edge-matches between the FILM (set earlier via set_film) and the SUBSTRATE (the currently-loaded structure). This is an IN-PLANE junction where the two slabs are stitched side-by-side along a shared edge — distinct from build_heterostructure, which stacks them vertically (one on top of the other). Returns candidate matches sorted by strain; use the match's index with build_lateral_heterostructure. Requires set_film to have been called first.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        viewer_id: { type: `string`, description: `Optional exact substrate pane.` },
        interface_axis: {
          type: `integer`,
          enum: [0, 1],
          description:
            `In-plane lattice axis along which the two slabs share their edge: 0=a, 1=b (default 0).`,
        },
        max_strain_pct: {
          type: `number`,
          description: `Max allowed edge-length mismatch strain, in percent (default 5).`,
        },
        max_length: {
          type: `number`,
          description: `Max interface edge length to consider, in Å (default 100).`,
        },
        max_results: {
          type: `integer`,
          minimum: 1,
          description: `Max candidate matches to return (default 10).`,
        },
      },
    },
  },
  async (input, context) => {
    const film = get_film_stash(context?.tab_id)
    if (!film) {
      throw new Error(
        `No film set. Call set_film first to mark the current structure as the film.`,
      )
    }
    const target = structure_target(input, context?.tab_id)
    const substrate = target.structure

    const max_strain_pct = input.max_strain_pct === undefined
      ? 5
      : Number(input.max_strain_pct)
    const params: LateralSearchParams = {
      interface_axis: input.interface_axis === undefined
        ? 0
        : Math.trunc(Number(input.interface_axis)),
      // The lateral API's `max_strain` is already expressed in percent.
      max_strain: max_strain_pct,
      max_length: input.max_length === undefined ? 100 : Number(input.max_length),
      max_results: input.max_results === undefined
        ? 10
        : Math.trunc(Number(input.max_results)),
    }

    const result = await searchLateralMatches(substrate as never, film as never, params)
    set_lateral_matches(result.matches, context?.tab_id)
    // Stash the search params so build_lateral_heterostructure rebuilds with the
    // SAME interface_axis / max_length / max_strain — otherwise its internal
    // re-search diverges from this candidate list and match_index is wrong.
    set_lateral_search_params(params, context?.tab_id)
    return {
      n_matches: result.matches.length,
      ...(target.viewer_id
        ? { substrate_viewer_id: target.viewer_id, base_revision: target.revision }
        : {}),
      matches: result.matches.map((m, i) => ({
        index: i,
        strain: m.strain_percent,
        edge_length_A: m.edge_length_A,
        edge_length_B: m.edge_length_B,
        n_atoms_A: m.n_atoms_A,
        n_atoms_B: m.n_atoms_B,
      })),
    }
  },
)

// ── build_lateral_heterostructure (mutate) ──
register(
  {
    name: `build_lateral_heterostructure`,
    description:
      `Build a LATERAL (in-plane) heterojunction for a chosen candidate match (from lateral_heterostructure_search) and load it into the viewer. The SUBSTRATE (current structure) and FILM (set via set_film) are stitched side-by-side along a shared in-plane edge — distinct from build_heterostructure, which stacks them vertically. Requires lateral_heterostructure_search to have been run first.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        viewer_id: { type: `string`, description: `Optional exact substrate pane.` },
        base_revision: {
          type: `integer`,
          minimum: 0,
          description: `Revision returned by lateral_heterostructure_search for an exact pane.`,
        },
        match_index: {
          type: `integer`,
          minimum: 0,
          description:
            `Index of the match from lateral_heterostructure_search (default 0 = lowest strain).`,
        },
        width_A: {
          type: `integer`,
          minimum: 1,
          description:
            `Number of substrate (A) repeat units along the interface (default 1).`,
        },
        width_B: {
          type: `integer`,
          minimum: 1,
          description: `Number of film (B) repeat units along the interface (default 1).`,
        },
        buffer: {
          type: `number`,
          description:
            `Buffer gap between the two slabs at the junction, in Å (default 0).`,
        },
        vacuum: { type: `number`, description: `Vacuum padding in Å (default 20.0).` },
      },
    },
  },
  async (input, context) => {
    const matches = get_lateral_matches(context?.tab_id)
    if (matches.length === 0) {
      throw new Error(
        `No lateral heterostructure matches available. Run lateral_heterostructure_search first.`,
      )
    }
    const match_index = input.match_index === undefined
      ? 0
      : Math.trunc(Number(input.match_index))
    const m = matches[match_index]
    if (!m) {
      throw new Error(
        `match_index ${match_index} is out of range (0–${
          matches.length - 1
        }). Run lateral_heterostructure_search again or pick a valid index.`,
      )
    }

    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const substrate = target.structure
    const film = get_film_stash(context?.tab_id)
    if (!film) throw new Error(`No film set. Call set_film first.`)

    const params: LateralBuildParams = {
      width_A: input.width_A === undefined ? 1 : Math.trunc(Number(input.width_A)),
      width_B: input.width_B === undefined ? 1 : Math.trunc(Number(input.width_B)),
      buffer: input.buffer === undefined ? 0 : Number(input.buffer),
      vacuum: input.vacuum === undefined ? 20.0 : Number(input.vacuum),
    }

    // Thread the stashed search params so the build's internal re-search matches
    // the searched candidate list (it selects by match_id). Falls back to {} only
    // for a stale pre-fix session where the search predates this stash.
    const search_params = get_lateral_search_params(context?.tab_id) ?? {}
    const result = await buildLateralInterface(
      substrate as never,
      film as never,
      m,
      params,
      search_params,
    )
    const formula = plain_formula(result.structure as never)
    const site_count = (result.structure as { sites?: unknown[] }).sites?.length ?? 0
    const applied = target.viewer_id
      ? (stage_client_load_card(result.structure as never, formula, site_count), false)
      : client_load_or_card(result.structure as never, formula, site_count)
    return {
      num_sites: result.n_atoms,
      strain: result.strain,
      n_atoms_A: result.n_atoms_A,
      n_atoms_B: result.n_atoms_B,
      interface_length: result.interface_length,
      applied,
      note: applied
        ? `Built the lateral heterostructure into the viewer.`
        : `Built the lateral heterostructure (the viewer already has a structure — choose where to put it: Overwrite / Split / New window in the card).`,
    }
  },
)

// ── set_bulk_reference (read) ──
register(
  {
    name: `set_bulk_reference`,
    description:
      `Mark the currently-loaded structure as the BULK reference for surface passivation (used to compute correct coordination numbers). Then load/cut the slab and call passivate_surface. Typical flow: load bulk → set_bulk_reference → generate_slab → passivate_surface.`,
    kind: `read`,
    input_schema: { type: `object`, properties: {} },
  },
  (input, context) => {
    const target = structure_target(input, context?.tab_id)
    const bulk = JSON.parse(JSON.stringify(target.structure)) as AnyStructure
    set_bulk_stash(bulk, context?.tab_id)
    const sites = (bulk as { sites?: unknown[] }).sites ?? []
    return {
      viewer_id: target.viewer_id,
      bulk_revision: target.revision,
      bulk_formula: plain_formula(bulk),
      bulk_num_sites: sites.length,
    }
  },
)

// ── passivate_surface (mutate) ──
register(
  {
    name: `passivate_surface`,
    description:
      `Passivate dangling bonds on the current slab with pseudo-hydrogen. Requires a bulk reference (set_bulk_reference) or an explicit bulk_coordination map.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        bulk_coordination: {
          type: `object`,
          additionalProperties: { type: `number` },
          description:
            `Optional map of element → expected (bulk) coordination number, e.g. {"Si": 4}. Overrides the bulk-derived coordination; lets you passivate without a stashed bulk reference.`,
        },
      },
    },
  },
  async (input, context) => {
    const target = structure_target(input, context?.tab_id)
    require_matching_revision(target, input)
    const slab = target.structure
    const bulk = get_bulk_stash(context?.tab_id)
    const bulk_coordination = input.bulk_coordination as
      | Record<string, number>
      | undefined

    if (!bulk && !bulk_coordination) {
      throw new Error(
        `Set a bulk reference first (set_bulk_reference on the parent crystal), or pass bulk_coordination.`,
      )
    }

    const params: PseudoHydrogenParams = {}
    if (bulk_coordination) params.bulk_coordination = bulk_coordination

    // With a stashed bulk, reference coordination is derived from it (params may
    // still carry an explicit override). Without a bulk, the explicit
    // bulk_coordination map is authoritative — pass the slab itself as the bulk
    // arg (it is ignored once bulk_coordination is set).
    const bulk_arg = bulk ?? slab
    const result = await passivateSlab(slab as never, bulk_arg as never, params)

    const applied = target.viewer_id
      ? (stage_client_load_card(
        result.structure as never,
        plain_formula(result.structure as never),
        (result.structure as { sites?: unknown[] }).sites?.length ?? 0,
      ), false)
      : (set_current_structure(result.structure as never), true)
    const n_added = (result as { n_pseudo_h?: number }).n_pseudo_h
    const sites = (result.structure as { sites?: unknown[] }).sites ?? []
    return n_added === undefined
      ? { num_sites: sites.length, applied }
      : { num_sites: sites.length, n_hydrogens_added: n_added, applied }
  },
)

/**
 * Resolve the active workflow id for the workflow tools. CLIENT_TOOLS executors
 * are stateless (no tab_id threaded through execute_tool), so read the per-tab
 * workflow slices directly; the WorkflowEditor sync effect writes the open
 * workflow into slice.active_workflow.id. An explicit workflow_id arg wins.
 */
function resolve_workflow_id(arg?: unknown): string {
  const explicit = typeof arg === `string` ? arg.trim() : ``
  if (explicit) return explicit
  for (const [, slice] of iter_workflow_slices()) {
    const id = slice.active_workflow.id
    if (id) return id
  }
  return ``
}

/**
 * Resolve the tab id whose WorkflowEditor is active. The workflow build/edit
 * tools dispatch into `execute_workflow_tool(name, input, tab_id)`, which looks
 * up the per-tab action handler the WorkflowEditor registers under its slice id.
 * Mirrors resolve_workflow_id but returns the slice/tab KEY (prefer the tab
 * holding an open workflow; else the first slice).
 */
function resolve_workflow_tab_id(): string {
  let first = ``
  for (const [tab_id, slice] of iter_workflow_slices()) {
    if (!first) first = tab_id
    if (slice.active_workflow.id) return tab_id
  }
  return first
}

// ── run_workflow (mutate — submits real HPC jobs / burns compute) ──
register(
  {
    name: `run_workflow`,
    description:
      `Run (submit) a workflow using its last-used run configuration. This submits REAL HPC jobs / consumes compute, so it requires user confirmation. The workflow must have been run at least once via the Run dialog so its cluster + job config is saved — otherwise this returns a message telling the user to open the Run dialog once. Defaults to the currently-open workflow if workflow_id is omitted.`,
    kind: `mutate`,
    input_schema: {
      type: `object`,
      properties: {
        workflow_id: {
          type: `string`,
          description: `Workflow id to run (default: the currently-open workflow).`,
        },
      },
    },
  },
  async (input) => {
    const workflow_id = resolve_workflow_id(input.workflow_id)
    if (!workflow_id) {
      throw new Error(
        `No active workflow. Open a workflow in the editor, or pass workflow_id.`,
      )
    }
    const config = load_run_config(workflow_id)
    if (!config) {
      return {
        status: `no_config`,
        workflow_id,
        message:
          `No saved run configuration for this workflow. Open the Run dialog once (set cluster / execution mode / job params and click Run) so the config is saved, then I can re-run it.`,
      }
    }
    const result = await api_run_workflow(workflow_id, config)
    return { status: result.status, workflow_id: result.workflow_id ?? workflow_id }
  },
)

// ── get_workflow_run_status (read — monitor job progress) ──
register(
  {
    name: `get_workflow_run_status`,
    description:
      `Get the current run status of a workflow: overall status, per-step states, and any step errors. Use this to monitor or report job progress. Defaults to the currently-open workflow if workflow_id is omitted.`,
    kind: `read`,
    input_schema: {
      type: `object`,
      properties: {
        workflow_id: {
          type: `string`,
          description: `Workflow id to check (default: the currently-open workflow).`,
        },
      },
    },
  },
  async (input) => {
    const workflow_id = resolve_workflow_id(input.workflow_id)
    if (!workflow_id) {
      throw new Error(
        `No active workflow. Open a workflow in the editor, or pass workflow_id.`,
      )
    }
    const status = await get_run_status(workflow_id)
    const steps = (status.steps ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      status: s.status,
      ...(s.error_message ? { error: s.error_message } : {}),
    }))
    return {
      workflow_id: status.workflow_id ?? workflow_id,
      status: status.status,
      progress: status.progress,
      steps,
    }
  },
)

export function tool_kind(
  name: string,
  input?: Record<string, unknown>,
): ToolKind | undefined {
  if (name === `catgo_pane` && input) {
    const action = String(input.action ?? ``)
    if ([`list`, `inspect`, `revision`].includes(action) || input.preview === true) {
      return `read`
    }
    return `mutate`
  }
  return REGISTRY.get(name)?.def.kind
}

/** Execute a tool by name; always resolves to a JSON string (errors included). */
/** Required params (per the tool's schema) that are absent/blank in `input`.
 *  Weak local models sometimes call a tool with invented or missing args (e.g.
 *  generate_slab with `thickness`/`layers` but no Miller indices h,k,l). Catching
 *  that up front returns a clear, actionable error the model can retry against —
 *  instead of the tool silently computing on `undefined`/NaN and changing nothing. */
function missing_required(def: ClientTool, input: Record<string, unknown>): string[] {
  const required = (def.input_schema as { required?: unknown }).required
  if (!Array.isArray(required)) return []
  return required.filter((key): key is string =>
    typeof key === `string` &&
    (input[key] === undefined || input[key] === null || input[key] === ``)
  )
}

export async function execute_tool(
  name: string,
  input: Record<string, unknown>,
  context?: ToolExecutionContext,
): Promise<string> {
  const entry = REGISTRY.get(name)
  if (!entry) return JSON.stringify({ error: `Unknown tool: ${name}` })
  const missing = missing_required(entry.def, input)
  if (missing.length > 0) {
    const plural = missing.length > 1
    return JSON.stringify({
      error: `Missing required parameter${plural ? `s` : ``} for ${name}: ${
        missing.join(`, `)
      }. Provide ${plural ? `them` : `it`} and call ${name} again.`,
    })
  }
  try {
    const result = await entry.run(input, context)
    return JSON.stringify(result ?? { ok: true })
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
  }
}

// Register the viewer-control tools (visibility / camera / selection /
// appearance) into CLIENT_TOOLS + REGISTRY. They live in a separate module to
// keep this file focused; registered HERE (at the bottom, after `register` and
// the CLIENT_TOOLS const exist) rather than via a side-effect `import` in
// viewer-tools, which would hit a const temporal-dead-zone during circular init.
for (const { def, run } of VIEWER_TOOLS) register(def, run)
for (const { def, run } of TERMINAL_TOOLS) register(def, run)
for (const { def, run } of CAMPAIGN_TOOLS) register(def, run)

// Workflow build/edit tools (create_workflow / add_node / connect_nodes /
// set_node_params / validate_workflow / …). These were defined in
// workflow-tools.ts and fully implemented in workflow-tool-executor.ts, but
// never registered into the client tool set — so client-direct providers
// (DeepSeek / Qwen / Kimi) could only run_workflow, not BUILD or MODIFY a
// workflow. Wire them through execute_workflow_tool here. Skips: run_workflow
// (registered above with a richer saved-config impl) and plan_and_build_workflow
// (no executor handler yet — SDK/MCP path only).
const WORKFLOW_READONLY_TOOLS = new Set([
  `list_workflows`,
  `get_workflow_status`,
  `get_workflow_templates`,
  `validate_workflow`,
  `suggest_params`,
  `get_node_definitions`,
  `get_calculation_guidelines`,
  `get_step_error`,
  `get_batch_status`,
  `compute_oer_overpotential`,
  `compute_free_energy`,
  `list_vasp_presets`,
])
for (const def of WORKFLOW_TOOL_DEFINITIONS) {
  if (def.name === `plan_and_build_workflow`) continue // no executor handler yet
  if (REGISTRY.has(def.name)) continue // e.g. run_workflow already registered
  const kind: ToolKind = WORKFLOW_READONLY_TOOLS.has(def.name) ? `read` : `mutate`
  register(
    { ...def, kind },
    (input) => execute_workflow_tool(def.name, input, resolve_workflow_tab_id()),
  )
}

// Re-export so later tasks can register mutating tools that write structures back.
export { register, set_current_structure }
