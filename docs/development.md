# Build and test

Requirements for development: Node.js 22+, npm, Python 3.10+, and Git.
Users installing the prebuilt plugin need only the runtime requirements in the README.

From the repository root:

```sh
npm ci --ignore-scripts --prefix vendor/catgo
npm ci --prefix plugins/catgo-editor/ui
node scripts/apply-vendor-patches.mjs
python3 scripts/sync-codex-compat.py
node plugins/catgo-editor/scripts/build-ui.mjs
python3 scripts/check-package.py
python3 -m unittest discover -s plugins/catgo-editor/tests -v
node --test plugins/catgo-editor/tests/document.test.mjs
npm --prefix plugins/catgo-editor/ui run test:upstream
node plugins/catgo-editor/tests/mcp-client.mjs
node plugins/catgo-editor/tests/slab-runtime.mjs
```

Install a Playwright browser for the UI acceptance tests:

```sh
cd plugins/catgo-editor/ui
npx playwright install chromium
cd ../../..
node plugins/catgo-editor/tests/editor.browser.mjs
CATGO_EDITOR_TEST_PERIODIC_SELECTION=1 node plugins/catgo-editor/tests/editor.browser.mjs
CATGO_EDITOR_TEST_BOUNDARY_BONDS=1 node plugins/catgo-editor/tests/editor.browser.mjs
CATGO_EDITOR_TEST_SLAB_BONDS=1 node plugins/catgo-editor/tests/editor.browser.mjs
CATGO_EDITOR_TEST_IMPORT_AND_SLAB=1 node plugins/catgo-editor/tests/editor.browser.mjs
CATGO_EDITOR_TEST_CONVENTIONAL_LAYERS=1 node plugins/catgo-editor/tests/editor.browser.mjs
```

The variable syntax above is for POSIX shells. Tests use Playwright's installed
Chromium by default; `CATGO_TEST_BROWSER` can select an existing browser executable.
Every test owns and closes its local HTTP server and browser.

The upstream test bundle runs the retained catgo-dev selection/constraint and
CP2K KIND cases with the same Svelte compilation used by the editor. Vitest and
happy-dom are development dependencies only. `references/catgo-dev-updates.json`
records the applied upstream commits; the build checks those source files.

The root `plugin.json` and `mcp.json` are canonical. After metadata changes, run
`python3 scripts/sync-codex-compat.py` to regenerate the legacy Codex overlay
and `.mcp.json`; the package check rejects stale compatibility files.
`python3 scripts/check-codex-install.py --codex /path/to/codex` checks a real
CLI's marketplace install and MCP discovery in a disposable `CODEX_HOME`.

The default build uses only `vendor/catgo/`. For a maintainer-reviewed replacement
checkout, set `CATGO_SOURCE_ROOT` explicitly. The 17 slab source fingerprints must
pass before building, and the exact tested scalar WASM bytes must be embedded.
Review updated fingerprints and run the numerical/UI cases before releasing a new
upstream algorithm. The vendored Three.js patch retains the original viewer fixes.

The scalar binary is included for normal frontend builds. Its corresponding source
is `vendor/catgo/extensions/rust/`, with local crates under `extensions/uff-relax`,
`extensions/vsepr-rs`, and `tools/cube-core`. To modify and rebuild that binary, use
Rust 1.93+ with the `wasm32-unknown-unknown` target and wasm-pack 0.14.0:

```sh
cd vendor/catgo/extensions/rust
wasm-pack build --target web --out-dir ../rust-wasm/pkg --features wasm-scalar --no-default-features --locked
```

The crate's `.cargo/config.toml` supplies the scalar SIMD configuration. Rebuild
the editor and rerun the slab cases after changing the WASM. This source tree
includes the Rust inputs and locks; frontend verification reuses the included
scalar artifact and does not claim to have recompiled Rust.

Create the runtime ZIP with:

```sh
python3 plugins/catgo-editor/scripts/package.py
```

The archive is written to `dist/`, outside the installable plugin. Source and
node_modules are not included in the runtime ZIP; corresponding source is supplied
by this repository and the release's source archive.
