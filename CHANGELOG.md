# Changelog

## 0.2.13 — 2026-10-30

- Restore the toolbar's Import/Export pane, which the build had replaced with an
  empty component while keeping its button. Import offers Open File and Paste
  Content; Export offers structure formats, figures (PNG, GLB/OBJ) and the QE,
  VASP, LAMMPS, CP2K, Gaussian, GROMACS, ORCA, ABACUS, AMBER and SPARK input
  generators. OPTIMADE database search stays out: the sandbox has no network.
  `IOPane.svelte` is vendored from CatGo `d6f3e1b0` and recorded in `SOURCE.json`.
- Route every CatGo download through the host's `downloadFile` via CatGo's
  `globalThis.download` hook, including binary images; hosts without that
  capability still get a browser download.
- Replace the export preview's Monaco editor, which arrived without its
  stylesheet and rendered unreadable, with a themed editable textarea. Monaco
  leaves the bundle (program 8.0 MiB).
- Add Claude Code support from the same package: `.claude-plugin/plugin.json`
  and a root `.claude-plugin/marketplace.json`. `claude_server.py` provides the
  `view_structure`, `open_viewer` and `get_viewer_selection` MCP tools and a
  loopback page that hosts the unchanged prebuilt editor, for the Claude desktop
  Browser pane or any browser. The page answers the editor's host protocol from
  local files: version-checked Save, external-change reloads, Export beside the
  open file and Send selection. Its API requires a per-host token kept in a
  user-only state file and accepts only structure files.
- Claude Code also reads the Codex `.mcp.json`; the Claude manifest declares the
  same server name so its entry replaces the Codex one.
- A session started before an upgrade keeps a newer running viewer instead of
  restarting it, so sessions on different versions do not fight over the port.
- Apply CatGo's light/dark theme inside the editor (both hosts). CatGo's
  components read its theme variables, which nothing defined, so the pencil
  palette, Build Tools and other panes fell back to dark colours on light pages.
  The editor now loads CatGo's `themes.js` (vendored from `d6f3e1b0`) and calls
  `apply_theme_to_dom` for the host's light/dark choice; the editor shell keeps
  the host's style variables and falls back to CatGo's page and text colours.
- In the Claude viewer, Export and every download open the system Save dialog
  (`showSaveFilePicker`, the desktop portal's file chooser in the Claude app).
  Where a browser has no such dialog, the page asks for a path, starting in the
  open file's folder, and replaces an existing file only after confirmation.

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
