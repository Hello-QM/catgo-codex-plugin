# Changelog

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
