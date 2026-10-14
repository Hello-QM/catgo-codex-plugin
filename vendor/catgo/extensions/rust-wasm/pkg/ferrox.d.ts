/* tslint:disable */
/* eslint-disable */
/**
 * 2D layer input for the nanotube builder.
 *
 * Mirrors the explicit-arrays form of the backend `NanotubeLayerInput`
 * (lattice_vectors + elements + basis_coords + z_coords). The TS wrapper
 * extracts these from a structure when the user supplies one.
 */
export interface JsNanotubeLayer {
    /**
     * Two 2D lattice vectors [[a1x, a1y], [a2x, a2y]] (Å).
     */
    lattice_vectors: [[number, number], [number, number]];
    /**
     * Element symbol for each basis atom.
     */
    elements: string[];
    /**
     * Fractional [a, b] coordinates of each basis atom.
     */
    basis_coords: [number, number][];
    /**
     * Out-of-plane z offset (Å) of each basis atom (defaults to all zeros).
     */
    z_coords?: number[];
}

/**
 * 3D vector of floats.
 */
export type JsVector3 = [number, number, number];

/**
 * 3x3 float matrix for transformations.
 */
export type JsMatrix3x3 = [[number, number, number], [number, number, number], [number, number, number]];

/**
 * 3x3 integer matrix for supercell transformations.
 */
export type JsIntMatrix3x3 = [[number, number, number], [number, number, number], [number, number, number]];

/**
 * A crystal structure matching pymatgen\'s JSON format.
 */
export interface JsCrystal {
    /**
     * The crystal lattice
     */
    lattice: JsLattice;
    /**
     * List of crystallographic sites
     */
    sites: JsSite[];
    /**
     * Structure-level properties
     */
    properties?: Map<string, Value>;
}

/**
 * A crystallographic site with species, coordinates, and properties.
 */
export interface JsSite {
    /**
     * Species at this site (can have multiple for disordered sites)
     */
    species: JsSpeciesOccupancy[];
    /**
     * Fractional coordinates [a, b, c] in range [0, 1)
     */
    abc: [number, number, number];
    /**
     * Cartesian coordinates [x, y, z] in Ångströms (optional, computed if missing)
     */
    xyz?: [number, number, number];
    /**
     * Site label (defaults to element symbol)
     */
    label?: string;
    /**
     * Site-specific properties (e.g., magnetic moment, charge)
     */
    properties?: Map<string, Value>;
}

/**
 * A symmetry operation (rotation + translation in fractional coordinates).
 */
export interface JsSymmetryOperation {
    /**
     * 3x3 rotation matrix (integer elements in fractional basis)
     */
    rotation: [[number, number, number], [number, number, number], [number, number, number]];
    /**
     * Translation vector in fractional coordinates
     */
    translation: [number, number, number];
}

/**
 * ASE Atoms dict format for interoperability.
 */
export interface JsAseAtoms {
    /**
     * Element symbols for each atom
     */
    symbols: string[];
    /**
     * Cartesian positions [[x1, y1, z1], ...] in Ångströms
     */
    positions: [number, number, number][];
    /**
     * Cell matrix (3x3), null for molecules
     */
    cell?: [[number, number, number], [number, number, number], [number, number, number]];
    /**
     * Periodic boundary conditions
     */
    pbc?: [boolean, boolean, boolean];
    /**
     * Additional info dict
     */
    info?: Map<string, Value>;
}

/**
 * Build result. Mirrors `HeterostructureBuildResult`.
 */
export interface JsHeteroBuildResult {
    /**
     * The built interface structure.
     */
    structure: JsCrystal;
    /**
     * Total atom count.
     */
    n_atoms: number;
    /**
     * Substrate atom count.
     */
    n_atoms_substrate: number;
    /**
     * Film atom count.
     */
    n_atoms_film: number;
    /**
     * Interface in-plane area (Å²).
     */
    match_area: number;
    /**
     * Von Mises strain (%).
     */
    strain: number;
    /**
     * Human-readable message.
     */
    message: string;
}

/**
 * Combined result: the rolled structure plus build metadata.
 */
export interface JsNanoscrollResult {
    /**
     * The rolled (non-periodic) structure in pymatgen-compatible form.
     */
    structure: JsCrystal;
    /**
     * Build metadata.
     */
    info: JsNanoscrollInfo;
}

/**
 * Element-amount pair for composition results.
 */
export interface JsElementAmount {
    /**
     * Element symbol
     */
    element: string;
    /**
     * Amount (count or fraction)
     */
    amount: number;
}

/**
 * Full result of `build_nanotube`.
 */
export interface JsNanotubeBuild {
    /**
     * The rolled-up tube as a crystal structure.
     */
    structure: JsCrystal;
    /**
     * Total atom count.
     */
    n_atoms: number;
    /**
     * Inner-wall chiral angle (degrees).
     */
    chiral_angle_deg: number;
    /**
     * Inner-wall circumference (Å).
     */
    circumference: number;
    /**
     * Inner-wall diameter (Å).
     */
    diameter: number;
    /**
     * Common tube length (Å).
     */
    tube_length: number;
    /**
     * Chirality class.
     */
    chirality: string;
    /**
     * Number of walls.
     */
    n_walls: number;
    /**
     * Per-wall info.
     */
    walls: JsNanotubeWall[];
    /**
     * Human-readable summary.
     */
    message: string;
}

/**
 * Full symmetry dataset for a structure.
 */
export interface JsSymmetryDataset {
    /**
     * International space group number (1-230)
     */
    spacegroup_number: number;
    /**
     * Space group symbol (e.g., \"Fm-3m\")
     */
    spacegroup_symbol: string;
    /**
     * Hall number
     */
    hall_number: number;
    /**
     * Crystal system (e.g., \"cubic\", \"hexagonal\")
     */
    crystal_system: string;
    /**
     * Wyckoff letters for each site
     */
    wyckoff_letters: string[];
    /**
     * Site symmetry symbols for each site
     */
    site_symmetry_symbols: string[];
    /**
     * Equivalent atoms mapping
     */
    equivalent_atoms: number[];
    /**
     * Symmetry operations
     */
    operations: JsSymmetryOperation[];
}

/**
 * Geometry-only result of `nanotube_info`.
 */
export interface JsNanotubeInfo {
    /**
     * Chiral angle (degrees).
     */
    chiral_angle_deg: number;
    /**
     * Circumference |C| (Å).
     */
    circumference: number;
    /**
     * Diameter (Å).
     */
    diameter: number;
    /**
     * Radius (Å).
     */
    radius: number;
    /**
     * Translational vector length |T| (Å).
     */
    trans_length: number;
    /**
     * Tube length NL*|T| (Å).
     */
    tube_length: number;
    /**
     * Estimated atom count.
     */
    n_atoms_estimate: number;
    /**
     * Translational vector index t1.
     */
    t1: number;
    /**
     * Translational vector index t2.
     */
    t2: number;
    /**
     * Chirality class (\"zigzag\" / \"armchair\" / \"chiral\").
     */
    chirality: string;
    /**
     * Human-readable summary.
     */
    message: string;
}

/**
 * Grid-scan result. Mirrors the TS `GridScanResult`.
 */
export interface JsGridScanResult {
    /**
     * One entry per irreducible grid point.
     */
    entries: JsGridScanEntry[];
    /**
     * Total grid points (== irreducible count; no reduction beyond the zone).
     */
    n_total_grid: number;
    /**
     * Number of irreducible grid points.
     */
    n_irreducible: number;
    /**
     * Number of in-plane symmetry operations found.
     */
    n_symmetry_ops: number;
    /**
     * Reduction ratio (1 / zone-area-fraction).
     */
    reduction_ratio: number;
    /**
     * Shifted structures (flat list, mirrors `structures`).
     */
    structures: JsCrystal[];
    /**
     * Labels (flat list, mirrors `labels`).
     */
    labels: string[];
    /**
     * Human-readable message.
     */
    message: string;
}

/**
 * Information about a neighboring atom in coordination analysis.
 */
export interface JsNeighborInfo {
    /**
     * Index of the neighboring site
     */
    site_index: number;
    /**
     * Element symbol of neighbor
     */
    element: string;
    /**
     * Distance to neighbor (Ångströms)
     */
    distance: number;
    /**
     * Periodic image offset
     */
    image: [number, number, number];
}

/**
 * Information about a parsed chemical composition.
 */
export interface JsCompositionInfo {
    /**
     * Species and their amounts as {element, amount} objects
     */
    species: JsElementAmount[];
    /**
     * Full formula string
     */
    formula: string;
    /**
     * Reduced formula string (e.g., \"Fe2O3\" from \"Fe4O6\")
     */
    reducedFormula: string;
    /**
     * Anonymous formula (e.g., \"A2B3\")
     */
    formulaAnonymous: string;
    /**
     * Hill notation formula
     */
    formulaHill: string;
    /**
     * Alphabetically sorted formula
     */
    alphabeticalFormula: string;
    /**
     * Chemical system (e.g., \"Fe-O\")
     */
    chemicalSystem: string;
    /**
     * Total number of atoms
     */
    numAtoms: number;
    /**
     * Number of distinct elements
     */
    numElements: number;
    /**
     * Molecular weight in atomic mass units
     */
    weight: number;
    /**
     * True if composition is a single element
     */
    isElement: boolean;
    /**
     * Average electronegativity (null if undefined)
     */
    averageElectronegativity: number | undefined;
    /**
     * Total number of electrons
     */
    totalElectrons: number;
}

/**
 * Lateral build result. Mirrors the TS `LateralBuildResult`.
 */
export interface JsLateralBuildResult {
    /**
     * The joined lateral heterojunction.
     */
    structure: JsCrystal;
    /**
     * Total atom count.
     */
    n_atoms: number;
    /**
     * Slab A atom count (× width_A).
     */
    n_atoms_A: number;
    /**
     * Slab B atom count (× width_B).
     */
    n_atoms_B: number;
    /**
     * Matched edge length (Å).
     */
    interface_length: number;
    /**
     * 1D mismatch strain (%).
     */
    strain: number;
    /**
     * Human-readable message.
     */
    message: string;
}

/**
 * Lateral search parameters. Mirrors the TS `LateralSearchParams`.
 */
export interface JsLateralSearchParams {
    /**
     * Interface direction: 0 = a-vector, 1 = b-vector.
     */
    interface_axis?: number;
    /**
     * Maximum matched edge length (Å).
     */
    max_length?: number;
    /**
     * Maximum 1D strain tolerance (%).
     */
    max_strain?: number;
    /**
     * Maximum number of match candidates to return.
     */
    max_results?: number;
}

/**
 * Lateral search result. Mirrors the TS `LateralSearchResult`.
 */
export interface JsLateralSearchResult {
    /**
     * Matches sorted by (total atoms, strain).
     */
    matches: JsLateralMatch[];
    /**
     * Number of matches.
     */
    n_matches: number;
    /**
     * Human-readable message.
     */
    message: string;
}

/**
 * Lattice reduction algorithm.
 */
export type JsReductionAlgo = "niggli" | "lll";

/**
 * Lattice structure matching pymatgen\'s JSON format.
 */
export interface JsLattice {
    /**
     * 3x3 lattice matrix with lattice vectors as rows (Ångströms)
     */
    matrix: Matrix3x3;
    /**
     * Periodic boundary conditions along each axis
     */
    pbc?: [boolean, boolean, boolean];
}

/**
 * Local coordination environment for a site.
 */
export interface JsLocalEnvironment {
    /**
     * Index of the central site
     */
    center_index: number;
    /**
     * Element at the center
     */
    center_element: string;
    /**
     * Coordination number
     */
    coordination_number: number;
    /**
     * List of coordinating neighbors
     */
    neighbors: JsNeighborInfo[];
}

/**
 * Metadata about a crystal structure.
 */
export interface JsStructureMetadata {
    /**
     * Number of sites
     */
    num_sites: number;
    /**
     * Reduced chemical formula (e.g., \"Fe2O3\")
     */
    formula: string;
    /**
     * Anonymous formula with elements replaced by A, B, C... (e.g., \"A2B3\")
     */
    formula_anonymous: string;
    /**
     * Hill notation formula (C and H first if present, then alphabetical)
     */
    formula_hill: string;
    /**
     * Volume in Å³
     */
    volume: number;
    /**
     * Density in g/cm³ (null if zero volume)
     */
    density: number | undefined;
    /**
     * Lattice parameters [a, b, c] in Ångströms
     */
    lattice_params: [number, number, number];
    /**
     * Lattice angles [alpha, beta, gamma] in degrees
     */
    lattice_angles: [number, number, number];
    /**
     * Whether structure is ordered (no partial occupancies)
     */
    is_ordered: boolean;
}

/**
 * Metadata describing the built nanoscroll, returned alongside the structure.
 */
export interface JsNanoscrollInfo {
    /**
     * Number of windings.
     */
    turns: number;
    /**
     * Inner winding radius (Å).
     */
    inner_radius: number;
    /**
     * Outer winding radius (Å).
     */
    outer_radius: number;
    /**
     * Realized scroll length along z (Å).
     */
    length: number;
    /**
     * Monolayer thickness (Å).
     */
    monolayer_thickness: number;
    /**
     * Interlayer gap used (Å).
     */
    interlayer_gap: number;
    /**
     * Spiral arc length (Å).
     */
    arc_length: number;
    /**
     * Supercell tiling [nx, ny].
     */
    supercell: [number, number];
    /**
     * Number of atoms.
     */
    n_atoms: number;
    /**
     * Maximum local bending strain (fraction).
     */
    max_local_strain: number;
    /**
     * Optional curvature-strain warning.
     */
    warning: string | undefined;
}

/**
 * Miller index (3D integer vector).
 */
export type JsMillerIndex = [number, number, number];

/**
 * Miller index information for an XRD peak.
 */
export interface JsHklInfo {
    /**
     * Miller indices [h, k, l]
     */
    hkl: [number, number, number];
    /**
     * Multiplicity (number of symmetry-equivalent reflections)
     */
    multiplicity: number;
}

/**
 * One ZSL match in the search result. Field names match the TS
 * `HeterostructureMatch` interface (miller indices are echoed as [0,0,1]
 * for slab mode since no Miller cut is involved).
 */
export interface JsHeteroMatch {
    /**
     * Stable id == generation-order index (used by build).
     */
    match_id: number;
    /**
     * Matched super-lattice area (Å²).
     */
    match_area: number;
    /**
     * Film Miller index (always [0,0,1] in slab mode).
     */
    film_miller: [number, number, number];
    /**
     * Substrate Miller index (always [0,0,1] in slab mode).
     */
    substrate_miller: [number, number, number];
    /**
     * Integer film transformation (2x2 -> nested arrays).
     */
    film_transformation: number[][];
    /**
     * Integer substrate transformation (2x2 -> nested arrays).
     */
    substrate_transformation: number[][];
    /**
     * Film super-lattice vectors (3D).
     */
    film_sl_vectors: number[][];
    /**
     * Substrate super-lattice vectors (3D).
     */
    substrate_sl_vectors: number[][];
    /**
     * Von Mises strain (%).
     */
    strain: number;
    /**
     * Substrate atom count.
     */
    n_atoms_substrate: number;
    /**
     * Film atom count.
     */
    n_atoms_film: number;
}

/**
 * One grid-scan entry: a shifted heterostructure. Mirrors the TS
 * `GridScanShiftEntry`.
 */
export interface JsGridScanEntry {
    /**
     * Fractional (fx, fy) shift.
     */
    shift_frac: number[];
    /**
     * Cartesian (x, y, z) shift.
     */
    shift_cart: number[];
    /**
     * The shifted structure.
     */
    structure: JsCrystal;
    /**
     * Total atom count.
     */
    n_atoms: number;
    /**
     * Human-readable shift label.
     */
    label: string;
}

/**
 * One lateral edge-match in the search result. Field names match the TS
 * `LateralMatch` interface.
 */
export interface JsLateralMatch {
    /**
     * Stable id (index into the sorted list, used by build).
     */
    match_id: number;
    /**
     * Supercell multiplier for slab A along the interface edge.
     */
    n1: number;
    /**
     * Supercell multiplier for slab B along the interface edge.
     */
    n2: number;
    /**
     * Matched edge length for slab A (Å).
     */
    edge_length_A: number;
    /**
     * Matched edge length for slab B (Å).
     */
    edge_length_B: number;
    /**
     * 1D mismatch strain (%).
     */
    strain_percent: number;
    /**
     * Atom count for slab A supercell.
     */
    n_atoms_A: number;
    /**
     * Atom count for slab B supercell.
     */
    n_atoms_B: number;
}

/**
 * One registry candidate in the WASM result. Mirrors the per-candidate
 * manifest entry plus the built structure, so the TS side can assemble the
 * same zip archive the backend `/batch-build` returns.
 */
export interface JsRegistryCandidate {
    /**
     * The built interface structure.
     */
    structure: JsCrystal;
    /**
     * Fractional shift along interface a.
     */
    shift_a: number;
    /**
     * Fractional shift along interface b.
     */
    shift_b: number;
    /**
     * Candidate label (used for filenames).
     */
    label: string;
    /**
     * Total atom count.
     */
    n_atoms: number;
    /**
     * Interface in-plane area (Å²).
     */
    match_area: number;
    /**
     * Von Mises strain (%).
     */
    strain: number;
}

/**
 * Parameters for the nanoscroll builder, deserialized from a JSON string.
 *
 * All fields have sensible defaults so callers can supply a partial object.
 */
export interface JsNanoscrollParams {
    /**
     * Number of windings (turns). Default 6.
     */
    turns?: number;
    /**
     * Inner winding radius (Å). Default 25.
     */
    inner_radius?: number;
    /**
     * Scroll height along z (Å). Default 12.
     */
    length?: number;
    /**
     * Roll direction: \"a1\" or \"a2\". Default \"a1\".
     */
    roll_dir?: string;
    /**
     * Van-der-Waals interlayer gap (Å). Default 3.3.
     */
    interlayer_gap?: number;
    /**
     * Strain warning threshold (fraction). Default 0.15.
     */
    strain_warn_threshold?: number;
}

/**
 * Per-wall info returned by the nanotube builder.
 */
export interface JsNanotubeWall {
    /**
     * Chiral index n.
     */
    n: number;
    /**
     * Chiral index m.
     */
    m: number;
    /**
     * Wall radius (Å).
     */
    radius: number;
    /**
     * Atom count for this wall.
     */
    n_atoms: number;
}

/**
 * Registry-candidate set result.
 */
export interface JsRegistryResult {
    /**
     * One entry per in-plane shift.
     */
    candidates: JsRegistryCandidate[];
    /**
     * Number of candidates.
     */
    n_candidates: number;
}

/**
 * Result from potential calculation.
 */
export interface JsPotentialResult {
    /**
     * Total potential energy in eV
     */
    energy: number;
    /**
     * Forces on each atom [Fx, Fy, Fz] in eV/Å (flat array)
     */
    forces: number[];
    /**
     * Optional 3x3 stress tensor in eV/Å³ (Voigt: xx, yy, zz, yz, xz, xy)
     */
    stress: [number, number, number, number, number, number] | undefined;
}

/**
 * Result of PBC image generation.
 * Contains arrays of image atom data aligned by index.
 */
export interface JsPbcImageResult {
    /**
     * Index of the parent atom in the original structure for each image
     */
    parent_indices: number[];
    /**
     * Cartesian positions [x, y, z] of each image atom
     */
    positions_xyz: [number, number, number][];
    /**
     * Fractional positions [a, b, c] of each image atom
     */
    positions_abc: [number, number, number][];
    /**
     * Number of Phase 1 (translational) images (the rest are bond-completion)
     */
    num_translational: number;
}

/**
 * Result of RMS distance calculation between two structures.
 */
export interface JsRmsDistResult {
    /**
     * Root mean square distance between matched sites (Ångströms)
     */
    rms: number;
    /**
     * Maximum distance between any pair of matched sites (Ångströms)
     */
    max_dist: number;
}

/**
 * Result of neighbor list calculation.
 */
export interface JsNeighborList {
    /**
     * Indices of center atoms
     */
    center_indices: number[];
    /**
     * Indices of neighbor atoms
     */
    neighbor_indices: number[];
    /**
     * Periodic image offsets [h, k, l] for each neighbor
     */
    image_offsets: [number, number, number][];
    /**
     * Distances from center to neighbor (Ångströms)
     */
    distances: number[];
}

/**
 * Result type for Niggli reduction.
 */
export interface JsNiggliResult {
    /**
     * Flattened 3x3 Niggli matrix (row-major, 9 elements)
     */
    matrix: number[];
    /**
     * Flattened 3x3 transformation matrix (row-major, 9 elements)
     */
    transformation: number[];
    /**
     * Niggli form type: \"TypeI\" or \"TypeII\
     */
    form: string;
}

/**
 * Result type for parse_ase_atoms containing type name and JSON data.
 */
export interface JsAseParseResult {
    /**
     * \"Structure\" or \"Molecule\
     */
    type: string;
    /**
     * JSON string in pymatgen format
     */
    data: string;
}

/**
 * Result wrapper that serializes to `{ ok: T }` on success or `{ error: string }` on failure.
 * TypeScript: `WasmResult<T> = { ok: T } | { error: string }`
 */
export type WasmResult<T> = { ok: T } | { error: string };

/**
 * Search parameters (SLAB mode). Mirrors the SLAB-relevant subset of
 * `HeterostructureSearchParams` in the TS API.
 */
export interface JsHeteroSearchParams {
    /**
     * Maximum super-lattice area (Å²).
     */
    max_area?: number;
    /**
     * Area ratio tolerance.
     */
    max_area_ratio_tol?: number;
    /**
     * Length tolerance for vector matching.
     */
    max_length_tol?: number;
    /**
     * Angle tolerance for vector matching.
     */
    max_angle_tol?: number;
    /**
     * Maximum matches to return.
     */
    max_results?: number;
}

/**
 * Search result. Mirrors `HeterostructureSearchResult` (terminations are
 * empty in slab mode, as in the Python `search_matches_slab`).
 */
export interface JsHeteroSearchResult {
    /**
     * Matches sorted by (area, strain).
     */
    matches: JsHeteroMatch[];
    /**
     * Termination pairs (always empty in slab mode).
     */
    terminations: Value[];
    /**
     * Number of matches.
     */
    n_matches: number;
    /**
     * Number of termination pairs.
     */
    n_terminations: number;
    /**
     * Human-readable message.
     */
    message: string;
}

/**
 * Species occupancy at a site (element + occupancy + optional oxidation state).
 */
export interface JsSpeciesOccupancy {
    /**
     * Element symbol (e.g., \"Fe\", \"O\", \"Li\")
     */
    element: string;
    /**
     * Site occupancy (0.0 to 1.0, typically 1.0 for ordered sites)
     */
    occu?: number;
    /**
     * Optional oxidation state (e.g., 2 for Fe²⁺, -2 for O²⁻)
     */
    oxidation_state?: number;
}

/**
 * XRD calculation options.
 */
export interface JsXrdOptions {
    /**
     * X-ray wavelength in Angstroms (default: Cu Kα = 1.54184)
     */
    wavelength?: number;
    /**
     * 2θ range in degrees as [min, max]. None = all accessible angles
     */
    two_theta_range?: [number, number] | undefined;
    /**
     * Debye-Waller factors per element symbol (thermal damping)
     */
    debye_waller_factors?: Map<string, number>;
    /**
     * Whether to scale intensities to 0-100 (default: true)
     */
    scaled?: boolean;
}

/**
 * XRD pattern result.
 */
export interface JsXrdPattern {
    /**
     * 2θ angles in degrees
     */
    two_theta: number[];
    /**
     * Peak intensities (scaled 0-100 if scaled=true)
     */
    intensities: number[];
    /**
     * Miller indices for each peak (grouped by unique families)
     */
    hkls: JsHklInfo[][];
    /**
     * d-spacings in Angstroms
     */
    d_spacings: number[];
}


/**
 * Typed-array bond-detection result. Avoids serde JSON on the WASM boundary:
 * each getter copies a flat typed array out of WASM memory (~500 KB total for
 * 26k bonds, sub-millisecond) instead of serializing/parsing a multi-MB JSON
 * string (~60 ms round trip at 20k atoms).
 */
export class BondTable {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly count: number;
    readonly images: Int8Array;
    readonly lengths: Float32Array;
    readonly pairs: Uint32Array;
    readonly strengths: Float32Array;
}

/**
 * FIRE optimizer state with cell optimization.
 */
export class JsCellFireState {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Check if optimization has converged.
     *
     * fmax: force convergence threshold (must be positive)
     * smax: stress convergence threshold (must be positive)
     */
    is_converged(fmax: number, smax: number): boolean;
    /**
     * Get maximum force component.
     */
    max_force(): number;
    /**
     * Get maximum stress component.
     */
    max_stress(): number;
    /**
     * Create a new CellFIRE state.
     *
     * positions: flat array [x0, y0, z0, ...] in Angstrom
     * cell: 9-element cell matrix (row-major)
     * config: optional FIRE configuration
     * cell_factor: scaling factor for cell DOF (default: 1.0)
     *
     * Returns an error if positions length is not a multiple of 3 or cell is not 9 elements.
     */
    constructor(positions: Float64Array, cell: Float64Array, config?: JsFireConfig | null, cell_factor?: number | null);
    /**
     * Get cell matrix as flat array.
     */
    readonly cell: Float64Array;
    /**
     * Number of atoms.
     */
    readonly num_atoms: number;
    /**
     * Get positions as flat array.
     */
    readonly positions: Float64Array;
}

/**
 * JavaScript-accessible Element wrapper.
 */
export class JsElement {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get common oxidation states as a JavaScript array.
     */
    common_oxidation_states(): Int8Array;
    /**
     * Create an element from its atomic number.
     *
     * Accepts 1-118 for real elements, plus pseudo-elements:
     * - 119: Dummy (placeholder atom)
     * - 120: D (Deuterium)
     * - 121: T (Tritium)
     */
    static from_atomic_number(atomic_num: number): JsElement;
    /**
     * Get ICSD oxidation states (with at least 10 instances in ICSD) as a JavaScript array.
     */
    icsd_oxidation_states(): Int8Array;
    /**
     * Get all ionic radii as JSON string: {"oxi_state": radius, ...}.
     *
     * Returns null if no ionic radii data is available.
     */
    ionic_radii(): string | undefined;
    /**
     * Get ionic radius for a specific oxidation state (or NaN if not defined).
     */
    ionic_radius(oxidation_state: number): number;
    /**
     * Get all ionization energies in kJ/mol.
     */
    ionization_energies(): Float64Array;
    /**
     * Check if element is an actinoid.
     */
    is_actinoid(): boolean;
    /**
     * Check if element is an alkali metal.
     */
    is_alkali(): boolean;
    /**
     * Check if element is an alkaline earth metal.
     */
    is_alkaline(): boolean;
    /**
     * Check if element is a chalcogen.
     */
    is_chalcogen(): boolean;
    /**
     * Check if element is a halogen.
     */
    is_halogen(): boolean;
    /**
     * Check if element is a lanthanoid.
     */
    is_lanthanoid(): boolean;
    /**
     * Check if element is a metal.
     */
    is_metal(): boolean;
    /**
     * Check if element is a metalloid.
     */
    is_metalloid(): boolean;
    /**
     * Check if element is a noble gas.
     */
    is_noble_gas(): boolean;
    /**
     * Check if element is a post-transition metal.
     */
    is_post_transition_metal(): boolean;
    /**
     * Check if this is a pseudo-element (Dummy, D, T).
     */
    is_pseudo(): boolean;
    /**
     * Check if element is radioactive.
     */
    is_radioactive(): boolean;
    /**
     * Check if element is a rare earth element.
     */
    is_rare_earth(): boolean;
    /**
     * Check if element is a transition metal.
     */
    is_transition_metal(): boolean;
    /**
     * Create an element from its symbol (e.g., "Fe", "O", "Na").
     *
     * Also accepts pseudo-elements: "D" (Deuterium), "T" (Tritium),
     * and "X"/"Dummy"/"Vac" (placeholder atom).
     */
    constructor(symbol: string);
    /**
     * Get oxidation states as a JavaScript array.
     */
    oxidation_states(): Int8Array;
    /**
     * Get Shannon ionic radius (or NaN if not defined).
     */
    shannon_ionic_radius(oxidation_state: number, coordination: string, spin: string): number;
    /**
     * Get full Shannon radii as JSON string.
     *
     * Structure: {oxi_state: {coordination: {spin: {crystal_radius, ionic_radius}}}}
     * Returns null if no Shannon radii data is available.
     */
    shannon_radii(): string | undefined;
    /**
     * Get the atomic mass in atomic mass units.
     */
    readonly atomic_mass: number;
    /**
     * Get the atomic number.
     */
    readonly atomic_number: number;
    /**
     * Get atomic radius in Angstroms (or NaN if not defined).
     */
    readonly atomic_radius: number;
    /**
     * Get the periodic table block ("S", "P", "D", or "F").
     */
    readonly block: string;
    /**
     * Get boiling point in Kelvin (or NaN if not defined).
     */
    readonly boiling_point: number;
    /**
     * Get covalent radius in Angstroms (or NaN if not defined).
     */
    readonly covalent_radius: number;
    /**
     * Get density in g/cm³ (or NaN if not defined).
     */
    readonly density: number;
    /**
     * Get electron affinity in kJ/mol (or NaN if not defined).
     */
    readonly electron_affinity: number;
    /**
     * Get electron configuration string (or empty string if not defined).
     */
    readonly electron_configuration: string;
    /**
     * Get semantic electron configuration with noble gas core (or empty string if not defined).
     */
    readonly electron_configuration_semantic: string;
    /**
     * Get the Pauling electronegativity (or NaN if not defined).
     */
    readonly electronegativity: number;
    /**
     * Get first ionization energy in kJ/mol (or NaN if not defined).
     */
    readonly first_ionization_energy: number;
    /**
     * Get the periodic table group (1-18).
     */
    readonly group: number;
    /**
     * Get maximum oxidation state (or 0 if none).
     */
    readonly max_oxidation_state: number;
    /**
     * Get melting point in Kelvin (or NaN if not defined).
     */
    readonly melting_point: number;
    /**
     * Get minimum oxidation state (or 0 if none).
     */
    readonly min_oxidation_state: number;
    /**
     * Get molar heat capacity (Cp) in J/(mol·K) (or NaN if not defined).
     */
    readonly molar_heat: number;
    /**
     * Get number of valence electrons (or 0 if not defined).
     */
    readonly n_valence: number;
    /**
     * Get the full element name.
     */
    readonly name: string;
    /**
     * Get the periodic table row (1-7).
     */
    readonly row: number;
    /**
     * Get specific heat capacity in J/(g·K) (or NaN if not defined).
     */
    readonly specific_heat: number;
    /**
     * Get the element symbol.
     */
    readonly symbol: string;
}

/**
 * FIRE optimizer configuration.
 */
export class JsFireConfig {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create a new FIRE configuration with default parameters.
     */
    constructor();
    /**
     * Set maximum timestep.
     */
    set_dt_max(dt_max: number): void;
    /**
     * Set initial timestep.
     */
    set_dt_start(dt_start: number): void;
    /**
     * Set maximum step size in Angstrom.
     */
    set_max_step(max_step: number): void;
    /**
     * Set minimum steps before dt increase.
     */
    set_n_min(n_min: number): void;
}

/**
 * FIRE optimizer state.
 */
export class JsFireState {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Check if optimization has converged.
     */
    is_converged(fmax: number): boolean;
    /**
     * Get maximum force component.
     */
    max_force(): number;
    /**
     * Create a new FIRE state.
     *
     * positions: flat array [x0, y0, z0, ...] in Angstrom
     * config: optional FIRE configuration (uses defaults if not provided)
     *
     * Returns an error if positions length is not a multiple of 3.
     */
    constructor(positions: Float64Array, config?: JsFireConfig | null);
    /**
     * Current timestep.
     */
    readonly dt: number;
    /**
     * Number of atoms.
     */
    readonly num_atoms: number;
    /**
     * Get positions as flat array.
     */
    readonly positions: Float64Array;
}

/**
 * Langevin dynamics integrator for NVT ensemble.
 */
export class JsLangevinIntegrator {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create a new Langevin integrator.
     *
     * temperature_k: target temperature in Kelvin (must be non-negative)
     * friction: friction coefficient in 1/fs (must be positive)
     * dt: timestep in femtoseconds (must be positive)
     * seed: optional RNG seed for reproducibility
     */
    constructor(temperature_k: number, friction: number, dt: number, seed?: bigint | null);
    /**
     * Set timestep.
     */
    set_dt(dt: number): void;
    /**
     * Set friction coefficient.
     */
    set_friction(friction: number): void;
    /**
     * Set target temperature.
     */
    set_temperature(temperature_k: number): void;
}

/**
 * MD simulation state for WASM.
 */
export class JsMDState {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Initialize velocities from Maxwell-Boltzmann distribution.
     */
    init_velocities(temperature_k: number, seed?: bigint | null): void;
    /**
     * Compute kinetic energy in eV.
     */
    kinetic_energy(): number;
    /**
     * Create a new MD state.
     *
     * positions: flat array [x0, y0, z0, x1, y1, z1, ...] in Angstrom
     * masses: array of atomic masses in amu
     */
    constructor(positions: Float64Array, masses: Float64Array);
    /**
     * Set cell matrix (9 elements, row-major).
     */
    set_cell(cell: Float64Array, pbc_x: boolean, pbc_y: boolean, pbc_z: boolean): void;
    /**
     * Compute temperature in Kelvin.
     */
    temperature(): number;
    /**
     * Get forces as flat array.
     */
    forces: Float64Array;
    /**
     * Get masses.
     */
    readonly masses: Float64Array;
    /**
     * Number of atoms.
     */
    readonly num_atoms: number;
    /**
     * Get positions as flat array.
     */
    positions: Float64Array;
    /**
     * Get velocities as flat array.
     */
    velocities: Float64Array;
}

/**
 * Streaming MSD calculator for large trajectories.
 *
 * Usage: create with new(), add frames with add_frame(), get result with compute_msd().
 */
export class JsMsdCalculator {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a frame to the MSD calculation.
     *
     * positions: flat array of [x0, y0, z0, x1, y1, z1, ...] for all atoms
     */
    add_frame(positions: Float64Array): WasmResult;
    /**
     * Compute final MSD values averaged over all atoms.
     *
     * Returns MSD values for each lag time (length = max_lag + 1).
     */
    compute_msd(): Float64Array;
    /**
     * Compute MSD for each atom separately.
     *
     * Returns flattened array of shape (max_lag+1, n_atoms) in row-major order:
     * `[msd_lag0_atom0, msd_lag0_atom1, ..., msd_lag1_atom0, msd_lag1_atom1, ...]`
     *
     * To access MSD for atom `a` at lag `t`: `result[t * n_atoms + a]`
     */
    compute_msd_per_atom(): Float64Array;
    /**
     * Get maximum lag time in frames.
     */
    max_lag(): number;
    /**
     * Get number of atoms.
     */
    n_atoms(): number;
    /**
     * Create a new MSD calculator.
     *
     * n_atoms: number of atoms in each frame (must be > 0)
     * max_lag: maximum lag time in frames
     * origin_interval: frames between time origins (must be > 0, smaller = more samples)
     */
    constructor(n_atoms: number, max_lag: number, origin_interval: number);
}

/**
 * NPT integrator using Parrinello-Rahman barostat.
 */
export class JsNPTIntegrator {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create a new NPT integrator.
     *
     * temperature: target temperature in Kelvin (must be non-negative)
     * pressure: target pressure in GPa
     * tau_t: thermostat time constant in femtoseconds (must be positive)
     * tau_p: barostat time constant in femtoseconds (must be positive)
     * dt: timestep in femtoseconds (must be positive)
     * n_atoms: number of atoms
     * total_mass: total system mass in amu (must be positive)
     */
    constructor(temperature: number, pressure: number, tau_t: number, tau_p: number, dt: number, n_atoms: number, total_mass: number);
    /**
     * Get instantaneous pressure from stress tensor.
     */
    pressure(stress: Float64Array): WasmResult;
}

/**
 * State for NPT molecular dynamics with variable cell.
 */
export class JsNPTState {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get kinetic energy in eV.
     */
    kinetic_energy(): number;
    /**
     * Create a new NPT state.
     *
     * positions: flat array [x0, y0, z0, ...] in Angstrom
     * masses: array of atomic masses in amu
     * cell: 9-element cell matrix (row-major) in Angstrom
     * pbc_x, pbc_y, pbc_z: periodic boundary conditions
     */
    constructor(positions: Float64Array, masses: Float64Array, cell: Float64Array, pbc_x: boolean, pbc_y: boolean, pbc_z: boolean);
    /**
     * Get temperature in Kelvin.
     */
    temperature(): number;
    /**
     * Get cell volume in Angstrom³.
     */
    volume(): number;
    /**
     * Get cell matrix as flat array.
     */
    readonly cell: Float64Array;
    /**
     * Number of atoms.
     */
    readonly num_atoms: number;
    /**
     * Get positions as flat array.
     */
    readonly positions: Float64Array;
    /**
     * Get velocities as flat array.
     */
    readonly velocities: Float64Array;
}

/**
 * Nose-Hoover chain thermostat for NVT ensemble.
 */
export class JsNoseHooverChain {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create a new Nose-Hoover chain thermostat.
     *
     * target_temp: target temperature in Kelvin (must be non-negative)
     * tau: coupling time constant in femtoseconds (must be positive)
     * dt: timestep in femtoseconds (must be positive)
     * n_dof: number of degrees of freedom (typically 3 * n_atoms - 3)
     */
    constructor(target_temp: number, tau: number, dt: number, n_dof: number);
    /**
     * Set target temperature.
     */
    set_temperature(target_temp: number): void;
}

/**
 * JavaScript-accessible Species wrapper.
 */
export class JsSpecies {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create a species from a string like "Fe2+", "O2-", "Na+".
     */
    constructor(species_str: string);
    /**
     * Get Shannon ionic radius with coordination and spin (or NaN if not defined).
     */
    shannon_ionic_radius(coordination: string, spin: string): number;
    /**
     * Get the species string representation (e.g., "Fe2+").
     */
    to_string(): string;
    /**
     * Get the element's atomic number.
     */
    readonly atomic_number: number;
    /**
     * Get atomic radius (or NaN if not defined).
     */
    readonly atomic_radius: number;
    /**
     * Get covalent radius (or NaN if not defined).
     */
    readonly covalent_radius: number;
    /**
     * Get electronegativity (or NaN if not defined).
     */
    readonly electronegativity: number;
    /**
     * Get ionic radius for this species' oxidation state (or NaN if not defined).
     */
    readonly ionic_radius: number;
    /**
     * Get the element's full name (e.g., "Iron" for Fe).
     */
    readonly name: string;
    /**
     * Get the oxidation state (or null/undefined if not set).
     */
    readonly oxidation_state: number | undefined;
    /**
     * Get the element symbol.
     */
    readonly symbol: string;
}

/**
 * Streaming VACF calculator for large trajectories.
 */
export class JsVacfCalculator {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a frame to the VACF calculation.
     *
     * velocities: flat array of [vx0, vy0, vz0, vx1, vy1, vz1, ...] for all atoms
     */
    add_frame(velocities: Float64Array): WasmResult;
    /**
     * Compute normalized VACF (VACF(t) / VACF(0)).
     */
    compute_normalized_vacf(): Float64Array;
    /**
     * Compute final VACF values.
     */
    compute_vacf(): Float64Array;
    /**
     * Get maximum lag time in frames.
     */
    max_lag(): number;
    /**
     * Get number of atoms.
     */
    n_atoms(): number;
    /**
     * Create a new VACF calculator.
     *
     * n_atoms: number of atoms in each frame (must be > 0)
     * max_lag: maximum lag time in frames
     * origin_interval: frames between time origins (must be > 0, smaller = more samples)
     */
    constructor(n_atoms: number, max_lag: number, origin_interval: number);
}

/**
 * Velocity rescaling thermostat (stochastic, canonical sampling).
 */
export class JsVelocityRescale {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create a new velocity rescale thermostat.
     *
     * target_temp: target temperature in Kelvin (must be non-negative)
     * tau: coupling time constant in femtoseconds (must be positive)
     * dt: timestep in femtoseconds (must be positive)
     * n_dof: number of degrees of freedom
     * seed: optional RNG seed
     */
    constructor(target_temp: number, tau: number, dt: number, n_dof: number, seed?: bigint | null);
    /**
     * Set target temperature.
     */
    set_temperature(target_temp: number): void;
}

/**
 * Isosurface buffers returned by [`WasmCubeVolume::extract`].
 *
 * Buffer getters are intentionally one-shot. Each `take_*` call transfers a
 * typed-array copy to JavaScript and releases the corresponding Rust buffer.
 */
export class WasmCubeMesh {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Take triangle indices as a JavaScript `Uint32Array`.
     */
    take_indices(): Uint32Array;
    /**
     * Take vertex normals as a JavaScript `Float32Array`.
     */
    take_normals(): Float32Array;
    /**
     * Take vertex positions as a JavaScript `Float32Array`.
     */
    take_positions(): Float32Array;
    /**
     * Original triangle count, retained after buffers are taken.
     */
    triangle_count(): number;
    /**
     * Original vertex count, retained after buffers are taken.
     */
    vertex_count(): number;
}

/**
 * Parsed Cube volume retained in WASM memory for one or more extractions.
 */
export class WasmCubeVolume {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Copy scalar samples into a JavaScript `Float32Array`.
     *
     * This is deliberately non-destructive: the Rust-owned volume remains
     * available for later isosurface extraction.
     */
    copy_data(): Float32Array;
    /**
     * Compatibility alias for callers that name the returned array as a grid.
     */
    copy_grid_data(): Float32Array;
    /**
     * Extract one smoothed isosurface with normalized face-area normals.
     *
     * The threaded artifact automatically enters cube-core's Rayon path; the
     * scalar artifact runs the same deterministic algorithm serially.
     */
    extract(isovalue: number): WasmCubeMesh;
    /**
     * Construct a volume from an already parsed browser grid.
     *
     * `voxel_axes` is a flattened row-major 3x3 matrix. This bridge preserves
     * the existing public TypeScript extraction API without re-serializing a
     * synthetic Cube file in the Worker.
     */
    static from_grid(data: Float32Array, dims: Uint32Array, origin: Float64Array, voxel_axes: Float64Array, data_min: number, data_max: number): WasmCubeVolume;
    /**
     * Serialize comments, atoms, origin, dimensions, and voxel axes as JSON.
     */
    header_json(): string;
    /**
     * Parse a complete Cube byte buffer.
     *
     * JavaScript callers should transfer an `ArrayBuffer` into their Worker,
     * then pass its `Uint8Array` view here.
     */
    static parse(bytes: Uint8Array): WasmCubeVolume;
    /**
     * Maximum scalar value reported by the Cube parser.
     */
    value_max(): number;
    /**
     * Minimum scalar value reported by the Cube parser.
     */
    value_min(): number;
    /**
     * Number of scalar samples in the volume.
     */
    voxel_count(): number;
}

/**
 * JavaScript-accessible StructureMatcher wrapper with builder pattern.
 */
export class WasmStructureMatcher {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Deduplicate a list of structures.
     * Returns array where result[i] is the index of the first matching structure.
     */
    deduplicate(structures: JsCrystal[]): WasmResult;
    /**
     * Find matches for new structures against existing structures.
     * Returns array where result[i] is the index of matching existing structure or null.
     */
    find_matches(new_structures: JsCrystal[], existing_structures: JsCrystal[]): WasmResult;
    /**
     * Check if two structures match.
     */
    fit(struct1: JsCrystal, struct2: JsCrystal): WasmResult;
    /**
     * Check if two structures match under any species permutation.
     */
    fit_anonymous(struct1: JsCrystal, struct2: JsCrystal): WasmResult;
    /**
     * Get RMS distance between two structures.
     */
    get_rms_dist(struct1: JsCrystal, struct2: JsCrystal): WasmResult;
    /**
     * Compute a universal distance between any two structures.
     *
     * Unlike `get_rms_dist` which may return null for incompatible structures,
     * this method always returns a finite distance value, making it suitable for
     * consistent ranking of structures by similarity and compatible with `Number.isFinite()`.
     *
     * # Properties
     * - d(x, y) ≥ 0 (non-negative)
     * - d(x, x) = 0 (identity)
     * - d(x, y) = d(y, x) (symmetric)
     * - Always finite (clamped to 1e9 if underlying computation yields non-finite)
     *
     * Note: Triangle inequality is not guaranteed due to greedy matching.
     *
     * # Returns
     * Finite distance in [0, 1e9]. Smaller values indicate more similar structures.
     */
    get_structure_distance(struct1: JsCrystal, struct2: JsCrystal): WasmResult;
    /**
     * Create a new StructureMatcher with default settings.
     */
    constructor();
    /**
     * Set the angle tolerance (degrees).
     */
    with_angle_tol(tol: number): WasmStructureMatcher;
    /**
     * Set whether to use element-only comparison (ignores oxidation states).
     */
    with_element_comparator(val: boolean): WasmStructureMatcher;
    /**
     * Set the lattice length tolerance (fractional).
     */
    with_latt_len_tol(tol: number): WasmStructureMatcher;
    /**
     * Set whether to reduce to primitive cell before matching.
     */
    with_primitive_cell(val: boolean): WasmStructureMatcher;
    /**
     * Set whether to scale volumes to match.
     */
    with_scale(val: boolean): WasmStructureMatcher;
    /**
     * Set the site position tolerance (normalized).
     */
    with_site_pos_tol(tol: number): WasmStructureMatcher;
}

/**
 * Mutable exact bond-detection session for trajectory frames sharing one topology.
 */
export class WasmTrajectoryBondSession {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Compute one exact frame while retaining the session's reusable workspace.
     */
    compute_frame(positions: Float32Array, lattice: Float64Array, frame_idx: number): BondTable;
    /**
     * Return cumulative session diagnostics as a compact JSON object.
     */
    diagnostics_json(): string;
}

/**
 * Find adsorption sites using the Alpha Shape V7 algorithm (alpha_shape.rs).
 *
 * params_json: JSON object with AlphaShapeParams fields (all optional with serde defaults).
 * Returns JSON: { sites: [...], n_top, n_bridge, n_hollow3, n_hollow4 }
 * Each site: { id, position, site_type, normal, neighbor_indices, neighbor_elements, env_signature, height }
 */
export function adsorbate_find_sites(slab: JsCrystal, params_json: string): WasmResult;

/**
 * Apply inversion symmetry to the structure.
 */
export function apply_inversion(structure: JsCrystal, fractional: boolean): WasmResult;

/**
 * Apply a symmetry operation to the structure.
 * The rotation matrix should be a 3x3 float matrix, and translation is a 3D vector.
 * If fractional is true, the operation is applied in fractional coordinates.
 */
export function apply_operation(structure: JsCrystal, rotation: JsMatrix3x3, translation: JsVector3, fractional: boolean): WasmResult;

/**
 * Convert an ASE Atoms dict to pymatgen format.
 *
 * Returns JSON string for either a Structure or Molecule depending on periodicity.
 */
export function ase_to_pymatgen(ase_atoms: JsAseAtoms): WasmResult;

/**
 * SLAB-mode build for a selected ZSL match.
 *
 * Equivalent to `POST /api/heterostructure/build` with
 * `search_params.mode = "slab"`. `match_id` is the generation-order index
 * from a [`hetero_search`] result (the `match_id` field). `twist_angle`
 * (degrees) rotates the film in-plane around its centroid before stacking.
 */
export function build_hetero(substrate: JsCrystal, film: JsCrystal, match_id: number, gap: number, vacuum: number, twist_angle: number, params: JsHeteroSearchParams): WasmResult;

/**
 * BULK-mode build for a selected ZSL match. Cuts surface slabs from the two
 * bulk crystals, then builds the chosen match via the slab-mode builder.
 *
 * Equivalent to `POST /api/heterostructure/build` with
 * `search_params.mode = "bulk"`.
 */
export function build_hetero_bulk(substrate: JsCrystal, film: JsCrystal, substrate_miller: Int32Array, film_miller: Int32Array, substrate_layers: number, film_layers: number, substrate_termination: number, film_termination: number, match_id: number, gap: number, vacuum: number, twist_angle: number, params: JsHeteroSearchParams): WasmResult;

/**
 * SLAB-mode grid scan: shift the film atoms of an already-built
 * heterostructure across the irreducible wedge of the film slab.
 *
 * Equivalent to `POST /api/heterostructure/grid-scan`. `n_atoms_substrate`
 * is the number of leading substrate atoms (the rest are film).
 */
export function build_hetero_grid_scan(heterostructure: JsCrystal, film: JsCrystal, n_atoms_substrate: number, n_grid_x: number, n_grid_y: number, symprec: number): WasmResult;

/**
 * SLAB-mode manual build with user-specified 2x2 transforms (no ZSL search).
 *
 * Equivalent to `POST /api/heterostructure/build-manual`. Each transform is
 * a 2x2 integer matrix as nested arrays. `xy_shift` is the fractional
 * `(fa, fb)` in-plane shift of the film along the substrate-supercell a,b
 * vectors (defaults to `(0, 0)` to match the no-shift manual build).
 */
export function build_hetero_manual(substrate: JsCrystal, film: JsCrystal, substrate_transform: Int32Array, film_transform: Int32Array, gap: number, vacuum: number, xy_shift_a: number, xy_shift_b: number): WasmResult;

/**
 * SLAB-mode registry candidates: build the SAME ZSL match at a family of
 * in-plane xy shifts.
 *
 * Equivalent to `POST /api/heterostructure/batch-build` (minus the
 * zip-archive serialization, which the TS side performs from these
 * structures). `match_id` is the generation-order index.
 *
 * Shift-grid priority: `step_angstrom > 0` → Å-step grid;
 * else `n_shift > 0` → n×n uniform grid; else surface-atom shifts.
 */
export function build_hetero_registry(substrate: JsCrystal, film: JsCrystal, match_id: number, n_shift: number, gap: number, vacuum: number, step_angstrom: number, target_z: number, params: JsHeteroSearchParams): WasmResult;

/**
 * Build a lateral heterojunction for a selected edge-match.
 *
 * Equivalent to `POST /api/heterostructure/build-lateral`. `match_id` is the
 * index into the sorted lateral-search result. `interface_axis` /
 * `max_length` / `max_strain` are the search params (re-run inside the build,
 * matching the backend). `width_a` / `width_b` repeat each slab perpendicular
 * to the interface; `buffer` is the interface gap and `vacuum` the out-of-plane
 * padding (Å).
 */
export function build_lateral(slab_a: JsCrystal, slab_b: JsCrystal, match_id: number, interface_axis: number, width_a: number, width_b: number, buffer: number, vacuum: number, max_length: number, max_strain: number): WasmResult;

/**
 * Build a Moiré bilayer supercell from a selected candidate.
 *
 * `request_json` is a JSON string matching the `/api/moire/build` request body
 * `{ layer_a, layer_b, candidate, params }`. Returns `WasmResult<String>`
 * whose `ok` field is a JSON string matching `MoireBuildResult`.
 */
export function build_moire(request_json: string): WasmResult;

/**
 * Build a nanoscroll from a monolayer.
 *
 * `monolayer` is a single 2D layer (any composition). `params_json` is a JSON
 * object string with optional keys: turns, inner_radius, length, roll_dir,
 * interlayer_gap, strain_warn_threshold.
 *
 * Returns the rolled structure plus metadata (turns, inner/outer radius,
 * length, n_atoms, supercell, strain warning).
 */
export function build_nanoscroll(monolayer: JsCrystal, params_json: string): WasmResult;

/**
 * Build a nanotube by rolling up a 2D material sheet.
 *
 * `n_walls` > 1 builds a multi-wall nanotube using `interlayer_spacing` (Å).
 */
export function build_nanotube(layer: JsNanotubeLayer, n: number, m: number, nl: number, vacuum: number, n_walls: number, interlayer_spacing: number): WasmResult;

/**
 * Perform Delaunay reduction on a lattice.
 *
 * Returns JSON object with reduced lattice matrix and transformation matrix.
 */
export function cell_delaunay_reduce(structure: JsCrystal, tolerance: number): WasmResult;

/**
 * Find supercell transformation matrix for target atom count.
 *
 * Returns JSON array [[a1,a2,a3],[b1,b2,b3],[c1,c2,c3]].
 */
export function cell_find_supercell_matrix(structure: JsCrystal, target_atoms: number): WasmResult;

/**
 * Perform one CellFIRE optimization step with provided forces and stress.
 */
export function cell_fire_step_with_forces_and_stress(state: JsCellFireState, forces: Float64Array, stress: Float64Array): WasmResult;

/**
 * Check if a lattice is already Niggli-reduced.
 */
export function cell_is_niggli_reduced(structure: JsCrystal, tolerance: number): WasmResult;

/**
 * Check if one lattice is a supercell of another.
 *
 * Returns JSON: null if not a supercell, or [[a,b,c],[d,e,f],[g,h,i]] transformation.
 */
export function cell_is_supercell(structure: JsCrystal, other: JsCrystal, tolerance: number): WasmResult;

/**
 * Check if two lattices are equivalent under rotation/permutation.
 */
export function cell_lattices_equivalent(structure1: JsCrystal, structure2: JsCrystal, tolerance: number): WasmResult;

/**
 * Calculate minimum image distance between two fractional positions.
 */
export function cell_minimum_image_distance(structure: JsCrystal, frac1: Float64Array, frac2: Float64Array): WasmResult;

/**
 * Calculate minimum image vector between two fractional positions.
 *
 * Returns JSON array [x, y, z] of the Cartesian displacement.
 */
export function cell_minimum_image_vector(structure: JsCrystal, frac1: Float64Array, frac2: Float64Array): WasmResult;

/**
 * Perform Niggli reduction on a lattice.
 *
 * Returns JSON object with reduced lattice matrix and transformation matrix.
 */
export function cell_niggli_reduce(structure: JsCrystal, tolerance: number): WasmResult;

/**
 * Get perpendicular distances for each lattice axis.
 *
 * Returns JSON array [d_a, d_b, d_c].
 */
export function cell_perpendicular_distances(structure: JsCrystal): WasmResult;

/**
 * Wrap all site positions to the unit cell [0, 1)^3.
 */
export function cell_wrap_to_unit_cell(structure: JsCrystal): WasmResult;

/**
 * Classify all atoms in a structure based on their local order parameters.
 *
 * Returns structure type string for each atom.
 */
export function classify_all_atoms(structure: JsCrystal, cutoff: number, tolerance: number): WasmResult;

/**
 * Classify local structure based on q4 and q6 values.
 *
 * Returns structure type: "fcc", "bcc", "hcp", "icosahedral", "liquid", or "unknown".
 */
export function classify_local_structure(q4: number, q6: number, tolerance: number): string;

/**
 * Get the net charge of a composition.
 *
 * Returns null if any species lacks an oxidation state, or if the charge is non-integer.
 */
export function composition_charge(formula: string): WasmResult;

/**
 * Check if two compositions are approximately equal.
 *
 * Uses relative tolerance of 0.01 (1%) and absolute tolerance of 1e-8.
 */
export function compositions_almost_equal(formula1: string, formula2: string): WasmResult;

/**
 * Compute d-spacing for a Miller index using local slab.rs implementation.
 */
export function compute_d_spacing(structure_json: string, h: number, k: number, l: number): number;

/**
 * Compute harmonic bond energy and forces.
 *
 * V = 0.5 * k * (r - r₀)²
 *
 * positions: flat array [x0, y0, z0, x1, y1, z1, ...] in Angstrom
 * bonds: flat array [i0, j0, k0, r0_0, i1, j1, k1, r0_1, ...] where
 *        i,j are atom indices, k is spring constant (eV/Å²), r0 is equilibrium distance (Å)
 * cell: optional 3x3 cell matrix as flat array
 * pbc_x, pbc_y, pbc_z: periodic boundary conditions
 * compute_stress: whether to compute stress tensor
 */
export function compute_harmonic_bonds(positions: Float64Array, bonds: Float64Array, cell: Float64Array | null | undefined, pbc_x: boolean, pbc_y: boolean, pbc_z: boolean, compute_stress: boolean): WasmResult;

/**
 * Compute Lennard-Jones potential energy and forces.
 *
 * V(r) = 4ε[(σ/r)¹² - (σ/r)⁶]
 *
 * positions: flat array [x0, y0, z0, x1, y1, z1, ...] in Angstrom
 * cell: optional 3x3 cell matrix as flat array [a1, a2, a3, b1, b2, b3, c1, c2, c3]
 * pbc_x, pbc_y, pbc_z: periodic boundary conditions
 * sigma: LJ sigma in Angstrom (default: 3.4 for Ar)
 * epsilon: LJ epsilon in eV (default: 0.0103 for Ar)
 * cutoff: optional cutoff distance in Angstrom
 * compute_stress: whether to compute stress tensor
 */
export function compute_lennard_jones(positions: Float64Array, cell: Float64Array | null | undefined, pbc_x: boolean, pbc_y: boolean, pbc_z: boolean, sigma: number, epsilon: number, cutoff: number | null | undefined, compute_stress: boolean): WasmResult;

/**
 * Compute Lennard-Jones forces only.
 *
 * Returns flat array of forces [Fx0, Fy0, Fz0, Fx1, Fy1, Fz1, ...] in eV/Å.
 */
export function compute_lennard_jones_forces(positions: Float64Array, cell: Float64Array | null | undefined, pbc_x: boolean, pbc_y: boolean, pbc_z: boolean, sigma: number, epsilon: number, cutoff?: number | null): WasmResult;

/**
 * Compute Morse potential energy and forces.
 *
 * V(r) = D * (1 - exp(-α(r - r₀)))² - D
 *
 * positions: flat array [x0, y0, z0, x1, y1, z1, ...] in Angstrom
 * cell: optional 3x3 cell matrix as flat array
 * pbc_x, pbc_y, pbc_z: periodic boundary conditions
 * d: well depth in eV
 * alpha: width parameter in 1/Angstrom
 * r0: equilibrium distance in Angstrom
 * cutoff: cutoff distance in Angstrom
 * compute_stress: whether to compute stress tensor
 */
export function compute_morse(positions: Float64Array, cell: Float64Array | null | undefined, pbc_x: boolean, pbc_y: boolean, pbc_z: boolean, d: number, alpha: number, r0: number, cutoff: number, compute_stress: boolean): WasmResult;

/**
 * Compute RAC (Revised Autocorrelation) descriptors for a MOF.
 * Input: structure JSON + bonds JSON + clusters JSON (from detect_mof_sbus).
 * Output: JSON RacResult { descriptors: [{ name, value, scope, property, depth, op }] }.
 */
export function compute_rac_descriptors(structure_json: string, bonds_json: string, clusters_json: string): string;

/**
 * Compute soft sphere potential energy and forces.
 *
 * V(r) = ε(σ/r)^α
 *
 * positions: flat array [x0, y0, z0, x1, y1, z1, ...] in Angstrom
 * cell: optional 3x3 cell matrix as flat array
 * pbc_x, pbc_y, pbc_z: periodic boundary conditions
 * sigma: length scale in Angstrom
 * epsilon: energy scale in eV
 * alpha: exponent (default 12, use 2 for soft spheres)
 * cutoff: cutoff distance in Angstrom
 * compute_stress: whether to compute stress tensor
 */
export function compute_soft_sphere(positions: Float64Array, cell: Float64Array | null | undefined, pbc_x: boolean, pbc_y: boolean, pbc_z: boolean, sigma: number, epsilon: number, alpha: number, cutoff: number, compute_stress: boolean): WasmResult;

/**
 * Compute Steinhardt q_l order parameter for each atom.
 *
 * l is typically 4 or 6. cutoff is the neighbor distance in Angstrom.
 * Returns q_l values for each atom.
 */
export function compute_steinhardt_q(structure: JsCrystal, degree: number, cutoff: number): WasmResult;

/**
 * Compute Weisfeiler-Lehman graph hashes for all SBUs in a MOF.
 * Output: JSON array of { sbu_index: number, hash: number }.
 */
export function compute_wl_hashes(structure_json: string, bonds_json: string, clusters_json: string): string;

/**
 * Compute powder X-ray diffraction pattern from a structure.
 *
 * Options:
 * - wavelength: X-ray wavelength in Angstroms (default: 1.54184, Cu Kα)
 * - two_theta_range: [min, max] 2θ angles in degrees (default: [0, 180])
 * - debye_waller_factors: Element symbol -> B factor mapping
 * - scaled: Whether to scale intensities to 0-100 (default: true)
 */
export function compute_xrd(structure: JsCrystal, options?: JsXrdOptions | null): WasmResult;

/**
 * Create a copy of the structure, optionally sanitized.
 */
export function copy_structure(structure: JsCrystal, sanitize: boolean): WasmResult;

/**
 * Create a persistent exact trajectory bond session.
 */
export function create_trajectory_bond_session(session_id: number, atomic_numbers: Uint8Array, pbc: Uint8Array, options_json?: string | null): WasmTrajectoryBondSession;

/**
 * Compute CrystalNN near-neighbor info for a single site.
 *
 * config_json: JSON object with optional CrystalNNConfig fields:
 *   weighted_cn, cation_anion, distance_cutoffs, x_diff_weight,
 *   porous_adjustment, search_cutoff, fingerprint_length.
 *   Omitted fields use pymatgen defaults.
 *
 * Returns JSON: { all_nninfo: [...], cn_weights: {CN: prob}, cn_nninfo: {CN: [...]} }
 */
export function crystal_nn(structure: JsCrystal, site_index: number, config_json?: string | null): WasmResult;

/**
 * Compute CrystalNN coordination numbers for all sites.
 *
 * Returns JSON array of { site_idx, cn, neighbors: [...] }.
 */
export function crystal_nn_all(structure: JsCrystal, config_json?: string | null): WasmResult;

/**
 * Compile-time Cube execution backend for diagnostics and integration tests.
 */
export function cube_backend(): string;

/**
 * Classify an interstitial site based on its coordination number.
 */
export function defect_classify_site(coordination: number): string;

/**
 * Create an antisite pair by swapping species at two sites.
 */
export function defect_create_antisite(structure: JsCrystal, site_a_idx: number, site_b_idx: number): WasmResult;

/**
 * Create a dimer by moving two atoms closer together.
 */
export function defect_create_dimer(structure: JsCrystal, site_a_idx: number, site_b_idx: number, target_distance: number): WasmResult;

/**
 * Create an interstitial by adding an atom at a fractional position.
 */
export function defect_create_interstitial(structure: JsCrystal, position: Float64Array, species: string): WasmResult;

/**
 * Create a substitutional defect by replacing the species at a site.
 */
export function defect_create_substitution(structure: JsCrystal, site_idx: number, new_species: string): WasmResult;

/**
 * Create a vacancy by removing an atom at the specified site index.
 *
 * Returns JSON with 'structure' (defective structure) and defect info.
 */
export function defect_create_vacancy(structure: JsCrystal, site_idx: number): WasmResult;

/**
 * Distort bonds around a defect site by specified factors.
 *
 * Returns JSON array of distorted structures with metadata.
 */
export function defect_distort_bonds(structure: JsCrystal, center_site_idx: number, distortion_factors: Float64Array, num_neighbors: number | null | undefined, cutoff: number): WasmResult;

/**
 * Find potential interstitial sites using Voronoi tessellation.
 *
 * Returns JSON array of sites with frac_coords, cart_coords, min_distance, coordination, site_type.
 */
export function defect_find_interstitial_sites(structure: JsCrystal, min_dist: number, symprec: number): WasmResult;

/**
 * Find an optimal supercell matrix for dilute defect calculations.
 *
 * Returns flat array of 9 integers [a1,a2,a3, b1,b2,b3, c1,c2,c3].
 */
export function defect_find_supercell(structure: JsCrystal, min_image_dist: number, max_atoms: number, cubic_preference: number): WasmResult;

/**
 * Generate all point defects for a structure.
 *
 * Returns JSON object with supercell_matrix, vacancies, substitutions,
 * interstitials, antisites, spacegroup, n_defects.
 */
export function defect_generate_all(structure: JsCrystal, extrinsic_json: string, include_vacancies: boolean, include_substitutions: boolean, include_interstitials: boolean, include_antisites: boolean, supercell_min_dist: number, supercell_max_atoms: number, interstitial_min_dist: number | null | undefined, symprec: number, max_charge: number): WasmResult;

/**
 * Generate a doped-compatible name for a point defect.
 */
export function defect_generate_name(defect_type: string, species?: string | null, original_species?: string | null, wyckoff?: string | null, site_type?: string | null): WasmResult;

/**
 * Get Wyckoff labels for all sites in a structure.
 *
 * Returns JSON array of {label, multiplicity, site_symmetry} objects.
 */
export function defect_get_wyckoff_labels(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Guess likely charge states for a point defect based on oxidation state probabilities.
 *
 * Returns JSON array of {charge, probability, reasoning} objects.
 */
export function defect_guess_charge_states(defect_type: string, removed_species: string | null | undefined, added_species: string | null | undefined, original_species: string | null | undefined, max_charge: number): WasmResult;

/**
 * Apply local rattling with distance-dependent amplitude decay.
 */
export function defect_local_rattle(structure: JsCrystal, center_site_idx: number, max_amplitude: number, decay_radius: number, seed: number): WasmResult;

/**
 * Apply Monte Carlo rattling - random displacements to all atoms.
 */
export function defect_rattle(structure: JsCrystal, stdev: number, seed: number, min_distance: number, max_attempts: number): WasmResult;

/**
 * Detect bonds using electronegativity-based algorithm.
 * Returns JSON array of Bond objects.
 */
export function detect_bonds_electronegativity(structure_json: string, options_json?: string | null): string;

/**
 * Detect bonds using covalent radii sum algorithm.
 * Returns JSON array of Bond objects.
 */
export function detect_bonds_radii(structure_json: string, options_json?: string | null): string;

/**
 * Detect bonds (atom_radii strategy) from raw typed arrays — no JSON on
 * either side of the boundary. Built for per-frame trajectory bonding where
 * the serde round trip dominates.
 *
 * * `positions` — Cartesian coordinates, flat `[x0,y0,z0, x1,...]`, length 3N (Å)
 * * `atomic_numbers` — element Z per site, length N
 * * `lattice` — row-major 3×3 lattice matrix (9 values), or empty for
 *   non-periodic systems (a bounding-box lattice with pbc=[false;3] is
 *   derived, matching the JSON path's molecule handling)
 * * `pbc` — per-axis periodicity flags (3 values, 0/1). Ignored when
 *   `lattice` is empty; defaults to fully periodic when empty but a lattice
 *   is given
 * * `options_json` — optional `AtomRadiiOptions` JSON (same schema as
 *   `detect_bonds_radii`)
 */
export function detect_bonds_radii_typed(positions: Float32Array, atomic_numbers: Uint8Array, lattice: Float64Array, pbc: Uint8Array, options_json?: string | null): BondTable;

/**
 * Detect bonds using solid angle-based algorithm.
 * Returns JSON array of Bond objects.
 */
export function detect_bonds_solid_angle(structure_json: string, options_json?: string | null): string;

/**
 * Detect hydrogen bonds using Baker-Hubbard criteria.
 * Takes structure JSON and pre-computed covalent bonds JSON.
 * Returns JSON array of HydrogenBond objects.
 */
export function detect_hydrogen_bonds(structure_json: string, covalent_bonds_json: string, options_json?: string | null): string;

/**
 * Detect atomic layers along a normal direction.
 */
export function detect_layers(structure_json: string, nx: number, ny: number, nz: number): string;

/**
 * Detect atomic layers along a Miller index direction.
 */
export function detect_layers_miller(structure_json: string, h: number, k: number, l: number): string;

/**
 * Detect MOF SBUs (Secondary Building Units) from structure + bonds.
 * Returns JSON MofClusters with SBU assignments for each atom.
 *
 * Input: structure JSON + bonds JSON (array of Bond objects with `image` offsets).
 * Output: JSON `{ sbus, attributions, is_mof }`.
 */
export function detect_mof_sbus(structure_json: string, bonds_json: string): string;

/**
 * Compute diffusion coefficient from MSD using Einstein relation.
 *
 * D = MSD / (2 * dim * t) fitted in the linear regime.
 *
 * Returns array of length 2: `[diffusion_coefficient, r_squared]`
 * where r_squared indicates fit quality (1.0 = perfect linear fit).
 */
export function diffusion_from_msd(msd: Float64Array, times: Float64Array, dim: number, start_fraction: number, end_fraction: number): WasmResult;

/**
 * Compute diffusion coefficient from VACF using Green-Kubo relation.
 *
 * D = (1/dim) * integral_0^inf VACF(t) dt
 */
export function diffusion_from_vacf(vacf: Float64Array, dt: number, dim: number): WasmResult;

/**
 * Apply strain to a cell matrix.
 *
 * Returns the deformed cell: cell_new = cell * (I + strain)
 */
export function elastic_apply_strain(cell: JsMatrix3x3, strain: JsMatrix3x3): JsMatrix3x3;

/**
 * Compute Voigt-Reuss-Hill bulk modulus from 6x6 elastic tensor.
 *
 * tensor: flat array of 36 elements in row-major order
 */
export function elastic_bulk_modulus(tensor: Float64Array): WasmResult;

/**
 * Generate strain matrices for elastic tensor calculation.
 *
 * Returns 6 or 12 strain matrices depending on whether shear strains are included.
 * Each strain type is applied in both positive and negative directions.
 */
export function elastic_generate_strains(magnitude: number, shear: boolean): WasmResult;

/**
 * Check if elastic tensor satisfies mechanical stability (positive definite).
 *
 * tensor: flat array of 36 elements in row-major order
 */
export function elastic_is_stable(tensor: Float64Array): WasmResult;

/**
 * Compute Poisson's ratio from bulk (k) and shear (g) moduli: nu = (3K - 2G) / (6K + 2G).
 */
export function elastic_poisson_ratio(bulk: number, shear: number): number;

/**
 * Compute Voigt-Reuss-Hill shear modulus from 6x6 elastic tensor.
 *
 * tensor: flat array of 36 elements in row-major order
 */
export function elastic_shear_modulus(tensor: Float64Array): WasmResult;

/**
 * Convert 3x3 strain tensor to 6-element Voigt notation [xx, yy, zz, 2*yz, 2*xz, 2*xy].
 */
export function elastic_strain_to_voigt(strain: JsMatrix3x3): Float64Array;

/**
 * Convert 3x3 stress tensor to 6-element Voigt notation [xx, yy, zz, yz, xz, xy].
 */
export function elastic_stress_to_voigt(stress: JsMatrix3x3): Float64Array;

/**
 * Compute 6x6 elastic tensor from stress-strain data using SVD pseudoinverse.
 *
 * Returns flat array of 36 elements in row-major order (compatible with
 * elastic_bulk_modulus, elastic_shear_modulus, elastic_is_stable).
 */
export function elastic_tensor_from_stresses(strains: JsMatrix3x3[], stresses: JsMatrix3x3[]): WasmResult;

/**
 * Compute Young's modulus from bulk (k) and shear (g) moduli: E = 9KG / (3K + G).
 */
export function elastic_youngs_modulus(bulk: number, shear: number): number;

/**
 * Compute Zener anisotropy ratio for cubic crystals: A = 2*C44 / (C11 - C12).
 * A = 1 for isotropic materials.
 */
export function elastic_zener_ratio(c11: number, c12: number, c44: number): number;

/**
 * Find adsorption sites on a surface structure using GASCAP-like algorithm.
 * Returns JSON AdsorptionSiteResult: { sites, n_top, n_bridge, n_hollow }
 */
export function find_adsorption_sites(structure_json: string, options_json?: string | null): string;

/**
 * Find adsorption sites using V7 Alpha Shape algorithm.
 * Handles complex geometries like nanoparticles on supports.
 * Returns JSON AlphaShapeResult.
 */
export function find_adsorption_sites_alpha_shape(structure_json: string, params_json?: string | null): string;

/**
 * Find adsorption sites with debug logging to browser console.
 * Same as find_adsorption_sites but calls find_sites_debug internally.
 */
export function find_adsorption_sites_debug(structure_json: string, options_json?: string | null): string;

/**
 * Generate PBC image atoms for display (VESTA-like boundary completion).
 *
 * Takes a JsCrystal and optional config JSON:
 * ```json
 * {
 *   "range_min": -0.05,
 *   "range_max": 1.05,
 *   "bond_completion": true,
 *   "bond_tolerance": 1.25
 * }
 * ```
 *
 * Returns JsPbcImageResult with parallel arrays of parent indices and positions.
 */
export function find_pbc_image_sites(crystal: JsCrystal, options_json?: string | null): WasmResult;

/**
 * Perform one FIRE optimization step with provided forces.
 */
export function fire_step_with_forces(state: JsFireState, forces: Float64Array): WasmResult;

/**
 * Get a hash of the reduced formula (ignores oxidation states).
 *
 * Useful for grouping compositions by formula.
 */
export function formula_hash(formula: string): WasmResult;

/**
 * Get fractional composition (atomic fractions) as array of {element, amount} objects.
 *
 * Note: Returns element symbols only (e.g., "Fe"), stripping any oxidation states.
 * Use `parse_composition` if you need to preserve species with oxidation states.
 */
export function fractional_composition(formula: string): WasmResult;

/**
 * Generate a slab from a bulk structure using local slab.rs implementation.
 * This is the CatGO-specific slab generation with offset/thickness/vacuum parameters.
 */
export function generate_slab(structure_json: string, h: number, k: number, l: number, offset: number, thickness: number, vacuum: number, growth_mode: string, supercell_a: number, supercell_b: number): WasmResult;

/**
 * Generate a slab with exact layer counting and termination selection.
 */
export function generate_slab_layers(structure_json: string, h: number, k: number, l: number, num_layers: number, termination_index: number, vacuum: number, supercell_a: number, supercell_b: number): WasmResult;

/**
 * Generate multiple slabs with different terminations.
 */
export function generate_slabs(structure: JsCrystal, miller_index: JsMillerIndex, min_slab_size: number, min_vacuum_size: number, center_slab: boolean, in_unit_planes: boolean, primitive: boolean, symprec: number): WasmResult;

/**
 * Get atomic fraction of an element in a composition.
 *
 * Returns the atomic fraction (0.0 to 1.0) or 0.0 if element not present.
 */
export function get_atomic_fraction(formula: string, element: string): WasmResult;

/**
 * Get atomic mass for an element by symbol.
 */
export function get_atomic_mass(symbol: string): WasmResult;

/**
 * Get atomic scattering parameters (Cromer-Mann coefficients).
 *
 * Returns the raw JSON string of scattering parameters for all elements.
 * This is the same data embedded in the WASM module, exposed for users
 * who need programmatic access to the coefficients.
 */
export function get_atomic_scattering_params(): string;

/**
 * Get the conventional cell of a structure.
 */
export function get_conventional(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get coordination number for a specific site.
 */
export function get_coordination_number(structure: JsCrystal, site_index: number, cutoff: number): WasmResult;

/**
 * Get coordination numbers for all sites using cutoff-based method.
 */
export function get_coordination_numbers(structure: JsCrystal, cutoff: number): WasmResult;

/**
 * Get the crystal system of a structure.
 */
export function get_crystal_system(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get the density of the structure in g/cm³.
 */
export function get_density(structure: JsCrystal): WasmResult;

/**
 * Get distance between two sites using minimum image convention.
 */
export function get_distance(structure: JsCrystal, site_idx_1: number, site_idx_2: number): WasmResult;

/**
 * Get the full distance matrix between all sites.
 */
export function get_distance_matrix(structure: JsCrystal): WasmResult;

/**
 * Get electronegativity for an element by symbol.
 */
export function get_electronegativity(symbol: string): WasmResult;

/**
 * Get equivalent site indices (orbits from symmetry analysis).
 */
export function get_equivalent_sites(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get the Hall number for spacegroup identification.
 */
export function get_hall_number(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get the inverse of the lattice matrix.
 */
export function get_lattice_inv_matrix(structure: JsCrystal): WasmResult;

/**
 * Get the metric tensor G = A * A^T of the lattice.
 */
export function get_lattice_metric_tensor(structure: JsCrystal): WasmResult;

/**
 * Get the transformation matrix to LLL-reduced basis.
 */
export function get_lll_mapping(structure: JsCrystal): WasmResult;

/**
 * Get the LLL-reduced lattice matrix.
 */
export function get_lll_reduced_lattice(structure: JsCrystal): WasmResult;

/**
 * Get local environment (neighbors) for a specific site.
 */
export function get_local_environment(structure: JsCrystal, site_index: number, cutoff: number): WasmResult;

/**
 * Get neighbor list for a structure.
 */
export function get_neighbor_list(structure: JsCrystal, cutoff_radius: number, numerical_tol: number, exclude_self: boolean): WasmResult;

/**
 * Get the Pearson symbol (e.g., "cF8" for FCC).
 */
export function get_pearson_symbol(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get the primitive cell of a structure.
 */
export function get_primitive(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get the reciprocal lattice matrix (2π convention).
 */
export function get_reciprocal_lattice(structure: JsCrystal): WasmResult;

/**
 * Get structure with reduced lattice (Niggli or LLL algorithm).
 */
export function get_reduced_structure(structure: JsCrystal, algo: JsReductionAlgo): WasmResult;

/**
 * Get site symmetry symbols for each site.
 */
export function get_site_symmetry_symbols(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get a sorted copy of the structure by electronegativity.
 */
export function get_sorted_by_electronegativity(structure: JsCrystal, reverse: boolean): WasmResult;

/**
 * Get a sorted copy of the structure by atomic number.
 */
export function get_sorted_structure(structure: JsCrystal, reverse: boolean): WasmResult;

/**
 * Get the spacegroup number of a structure.
 */
export function get_spacegroup_number(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get the spacegroup symbol of a structure.
 */
export function get_spacegroup_symbol(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get metadata about a structure (formula, volume, etc.).
 */
export function get_structure_metadata(structure: JsCrystal): WasmResult;

/**
 * Get the full symmetry dataset for a structure.
 */
export function get_symmetry_dataset(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get symmetry operations for the structure.
 */
export function get_symmetry_operations(structure: JsCrystal, symprec: number): WasmResult;

/**
 * Get the total mass of the structure in atomic mass units.
 */
export function get_total_mass(structure: JsCrystal): WasmResult;

/**
 * Get the volume of the unit cell in Angstrom³.
 */
export function get_volume(structure: JsCrystal): WasmResult;

/**
 * Get weight fraction of an element in a composition.
 *
 * Returns the weight fraction (0.0 to 1.0) or 0.0 if element not present.
 */
export function get_wt_fraction(formula: string, element: string): WasmResult;

/**
 * Get Wyckoff letters for each site in the structure.
 */
export function get_wyckoff_letters(structure: JsCrystal, symprec: number): WasmResult;

/**
 * SLAB-mode ZSL lattice-match search between two slabs.
 *
 * Equivalent to `POST /api/heterostructure/search` with `params.mode = "slab"`.
 */
export function hetero_search(substrate: JsCrystal, film: JsCrystal, params: JsHeteroSearchParams): WasmResult;

/**
 * BULK-mode ZSL search: cut surface slabs from two BULK crystals (Miller +
 * layer count + termination) and run the slab-mode ZSL search on them.
 *
 * Equivalent to `POST /api/heterostructure/search` with `params.mode = "bulk"`
 * (pymatgen `CoherentInterfaceBuilder` + `ZSLGenerator`). `substrate_miller`
 * and `film_miller` are 3-element `[h,k,l]` arrays; `*_layers` are slab
 * thicknesses in atomic layers; `*_termination` select the surface
 * termination (0 = first).
 */
export function hetero_search_bulk(substrate: JsCrystal, film: JsCrystal, substrate_miller: Int32Array, film_miller: Int32Array, substrate_layers: number, film_layers: number, substrate_termination: number, film_termination: number, params: JsHeteroSearchParams): WasmResult;

/**
 * Interpolate between two structures.
 */
export function interpolate_structures(start: JsCrystal, end: JsCrystal, n_images: number, interpolate_lattices: boolean, use_pbc: boolean): WasmResult;

/**
 * Check if a composition is charge-balanced.
 *
 * Returns null if any species lacks an oxidation state.
 */
export function is_charge_balanced(formula: string): WasmResult;

/**
 * Check if two sites are periodic images of each other.
 */
export function is_periodic_image(structure: JsCrystal, site_i: number, site_j: number, tolerance: number): WasmResult;

/**
 * Perform one Langevin dynamics step (for use with JS force callback).
 *
 * This version takes forces directly rather than a callback,
 * since JS callbacks across WASM boundary are complex.
 */
export function langevin_step_with_forces(integrator: JsLangevinIntegrator, state: JsMDState, forces: Float64Array): WasmResult;

/**
 * Lateral edge-match search between two 2D slabs.
 *
 * Equivalent to `POST /api/heterostructure/search-lateral`.
 */
export function lateral_search(slab_a: JsCrystal, slab_b: JsCrystal, params: JsLateralSearchParams): WasmResult;

/**
 * Generate a single slab from a bulk structure.
 */
export function make_slab(structure: JsCrystal, miller_index: JsMillerIndex, min_slab_size: number, min_vacuum_size: number, center_slab: boolean, in_unit_planes: boolean, primitive: boolean, symprec: number, termination_index?: number | null): WasmResult;

/**
 * Create a supercell using a 3x3 transformation matrix.
 */
export function make_supercell(structure: JsCrystal, matrix: JsIntMatrix3x3): WasmResult;

/**
 * Create a diagonal supercell (nx × ny × nz).
 */
export function make_supercell_diag(structure: JsCrystal, scale_a: number, scale_b: number, scale_c: number): WasmResult;

/**
 * Complete the velocity Verlet step after computing new forces.
 */
export function md_velocity_verlet_finalize(state: JsMDState, new_forces: Float64Array, dt_fs: number): WasmResult;

/**
 * Perform one velocity Verlet MD step (half-step velocity update + full position update).
 *
 * This function updates positions and velocities in-place. The caller must:
 * 1. Call this function with current forces
 * 2. Compute new forces at the updated positions
 * 3. Call `md_velocity_verlet_finish` with new forces to complete the velocity update
 *
 * forces: flat array of current forces [Fx0, Fy0, Fz0, ...] in eV/Angstrom
 * dt_fs: timestep in femtoseconds (must be finite and positive)
 */
export function md_velocity_verlet_step(state: JsMDState, forces: Float64Array, dt_fs: number): WasmResult;

/**
 * Convert Miller index to normal vector using local slab.rs implementation.
 */
export function miller_to_normal(structure_json: string, h: number, k: number, l: number): string;

/**
 * Search for commensurate Moiré twist angles.
 *
 * `request_json` is a JSON string matching the `/api/moire/search` request body
 * `{ layer_a, layer_b, params }`. Returns `WasmResult<String>` whose `ok`
 * field is a JSON string matching `MoireAngleSearchResult`.
 */
export function moire_search(request_json: string): WasmResult;

/**
 * Convert a pymatgen Molecule JSON to ASE Atoms dict format.
 */
export function molecule_to_ase(molecule_json: string): WasmResult;

/**
 * Convert a molecule to XYZ format string.
 */
export function molecule_to_xyz_str(json: string, comment?: string | null): WasmResult;

/**
 * Compute nanotube geometry information without building the structure.
 */
export function nanotube_info(layer: JsNanotubeLayer, n: number, m: number, nl: number): WasmResult;

/**
 * Perform one Nose-Hoover chain step with provided forces.
 */
export function nose_hoover_step_with_forces(thermostat: JsNoseHooverChain, state: JsMDState, forces: Float64Array): WasmResult;

/**
 * Perform one NPT step with provided forces and stress.
 */
export function npt_step_with_forces_and_stress(integrator: JsNPTIntegrator, state: JsNPTState, forces: Float64Array, stress: Float64Array): WasmResult;

/**
 * Optimize a structure using the full UFF force field (uff-relax crate).
 *
 * Takes a pymatgen-format JSON structure and optional JSON config:
 * ```json
 * {
 *   "max_steps": 200,     // FIRE iterations (default: 200)
 *   "fmax": 0.5,          // force threshold kcal/mol/A (default: 0.5)
 *   "cutoff": 6.0,        // non-bonded cutoff A (default: 6.0)
 *   "bond_tolerance": 0.45 // covalent radii tolerance (default: 0.45)
 * }
 * ```
 *
 * Returns JSON with optimized structure and metadata:
 * ```json
 * {
 *   "structure": { ... },
 *   "converged": true,
 *   "final_energy": -123.4,
 *   "final_fmax": 0.05,
 *   "energy_terms": { "bond": ..., "angle": ..., "torsion": ..., "non_bonded": ..., "total": ... },
 *   "iterations": 200
 * }
 * ```
 */
export function optimize_structure_uff(structure_json: string, options_json?: string | null): WasmResult;

/**
 * Optimize a structure using VSEPR geometry theory (vsepr-rs crate).
 *
 * VSEPR is a fast pre-optimizer that arranges atoms into chemically sensible
 * geometries based on Valence Shell Electron Pair Repulsion theory. Best for
 * small molecules, especially when starting from overlapping or random coordinates.
 *
 * Takes a pymatgen-format JSON structure and optional JSON config:
 * ```json
 * {
 *   "iterations": 1500,      // optimization steps (default: 1500)
 *   "force_constant": 0.15,  // movement scaling (default: 0.15)
 *   "bond_tolerance": 0.45   // covalent radii tolerance (default: 0.45)
 * }
 * ```
 *
 * Returns JSON with optimized structure:
 * ```json
 * {
 *   "structure": { ... }
 * }
 * ```
 */
export function optimize_structure_vsepr(structure_json: string, options_json?: string | null): WasmResult;

/**
 * Parse ASE Atoms dict and determine if it's a Structure or Molecule.
 *
 * Returns { type: "Structure" | "Molecule", data: pymatgen_json_string }.
 */
export function parse_ase_atoms(ase_atoms: JsAseAtoms): WasmResult;

/**
 * Parse a structure from CIF format string.
 */
export function parse_cif(content: string): WasmResult;

/**
 * Parse a chemical formula and return composition information.
 *
 * Returns an object with:
 * - species: object mapping element/species symbols to amounts
 * - formula: the input formula normalized
 * - reducedFormula: reduced formula string
 * - formulaAnonymous: anonymous formula (e.g., "A2B3")
 * - formulaHill: Hill notation formula
 * - alphabeticalFormula: alphabetically sorted formula
 * - chemicalSystem: element system (e.g., "Fe-O")
 * - numAtoms: total number of atoms
 * - numElements: number of distinct elements
 * - weight: molecular weight in atomic mass units
 * - isElement: true if composition is a single element
 * - averageElectronegativity: average electronegativity (or null)
 * - totalElectrons: total number of electrons
 */
export function parse_composition(formula: string): WasmResult;

/**
 * Parse a molecule from pymatgen Molecule JSON string.
 *
 * Returns the parsed molecule JSON string in pymatgen-compatible format.
 */
export function parse_molecule_json(json: string): WasmResult;

/**
 * Parse a structure from POSCAR format string.
 */
export function parse_poscar(content: string): WasmResult;

/**
 * Parse a molecule from XYZ format string.
 *
 * Returns the molecule JSON string in pymatgen Molecule.as_dict() format.
 */
export function parse_xyz_str(content: string): WasmResult;

/**
 * Add pseudo-hydrogen atoms to passivate slab surface dangling bonds.
 *
 * Faithful client-side port of the Python `/api/pseudo-hydrogen/passivate`
 * endpoint. Takes a slab and a bulk reference structure plus a params JSON
 * object (all fields optional; see `PseudoHydrogenParams` in
 * `src/lib/api/pseudo-hydrogen.ts`).
 *
 * Returns a JSON string matching `PseudoHydrogenResult`:
 * `{ structure, n_pseudo_h, bulk_coordination, valence_used, pseudo_h_list,
 *    unique_potcars, bond_warnings, message }`.
 */
export function passivate_slab(slab: JsCrystal, bulk: JsCrystal, params_json: string): WasmResult;

/**
 * Perturb all sites by random vectors.
 */
export function perturb_structure(structure: JsCrystal, distance: number, min_distance?: number | null, seed?: bigint | null): WasmResult;

/**
 * Get reduced composition as array of {element, amount} objects.
 *
 * Note: Returns element symbols only (e.g., "Fe"), stripping any oxidation states.
 * Use `parse_composition` if you need to preserve species with oxidation states.
 */
export function reduced_composition(formula: string): WasmResult;

/**
 * Remove sites at specific indices.
 */
export function remove_sites(structure: JsCrystal, indices: Uint32Array): WasmResult;

/**
 * Remove all sites containing any of the specified species.
 */
export function remove_species(structure: JsCrystal, species: string[]): WasmResult;

/**
 * Reorient the lattice so that a1 is along x-axis and a3 is in the xz-plane.
 * Uses Rodrigues' rotation (same algorithm as ASE).
 * Fractional coordinates are preserved; only wrapping to [0,1) is applied.
 */
export function reorient_lattice(structure: JsCrystal): WasmResult;

/**
 * Replace cap (Ligand) SBUs with a new molecular fragment.
 * Input: structure JSON, bonds JSON, clusters JSON, fragment JSON.
 * fragment JSON: { "elements": ["C","H","H"], "cart_coords": [[0,0,0],[1,0,0],[0,1,0]], "bonding_atom_idx": 0 }
 * Output: pymatgen-compatible JSON structure with caps replaced.
 */
export function replace_mof_caps(structure_json: string, bonds_json: string, clusters_json: string, fragment_json: string): string;

/**
 * Get termination info for a given Miller index.
 * Returns JSON: [{"height": f64, "elements": ["Ti", "O"]}, ...]
 */
export function slab_termination_info(structure_json: string, h: number, k: number, l: number): string;

/**
 * Get a hash of the composition including oxidation states.
 *
 * Useful for exact matching of compositions.
 */
export function species_hash(formula: string): WasmResult;

/**
 * Convert a pymatgen Structure to ASE Atoms dict format.
 */
export function structure_to_ase(structure: JsCrystal): WasmResult;

/**
 * Convert structure to CIF format string.
 */
export function structure_to_cif(structure: JsCrystal): WasmResult;

/**
 * Serialize structure to pymatgen-compatible JSON string.
 */
export function structure_to_json(structure: JsCrystal): WasmResult;

/**
 * Convert structure to POSCAR format string.
 */
export function structure_to_poscar(structure: JsCrystal): WasmResult;

/**
 * Substitute one species with another throughout the structure.
 */
export function substitute_species(structure: JsCrystal, old_species: string, new_species: string): WasmResult;

/**
 * Calculate surface area of a slab.
 */
export function surface_area(slab: JsCrystal): WasmResult;

/**
 * Calculate surface energy from slab and bulk energies.
 */
export function surface_calculate_energy(slab_energy: number, bulk_energy_per_atom: number, n_atoms: number, surface_area: number): number;

/**
 * Compute Wulff shape from surface energies.
 *
 * surface_energies_json: JSON array of [[h,k,l], energy] pairs.
 * Returns JSON object with facets, total_surface_area, volume, sphericity.
 */
export function surface_compute_wulff(structure: JsCrystal, surface_energies_json: string): WasmResult;

/**
 * Enumerate all unique Miller indices up to a maximum index value.
 *
 * Returns JSON array of [h, k, l] arrays.
 */
export function surface_enumerate_miller(max_index: number): WasmResult;

/**
 * Enumerate all unique surface terminations for a Miller index.
 *
 * Returns JSON array of termination objects with miller_index, shift,
 * surface_species, surface_density, is_polar, and slab structure.
 */
export function surface_enumerate_terminations(structure: JsCrystal, h: number, k: number, l: number, min_slab: number, min_vacuum: number, symprec: number): WasmResult;

/**
 * Find adsorption sites on a slab surface.
 *
 * Returns JSON array of adsorption site objects.
 */
export function surface_find_adsorption_sites(slab: JsCrystal, height: number, site_types_json: string, neighbor_cutoff?: number | null, surface_tolerance?: number | null): WasmResult;

/**
 * Get surface atoms in a slab structure.
 *
 * Returns JSON array of site indices.
 */
export function surface_get_surface_atoms(slab: JsCrystal, tolerance: number): WasmResult;

/**
 * Get the normal vector for a Miller plane.
 *
 * Returns JSON array [x, y, z] of the unit normal.
 */
export function surface_miller_to_normal(structure: JsCrystal, h: number, k: number, l: number): WasmResult;

/**
 * Translate specific sites by a vector.
 */
export function translate_sites(structure: JsCrystal, indices: Uint32Array, vector: JsVector3, fractional: boolean): WasmResult;

/**
 * Perform one velocity rescale step with provided forces.
 */
export function velocity_rescale_step_with_forces(thermostat: JsVelocityRescale, state: JsMDState, forces: Float64Array): WasmResult;

/**
 * Initialize WASM module — installs panic hook so panics produce
 * readable error messages instead of just "unreachable".
 */
export function wasm_init(): void;

/**
 * Wrap all fractional coordinates to [0, 1).
 */
export function wrap_to_unit_cell(structure: JsCrystal): WasmResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_bondtable_free: (a: number, b: number) => void;
    readonly __wbg_jscellfirestate_free: (a: number, b: number) => void;
    readonly __wbg_jselement_free: (a: number, b: number) => void;
    readonly __wbg_jsfireconfig_free: (a: number, b: number) => void;
    readonly __wbg_jsfirestate_free: (a: number, b: number) => void;
    readonly __wbg_jslangevinintegrator_free: (a: number, b: number) => void;
    readonly __wbg_jsmdstate_free: (a: number, b: number) => void;
    readonly __wbg_jsmsdcalculator_free: (a: number, b: number) => void;
    readonly __wbg_jsnosehooverchain_free: (a: number, b: number) => void;
    readonly __wbg_jsnptintegrator_free: (a: number, b: number) => void;
    readonly __wbg_jsnptstate_free: (a: number, b: number) => void;
    readonly __wbg_jsspecies_free: (a: number, b: number) => void;
    readonly __wbg_jsvacfcalculator_free: (a: number, b: number) => void;
    readonly __wbg_jsvelocityrescale_free: (a: number, b: number) => void;
    readonly __wbg_wasmstructurematcher_free: (a: number, b: number) => void;
    readonly __wbg_wasmtrajectorybondsession_free: (a: number, b: number) => void;
    readonly adsorbate_find_sites: (a: any, b: number, c: number) => any;
    readonly apply_inversion: (a: any, b: number) => any;
    readonly apply_operation: (a: any, b: any, c: any, d: number) => any;
    readonly ase_to_pymatgen: (a: any) => any;
    readonly bondtable_count: (a: number) => number;
    readonly bondtable_images: (a: number) => [number, number];
    readonly bondtable_lengths: (a: number) => [number, number];
    readonly bondtable_pairs: (a: number) => [number, number];
    readonly bondtable_strengths: (a: number) => [number, number];
    readonly build_nanotube: (a: any, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly cell_delaunay_reduce: (a: any, b: number) => any;
    readonly cell_find_supercell_matrix: (a: any, b: number) => any;
    readonly cell_fire_step_with_forces_and_stress: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly cell_is_niggli_reduced: (a: any, b: number) => any;
    readonly cell_is_supercell: (a: any, b: any, c: number) => any;
    readonly cell_lattices_equivalent: (a: any, b: any, c: number) => any;
    readonly cell_minimum_image_distance: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly cell_minimum_image_vector: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly cell_niggli_reduce: (a: any, b: number) => any;
    readonly cell_perpendicular_distances: (a: any) => any;
    readonly cell_wrap_to_unit_cell: (a: any) => any;
    readonly classify_all_atoms: (a: any, b: number, c: number) => any;
    readonly classify_local_structure: (a: number, b: number, c: number) => [number, number];
    readonly composition_charge: (a: number, b: number) => any;
    readonly compositions_almost_equal: (a: number, b: number, c: number, d: number) => any;
    readonly compute_d_spacing: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly compute_harmonic_bonds: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly compute_lennard_jones: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => any;
    readonly compute_lennard_jones_forces: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => any;
    readonly compute_morse: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => any;
    readonly compute_rac_descriptors: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly compute_soft_sphere: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => any;
    readonly compute_steinhardt_q: (a: any, b: number, c: number) => any;
    readonly compute_wl_hashes: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly compute_xrd: (a: any, b: number) => any;
    readonly copy_structure: (a: any, b: number) => any;
    readonly create_trajectory_bond_session: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly crystal_nn: (a: any, b: number, c: number, d: number) => any;
    readonly crystal_nn_all: (a: any, b: number, c: number) => any;
    readonly defect_classify_site: (a: number) => [number, number];
    readonly defect_create_antisite: (a: any, b: number, c: number) => any;
    readonly defect_create_dimer: (a: any, b: number, c: number, d: number) => any;
    readonly defect_create_interstitial: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly defect_create_substitution: (a: any, b: number, c: number, d: number) => any;
    readonly defect_create_vacancy: (a: any, b: number) => any;
    readonly defect_distort_bonds: (a: any, b: number, c: number, d: number, e: number, f: number) => any;
    readonly defect_find_interstitial_sites: (a: any, b: number, c: number) => any;
    readonly defect_find_supercell: (a: any, b: number, c: number, d: number) => any;
    readonly defect_generate_all: (a: any, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => any;
    readonly defect_generate_name: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly defect_get_wyckoff_labels: (a: any, b: number) => any;
    readonly defect_guess_charge_states: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
    readonly defect_local_rattle: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly defect_rattle: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly detect_bonds_electronegativity: (a: number, b: number, c: number, d: number) => [number, number];
    readonly detect_bonds_radii: (a: number, b: number, c: number, d: number) => [number, number];
    readonly detect_bonds_radii_typed: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly detect_bonds_solid_angle: (a: number, b: number, c: number, d: number) => [number, number];
    readonly detect_hydrogen_bonds: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly detect_layers: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly detect_layers_miller: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly detect_mof_sbus: (a: number, b: number, c: number, d: number) => [number, number];
    readonly diffusion_from_msd: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly diffusion_from_vacf: (a: number, b: number, c: number, d: number) => any;
    readonly elastic_apply_strain: (a: any, b: any) => any;
    readonly elastic_bulk_modulus: (a: number, b: number) => any;
    readonly elastic_generate_strains: (a: number, b: number) => any;
    readonly elastic_is_stable: (a: number, b: number) => any;
    readonly elastic_poisson_ratio: (a: number, b: number) => number;
    readonly elastic_shear_modulus: (a: number, b: number) => any;
    readonly elastic_strain_to_voigt: (a: any) => [number, number];
    readonly elastic_stress_to_voigt: (a: any) => [number, number];
    readonly elastic_tensor_from_stresses: (a: number, b: number, c: number, d: number) => any;
    readonly elastic_youngs_modulus: (a: number, b: number) => number;
    readonly elastic_zener_ratio: (a: number, b: number, c: number) => number;
    readonly find_adsorption_sites: (a: number, b: number, c: number, d: number) => [number, number];
    readonly find_adsorption_sites_alpha_shape: (a: number, b: number, c: number, d: number) => [number, number];
    readonly find_adsorption_sites_debug: (a: number, b: number, c: number, d: number) => [number, number];
    readonly find_pbc_image_sites: (a: any, b: number, c: number) => any;
    readonly fire_step_with_forces: (a: number, b: number, c: number) => any;
    readonly formula_hash: (a: number, b: number) => any;
    readonly fractional_composition: (a: number, b: number) => any;
    readonly generate_slab: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => any;
    readonly generate_slab_layers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly generate_slabs: (a: any, b: any, c: number, d: number, e: number, f: number, g: number, h: number) => any;
    readonly get_atomic_fraction: (a: number, b: number, c: number, d: number) => any;
    readonly get_atomic_mass: (a: number, b: number) => any;
    readonly get_atomic_scattering_params: () => [number, number];
    readonly get_conventional: (a: any, b: number) => any;
    readonly get_coordination_number: (a: any, b: number, c: number) => any;
    readonly get_coordination_numbers: (a: any, b: number) => any;
    readonly get_crystal_system: (a: any, b: number) => any;
    readonly get_density: (a: any) => any;
    readonly get_distance: (a: any, b: number, c: number) => any;
    readonly get_distance_matrix: (a: any) => any;
    readonly get_electronegativity: (a: number, b: number) => any;
    readonly get_equivalent_sites: (a: any, b: number) => any;
    readonly get_hall_number: (a: any, b: number) => any;
    readonly get_lattice_inv_matrix: (a: any) => any;
    readonly get_lattice_metric_tensor: (a: any) => any;
    readonly get_lll_mapping: (a: any) => any;
    readonly get_lll_reduced_lattice: (a: any) => any;
    readonly get_local_environment: (a: any, b: number, c: number) => any;
    readonly get_neighbor_list: (a: any, b: number, c: number, d: number) => any;
    readonly get_pearson_symbol: (a: any, b: number) => any;
    readonly get_primitive: (a: any, b: number) => any;
    readonly get_reciprocal_lattice: (a: any) => any;
    readonly get_reduced_structure: (a: any, b: any) => any;
    readonly get_site_symmetry_symbols: (a: any, b: number) => any;
    readonly get_sorted_by_electronegativity: (a: any, b: number) => any;
    readonly get_sorted_structure: (a: any, b: number) => any;
    readonly get_spacegroup_number: (a: any, b: number) => any;
    readonly get_spacegroup_symbol: (a: any, b: number) => any;
    readonly get_structure_metadata: (a: any) => any;
    readonly get_symmetry_dataset: (a: any, b: number) => any;
    readonly get_symmetry_operations: (a: any, b: number) => any;
    readonly get_total_mass: (a: any) => any;
    readonly get_volume: (a: any) => any;
    readonly get_wt_fraction: (a: number, b: number, c: number, d: number) => any;
    readonly get_wyckoff_letters: (a: any, b: number) => any;
    readonly interpolate_structures: (a: any, b: any, c: number, d: number, e: number) => any;
    readonly is_charge_balanced: (a: number, b: number) => any;
    readonly is_periodic_image: (a: any, b: number, c: number, d: number) => any;
    readonly jscellfirestate_cell: (a: number) => [number, number];
    readonly jscellfirestate_is_converged: (a: number, b: number, c: number) => [number, number, number];
    readonly jscellfirestate_max_force: (a: number) => number;
    readonly jscellfirestate_max_stress: (a: number) => number;
    readonly jscellfirestate_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly jscellfirestate_num_atoms: (a: number) => number;
    readonly jscellfirestate_positions: (a: number) => [number, number];
    readonly jselement_atomic_mass: (a: number) => number;
    readonly jselement_atomic_number: (a: number) => number;
    readonly jselement_atomic_radius: (a: number) => number;
    readonly jselement_block: (a: number) => [number, number];
    readonly jselement_boiling_point: (a: number) => number;
    readonly jselement_common_oxidation_states: (a: number) => [number, number];
    readonly jselement_covalent_radius: (a: number) => number;
    readonly jselement_density: (a: number) => number;
    readonly jselement_electron_affinity: (a: number) => number;
    readonly jselement_electron_configuration: (a: number) => [number, number];
    readonly jselement_electron_configuration_semantic: (a: number) => [number, number];
    readonly jselement_electronegativity: (a: number) => number;
    readonly jselement_first_ionization_energy: (a: number) => number;
    readonly jselement_from_atomic_number: (a: number) => [number, number, number];
    readonly jselement_group: (a: number) => number;
    readonly jselement_icsd_oxidation_states: (a: number) => [number, number];
    readonly jselement_ionic_radii: (a: number) => [number, number];
    readonly jselement_ionic_radius: (a: number, b: number) => number;
    readonly jselement_ionization_energies: (a: number) => [number, number];
    readonly jselement_is_actinoid: (a: number) => number;
    readonly jselement_is_alkali: (a: number) => number;
    readonly jselement_is_alkaline: (a: number) => number;
    readonly jselement_is_chalcogen: (a: number) => number;
    readonly jselement_is_halogen: (a: number) => number;
    readonly jselement_is_lanthanoid: (a: number) => number;
    readonly jselement_is_metal: (a: number) => number;
    readonly jselement_is_metalloid: (a: number) => number;
    readonly jselement_is_noble_gas: (a: number) => number;
    readonly jselement_is_post_transition_metal: (a: number) => number;
    readonly jselement_is_pseudo: (a: number) => number;
    readonly jselement_is_radioactive: (a: number) => number;
    readonly jselement_is_rare_earth: (a: number) => number;
    readonly jselement_is_transition_metal: (a: number) => number;
    readonly jselement_max_oxidation_state: (a: number) => number;
    readonly jselement_melting_point: (a: number) => number;
    readonly jselement_min_oxidation_state: (a: number) => number;
    readonly jselement_molar_heat: (a: number) => number;
    readonly jselement_n_valence: (a: number) => number;
    readonly jselement_name: (a: number) => [number, number];
    readonly jselement_new: (a: number, b: number) => [number, number, number];
    readonly jselement_oxidation_states: (a: number) => [number, number];
    readonly jselement_row: (a: number) => number;
    readonly jselement_shannon_ionic_radius: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly jselement_shannon_radii: (a: number) => [number, number];
    readonly jselement_specific_heat: (a: number) => number;
    readonly jselement_symbol: (a: number) => [number, number];
    readonly jsfireconfig_new: () => number;
    readonly jsfireconfig_set_dt_max: (a: number, b: number) => void;
    readonly jsfireconfig_set_dt_start: (a: number, b: number) => void;
    readonly jsfireconfig_set_max_step: (a: number, b: number) => void;
    readonly jsfireconfig_set_n_min: (a: number, b: number) => void;
    readonly jsfirestate_dt: (a: number) => number;
    readonly jsfirestate_is_converged: (a: number, b: number) => number;
    readonly jsfirestate_max_force: (a: number) => number;
    readonly jsfirestate_new: (a: number, b: number, c: number) => [number, number, number];
    readonly jsfirestate_num_atoms: (a: number) => number;
    readonly jsfirestate_positions: (a: number) => [number, number];
    readonly jslangevinintegrator_new: (a: number, b: number, c: number, d: number, e: bigint) => [number, number, number];
    readonly jslangevinintegrator_set_dt: (a: number, b: number) => void;
    readonly jslangevinintegrator_set_friction: (a: number, b: number) => void;
    readonly jslangevinintegrator_set_temperature: (a: number, b: number) => void;
    readonly jsmdstate_forces: (a: number) => [number, number];
    readonly jsmdstate_init_velocities: (a: number, b: number, c: number, d: bigint) => void;
    readonly jsmdstate_kinetic_energy: (a: number) => number;
    readonly jsmdstate_masses: (a: number) => [number, number];
    readonly jsmdstate_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly jsmdstate_num_atoms: (a: number) => number;
    readonly jsmdstate_positions: (a: number) => [number, number];
    readonly jsmdstate_set_cell: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly jsmdstate_set_forces: (a: number, b: number, c: number) => void;
    readonly jsmdstate_set_positions: (a: number, b: number, c: number) => void;
    readonly jsmdstate_set_velocities: (a: number, b: number, c: number) => void;
    readonly jsmdstate_temperature: (a: number) => number;
    readonly jsmdstate_velocities: (a: number) => [number, number];
    readonly jsmsdcalculator_add_frame: (a: number, b: number, c: number) => any;
    readonly jsmsdcalculator_compute_msd: (a: number) => [number, number];
    readonly jsmsdcalculator_compute_msd_per_atom: (a: number) => [number, number];
    readonly jsmsdcalculator_max_lag: (a: number) => number;
    readonly jsmsdcalculator_n_atoms: (a: number) => number;
    readonly jsmsdcalculator_new: (a: number, b: number, c: number) => [number, number, number];
    readonly jsnosehooverchain_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly jsnosehooverchain_set_temperature: (a: number, b: number) => void;
    readonly jsnptintegrator_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly jsnptintegrator_pressure: (a: number, b: number, c: number) => any;
    readonly jsnptstate_cell: (a: number) => [number, number];
    readonly jsnptstate_kinetic_energy: (a: number) => number;
    readonly jsnptstate_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly jsnptstate_num_atoms: (a: number) => number;
    readonly jsnptstate_positions: (a: number) => [number, number];
    readonly jsnptstate_temperature: (a: number) => number;
    readonly jsnptstate_velocities: (a: number) => [number, number];
    readonly jsnptstate_volume: (a: number) => number;
    readonly jsspecies_atomic_number: (a: number) => number;
    readonly jsspecies_atomic_radius: (a: number) => number;
    readonly jsspecies_covalent_radius: (a: number) => number;
    readonly jsspecies_electronegativity: (a: number) => number;
    readonly jsspecies_ionic_radius: (a: number) => number;
    readonly jsspecies_name: (a: number) => [number, number];
    readonly jsspecies_new: (a: number, b: number) => [number, number, number];
    readonly jsspecies_oxidation_state: (a: number) => number;
    readonly jsspecies_shannon_ionic_radius: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly jsspecies_symbol: (a: number) => [number, number];
    readonly jsspecies_to_string: (a: number) => [number, number];
    readonly jsvacfcalculator_add_frame: (a: number, b: number, c: number) => any;
    readonly jsvacfcalculator_compute_normalized_vacf: (a: number) => [number, number];
    readonly jsvacfcalculator_compute_vacf: (a: number) => [number, number];
    readonly jsvacfcalculator_new: (a: number, b: number, c: number) => [number, number, number];
    readonly jsvelocityrescale_new: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number, number];
    readonly jsvelocityrescale_set_temperature: (a: number, b: number) => void;
    readonly langevin_step_with_forces: (a: number, b: number, c: number, d: number) => any;
    readonly make_slab: (a: any, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
    readonly make_supercell: (a: any, b: any) => any;
    readonly make_supercell_diag: (a: any, b: number, c: number, d: number) => any;
    readonly md_velocity_verlet_finalize: (a: number, b: number, c: number, d: number) => any;
    readonly md_velocity_verlet_step: (a: number, b: number, c: number, d: number) => any;
    readonly miller_to_normal: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly molecule_to_ase: (a: number, b: number) => any;
    readonly molecule_to_xyz_str: (a: number, b: number, c: number, d: number) => any;
    readonly nanotube_info: (a: any, b: number, c: number, d: number) => any;
    readonly nose_hoover_step_with_forces: (a: number, b: number, c: number, d: number) => any;
    readonly npt_step_with_forces_and_stress: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly optimize_structure_uff: (a: number, b: number, c: number, d: number) => any;
    readonly optimize_structure_vsepr: (a: number, b: number, c: number, d: number) => any;
    readonly parse_ase_atoms: (a: any) => any;
    readonly parse_cif: (a: number, b: number) => any;
    readonly parse_composition: (a: number, b: number) => any;
    readonly parse_molecule_json: (a: number, b: number) => any;
    readonly parse_poscar: (a: number, b: number) => any;
    readonly parse_xyz_str: (a: number, b: number) => any;
    readonly passivate_slab: (a: any, b: any, c: number, d: number) => any;
    readonly perturb_structure: (a: any, b: number, c: number, d: number, e: number, f: bigint) => any;
    readonly reduced_composition: (a: number, b: number) => any;
    readonly remove_sites: (a: any, b: number, c: number) => any;
    readonly remove_species: (a: any, b: number, c: number) => any;
    readonly reorient_lattice: (a: any) => any;
    readonly replace_mof_caps: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly slab_termination_info: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly species_hash: (a: number, b: number) => any;
    readonly structure_to_ase: (a: any) => any;
    readonly structure_to_cif: (a: any) => any;
    readonly structure_to_json: (a: any) => any;
    readonly structure_to_poscar: (a: any) => any;
    readonly substitute_species: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly surface_area: (a: any) => any;
    readonly surface_calculate_energy: (a: number, b: number, c: number, d: number) => number;
    readonly surface_compute_wulff: (a: any, b: number, c: number) => any;
    readonly surface_enumerate_miller: (a: number) => any;
    readonly surface_enumerate_terminations: (a: any, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly surface_find_adsorption_sites: (a: any, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => any;
    readonly surface_get_surface_atoms: (a: any, b: number) => any;
    readonly surface_miller_to_normal: (a: any, b: number, c: number, d: number) => any;
    readonly translate_sites: (a: any, b: number, c: number, d: any, e: number) => any;
    readonly velocity_rescale_step_with_forces: (a: number, b: number, c: number, d: number) => any;
    readonly wasmstructurematcher_deduplicate: (a: number, b: number, c: number) => any;
    readonly wasmstructurematcher_find_matches: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly wasmstructurematcher_fit: (a: number, b: any, c: any) => any;
    readonly wasmstructurematcher_fit_anonymous: (a: number, b: any, c: any) => any;
    readonly wasmstructurematcher_get_rms_dist: (a: number, b: any, c: any) => any;
    readonly wasmstructurematcher_get_structure_distance: (a: number, b: any, c: any) => any;
    readonly wasmstructurematcher_new: () => number;
    readonly wasmstructurematcher_with_angle_tol: (a: number, b: number) => number;
    readonly wasmstructurematcher_with_element_comparator: (a: number, b: number) => number;
    readonly wasmstructurematcher_with_latt_len_tol: (a: number, b: number) => number;
    readonly wasmstructurematcher_with_primitive_cell: (a: number, b: number) => number;
    readonly wasmstructurematcher_with_scale: (a: number, b: number) => number;
    readonly wasmstructurematcher_with_site_pos_tol: (a: number, b: number) => number;
    readonly wasmtrajectorybondsession_compute_frame: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmtrajectorybondsession_diagnostics_json: (a: number) => [number, number];
    readonly wrap_to_unit_cell: (a: any) => any;
    readonly wasm_init: () => void;
    readonly jsvacfcalculator_max_lag: (a: number) => number;
    readonly jsvacfcalculator_n_atoms: (a: number) => number;
    readonly build_hetero: (a: any, b: any, c: number, d: number, e: number, f: number, g: any) => any;
    readonly build_hetero_bulk: (a: any, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: any) => any;
    readonly build_hetero_grid_scan: (a: any, b: any, c: number, d: number, e: number, f: number) => any;
    readonly build_hetero_manual: (a: any, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly build_hetero_registry: (a: any, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: any) => any;
    readonly build_lateral: (a: any, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly build_nanoscroll: (a: any, b: number, c: number) => any;
    readonly hetero_search: (a: any, b: any, c: any) => any;
    readonly hetero_search_bulk: (a: any, b: any, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: any) => any;
    readonly lateral_search: (a: any, b: any, c: any) => any;
    readonly __wbg_wasmcubemesh_free: (a: number, b: number) => void;
    readonly __wbg_wasmcubevolume_free: (a: number, b: number) => void;
    readonly build_moire: (a: number, b: number) => any;
    readonly cube_backend: () => [number, number];
    readonly moire_search: (a: number, b: number) => any;
    readonly wasmcubemesh_take_indices: (a: number) => [number, number];
    readonly wasmcubemesh_take_normals: (a: number) => [number, number];
    readonly wasmcubemesh_take_positions: (a: number) => [number, number];
    readonly wasmcubemesh_triangle_count: (a: number) => number;
    readonly wasmcubemesh_vertex_count: (a: number) => number;
    readonly wasmcubevolume_copy_data: (a: number) => [number, number];
    readonly wasmcubevolume_extract: (a: number, b: number) => [number, number, number];
    readonly wasmcubevolume_from_grid: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly wasmcubevolume_header_json: (a: number) => [number, number, number, number];
    readonly wasmcubevolume_parse: (a: number, b: number) => [number, number, number];
    readonly wasmcubevolume_value_max: (a: number) => number;
    readonly wasmcubevolume_value_min: (a: number) => number;
    readonly wasmcubevolume_voxel_count: (a: number) => number;
    readonly wasmcubevolume_copy_grid_data: (a: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
