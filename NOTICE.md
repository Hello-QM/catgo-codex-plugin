# Attribution and source

This distribution contains the CatGo structure editor, adapted for the Codex
host file bridge and MCP Apps by the Hello-QM project. CatGo code retains its
AGPL-3.0-or-later license. Historical MatterViz-derived portions retain the
Janosh Riebesell MIT notice included with the third-party license texts.

The standalone Svelte/WASM bundler and build-commit notification adapter were
adapted from the Hello-QM DSH CatGo integration. No DSH services or complete
private repositories are included. The required CatGo viewer graph and scalar
WASM Rust crates are included in `vendor/catgo/`; npm and Cargo dependency
manifests identify externally maintained dependencies.

`vendor/catgo/SOURCE.json` records the extracted source hashes and original
commit. The slab algorithm fingerprints refer to reviewed catgo-dev commit
`c1bbd5fa89c372e8e51285fa3b568a403133e68b`; the periodic bond display fix matches
upstream commit `1c4d0950701b31f9c729bd7d72a5e040b76fc49a`.

Original citations, license texts and scoped provenance records are retained
under `plugins/catgo-editor/`. The upstream third-party inventory includes
unresolved historical provenance mappings; this distribution does not claim
that those records are a complete legal audit. Included npm dependency notices
are additionally retained in `third_party/npm/` in the plugin.
