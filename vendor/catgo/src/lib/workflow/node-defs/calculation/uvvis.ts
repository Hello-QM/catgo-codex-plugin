import type { NodeDefinition } from '../../workflow-types'

export const UVVIS_NODE: NodeDefinition = {
  type: `uvvis`,
  label: `UV-Vis`,
  color: `#6366f1`,
  icon: `🌈`,
  category: `Calculation`,
  description: `Electronic absorption spectroscopy via TD-DFT or STEOM-DLPNO-CCSD`,
  inputs: [`structure`],
  outputs: [`spectrum`],
  default_params: {
    system_type: `molecular`,
    software: `orca`,
    method: `CAM-B3LYP`,
    basis: `def2-TZVP`,
    calc_type: `tddft`,
    nroots: 10,
    triplets: false,
    tda: true,
    solvation: `none`,
    solvent: `water`,
    charge: 0,
    multiplicity: 1,
  },
  help_text: `**UV-Vis Spectroscopy** — Compute electronic absorption spectrum.

Supports two calculation types:
- **TD-DFT** — Time-dependent density functional theory for excited states (faster)
- **STEOM-DLPNO-CCSD** — Simplified CCSD for absorption (more accurate but slower)

Optional implicit solvation via CPCM.`,
  param_schema: [
    {
      key: `system_type`,
      label: `System Type`,
      type: `select`,
      default: `molecular`,
      group: `Software`,
      options: [{ label: `Molecular (molecule/cluster)`, value: `molecular` }],
      help: `UV-Vis requires molecular systems.`,
    },
    {
      key: `software`,
      label: `Software`,
      type: `select`,
      default: `orca`,
      group: `Software`,
      options: [{ label: `ORCA`, value: `orca` }],
    },
    // ── Calculation type ──
    {
      key: `calc_type`,
      label: `Calculation Type`,
      type: `select`,
      default: `tddft`,
      group: `Method`,
      options: [
        { label: `TD-DFT`, value: `tddft` },
        { label: `STEOM-DLPNO-CCSD`, value: `steom` },
      ],
      help: `TD-DFT: Time-dependent DFT (standard). STEOM: Simplified CCSD (more accurate).`,
    },
    // ── TD-DFT method (show only for tddft) ──
    {
      key: `method`,
      label: `Method`,
      type: `select`,
      default: `CAM-B3LYP`,
      group: `Quantum`,
      options: [
        { label: `CAM-B3LYP`, value: `CAM-B3LYP` },
        { label: `B3LYP`, value: `B3LYP` },
        { label: `PBE0`, value: `PBE0` },
      ],
      help: `Functional for TD-DFT. CAM-B3LYP is optimized for excitations.`,
      show_if: { key: `calc_type`, values: [`tddft`] },
    },
    // ── Basis set ──
    {
      key: `basis`,
      label: `Basis Set`,
      type: `select`,
      default: `def2-TZVP`,
      group: `Quantum`,
      options: [
        { label: `(none — composite method)`, value: `` },
        { label: `def2-SVP`, value: `def2-SVP` },
        { label: `def2-TZVP`, value: `def2-TZVP` },
        { label: `cc-pVDZ`, value: `cc-pVDZ` },
      ],
      help: `Basis set. def2-TZVP recommended for spectroscopy.`,
    },
    // ── Number of roots ──
    {
      key: `nroots`,
      label: `Excited States`,
      type: `number`,
      default: 10,
      group: `Spectrum`,
      min: 1,
      max: 50,
      help: `Number of excited states to compute. 10 typical for UV-Vis.`,
    },
    // ── Triplets (TD-DFT only) ──
    {
      key: `triplets`,
      label: `Include Triplets`,
      type: `boolean`,
      default: false,
      group: `Spectrum`,
      help: `Compute triplet states in addition to singlets (TD-DFT only).`,
      show_if: { key: `calc_type`, values: [`tddft`] },
    },
    // ── TDA flag (TD-DFT only) ──
    {
      key: `tda`,
      label: `Tamm-Dancoff (TDA)`,
      type: `boolean`,
      default: true,
      group: `Spectrum`,
      help: `Use Tamm-Dancoff approximation (TD-DFT only). Default true for speed.`,
      show_if: { key: `calc_type`, values: [`tddft`] },
    },
    // ── Dispersion ──
    {
      key: `dispersion`,
      label: `Dispersion`,
      type: `select`,
      default: `none`,
      group: `Quantum`,
      options: [
        { label: `None`, value: `none` },
        { label: `D2`, value: `D2` },
        { label: `D3 (BJ damping)`, value: `D3` },
        { label: `D3BJ (recommended)`, value: `D3BJ` },
        { label: `D3ZERO (zero damping)`, value: `D3ZERO` },
        { label: `D30 (= D3ZERO)`, value: `D30` },
        { label: `D3TZ (triple-ζ params, D3ZERO only)`, value: `D3TZ` },
        { label: `D4 (BJ + ATM, newer)`, value: `D4` },
        { label: `NOVDW (disable D corrections)`, value: `NOVDW` },
      ],
      help: `ORCA simple-input dispersion keyword. D3BJ is the typical default for DFT functionals; D4 is newer and BJ-damped by default. NOVDW explicitly disables dispersion. See ORCA manual §3.4.1.`,
    },
    {
      key: `three_body_dispersion`, label: `Three-body term (ABC/ATM)`, type: `boolean`, default: false, group: `Quantum`,
      show_if: { key: `dispersion`, values: [`D2`, `D3`, `D3BJ`, `D3ZERO`, `D30`, `D3TZ`] },
      help: `Adds the three-body Axilrod-Teller-Muto (ATM) term to the route line as 'ABC'. Only relevant for D3 variants — D4 already includes ATM by default.`,
    },
    // ── Solvation ──
    {
      key: `solvation`,
      label: `Solvation`,
      type: `select`,
      default: `none`,
      group: `Environment`,
      options: [
        { label: `None (gas phase)`, value: `none` },
        { label: `CPCM (implicit solvent)`, value: `CPCM` },
      ],
      help: `Implicit solvation model.`,
    },
    // ── Solvent (show only when solvation == CPCM) ──
    {
      key: `solvent`,
      label: `Solvent`,
      type: `select`,
      default: `water`,
      group: `Environment`,
      options: [
        { label: `Water`, value: `water` },
        { label: `Ethanol`, value: `ethanol` },
        { label: `Acetonitrile`, value: `acetonitrile` },
        { label: `Dichloromethane`, value: `dichloromethane` },
        { label: `Acetone`, value: `acetone` },
        { label: `Hexane`, value: `hexane` },
      ],
      help: `Solvent for CPCM.`,
      show_if: { key: `solvation`, values: [`CPCM`] },
    },
    // ── Charge and multiplicity ──
    {
      key: `charge`,
      label: `Charge`,
      type: `number`,
      default: 0,
      group: `System`,
      help: `Total molecular charge.`,
    },
    {
      key: `multiplicity`,
      label: `Multiplicity`,
      type: `number`,
      default: 1,
      group: `System`,
      min: 1,
      max: 5,
      help: `Spin multiplicity (2S+1). 1=singlet, 2=doublet, 3=triplet.`,
    },
    // ── Parallelization ──
    {
      key: `num_cores`,
      label: `CPU Cores (nprocs)`,
      type: `number`,
      default: 4,
      group: `Parallelization`,
      min: 1,
      max: 256,
      step: 1,
      help: `Number of MPI processes. Emitted as '%pal nprocs N end'. The simple-input '!PALn' keyword only supports 1-8; the block form CatGO emits is unrestricted but the SLURM allocation must match. Requires OpenMPI built against the same ORCA version.`,
    },
    {
      key: `max_core_mb`,
      label: `Memory per Core (MB)`,
      type: `number`,
      default: 4000,
      group: `Parallelization`,
      min: 256,
      max: 64000,
      step: 256,
      help: `Memory per process in MB ('%maxcore'). Total job memory ≈ num_cores × max_core_mb. Keep this under ~0.75 × node RAM since ORCA can briefly exceed maxcore.`,
    },
  ],
}
