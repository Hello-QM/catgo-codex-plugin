# Changelog

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
