# Changelog

## 0.2.14 — 2026-10-30

- Carry forward the host-mediated Export, Import / Export, extXYZ movement-mask
  and WebGL performance-control fixes from the unreleased 0.2.13 candidate.
- Fix the UI compiler configuration inside the plugin so building inside a
  larger checkout cannot inherit its parent's strict-mode setting. Require
  rebuilt CI assets to match the committed runtime before browser acceptance.
- Capture download events before clicking and start the bounded download wait
  after the click. A controlled slow-renderer case reproduced the old false
  timeout despite a successful download; preserve actual-file reparsing checks.
- Treat Apply Cut as an in-place operation and retain explicit atom-count,
  phase, geometry and Save assertions. Keep exact CI builds for diagnosis.
- Preserve the failed candidate's tag and CI history without publishing its
  prepared Release. Native 0.2.14 activation and GUI acceptance remain deferred.

## 0.2.13 — 2026-10-30 (unreleased candidate)

- Export through the host download bridge using Codex's native Blob/name
  contract or the advertised MCP contents contract. Retry only an argument
  schema mismatch; report cancellation/errors without clearing edits or
  history. Show a download acknowledgement instead of silently relying on a
  blocked sandbox anchor.
- Connect the Import / Export toolbar button to the editor's supported file
  actions. Import retains the existing unsaved-change confirmation; export
  offers POSCAR, Extended XYZ and CIF with matching copy names. Explain that
  CIF does not retain fixed/free constraints and disable cell-only formats
  for molecules.
- Restore extXYZ per-axis and whole-atom movement constraints when reading
  exported files, using their declared column layout. Preserve declared force
  vectors, avoid inferring forces from numeric logical fields, and reject
  malformed or contradictory movement flags without replacing pending edits.
- Provide a working WebGL rendering-resolution toggle when WebGPU is absent.
  Keep the existing WebGPU mode where available. The fallback is reversible
  and does not change atom geometry, fixed/free constraints or sphere meshes.
- Add real SDK/browser download, file-chooser and 201-atom partial-occupancy
  rendering regressions. Retain native-host and automated-test evidence as
  separate gates; native 0.2.13 acceptance is deferred by the maintainer.

## 0.2.12 — 2026-10-21

- Wait for a visible viewer layout before checking initialization. Recheck after
  size/visibility changes and clear a recovered readiness warning in the same
  tab; retain genuine WebGL/render exceptions.
- Reconcile host resource updates by version. Notifications from the editor's
  own Save and repeated input for the same file retain coordinates, selection
  and Undo/Redo history instead of reloading the document. Defer updates during
  Save and reject stale reads across file changes or completed writes.
- Keep actual external changes and save conflicts protected. Avoid repeating
  the same resource subscription when reloading an already subscribed file.
- Keep the latest file request when returning to the active file during a slow
  read; serialize subscription changes so late acknowledgements cannot strand
  the retained file without updates.
- Add a browser regression covering hidden startup, repeated hide/show,
  notifications before the write acknowledgement and after Save, continued
  Undo/Redo, duplicate file input, delayed file/subscription changes and real
  external changes. Run it and the
  unavailable-GPU case in CI. Read the App SDK version from the package manifest.
- Record native Linux acceptance on 2026-10-29: verify the actual 0.2.12 program,
  three host-file Save cycles, Undo/Redo after every Save and complete history
  traversal across the three saves on a fresh disposable 157-atom copy.
  Independently verify disk geometry and preserve the original's SHA256 and
  modification time. Keep private screenshots local and record control-layer
  interruptions separately. No runtime change or reinstall was performed.

## 0.2.11 — 2026-10-20

- Restore CatGo's ordinary periodic-bond settings so the Cell-edge stub bonds
  checkbox and Stub Length inputs affect the rendered cross-cell bonds. The
  plugin previously forced incomplete bonds hidden across the whole viewer.
- Keep incomplete bonds hidden specifically in the Miller cut preview, retaining
  the earlier slab-preview fix without overriding the ordinary viewer controls.
- Add a browser regression that measures the actual boundary-bond transforms
  while using the checkbox, number input and slider.
- Record native Codex Linux acceptance on 2026-10-21: the right-panel file
  editor visibly changes the boundary bonds at Stub Length 1.0/0.5 and when
  toggling stub mode. Include a synthetic Si fixture, four screenshots and a
  separate native receipt. A private 157-atom structure also rendered; its
  coordinates and screenshot remain local. This acceptance update does not
  change the runtime or release version.
- Extend native Linux acceptance with a fresh disposable 157-atom copy:
  coordinate editing, Undo/Redo before Save, host-file Save and rereading the
  saved coordinates in a new native tab. Check disk geometry at POSCAR export
  precision, species/counts, cell and selective-dynamics flags; retain the
  protected original's SHA256 and modification time. Record the initial
  hidden-tab diagnostic and automation interruption, followed by an alert-free
  reopen, in a separate receipt. No reinstall or runtime change was needed.

## 0.2.10 — 2026-10-15

- Apply catgo-dev `00d4575` and `a42235c`: periodic-image click/box selection,
  selection-preserving constraint actions, image highlights/frozen indicators,
  POSCAR quick-export constraints, and CP2K named-KIND parsing. Retain the
  upstream regression cases and pin the applied files in the build receipt.
- Send a plain snapshot of selected atoms to the Codex host, avoiding a
  `postMessage` cloning error from reactive coordinates.
- Keep the reviewed Miller slab core and scalar WASM, plus the legacy Codex
  package entrypoints from 0.2.9.
- The CP2K parser change applies to retained parser code; this release does not
  add an in-place CP2K input-file editor. CatGo's Windows sidecar process-tree
  fix is outside this embedded plugin's runtime.

## 0.2.9 — 2026-10-14

- Add `.codex-plugin/plugin.json` and `.mcp.json` for Codex clients using the
  legacy package layout. CLI 0.134.0 and 0.137.0 could add the marketplace but rejected
  0.2.8 with `missing plugin.json` because it did not recognize root manifests.
- Generate compatibility metadata from the portable files and check consistency
  in CI. Include both layouts in the runtime ZIP.
- Add isolated real-CLI installation and MCP discovery checks.

## 0.2.8 — 2026-10-13

- Publish a standalone GitHub marketplace named `catgo`, with plugin identity
  `catgo-editor` and English/Chinese installation instructions.
- Include the CatGo viewer graph, scalar WASM Rust sources, standalone build
  adapter, dependency locks, license texts and sample structures.
- Remove build-time reliance on sibling private checkouts and fixed browser paths.
- Add package integrity checks and GitHub Actions verification.
- Read the MCP version from the manifest and use UTF-8 for resources and stdio.
- Retain 0.2.7's slab logic/source checks and periodic preview bond fix.

## 0.2.7

Align slab generation with reviewed catgo-dev sources and scalar WASM, including
conventional-cell conversion, layer count, termination, supercell and vacuum.

## 0.2.6

Render periodic slab-preview bonds using their lattice image offsets, with the
incomplete-bond visibility setting respected.
