# Verification scope

Version 0.2.11 adds a real-browser boundary-bond regression. A periodic Si pair
with no drawn image atoms produces two 1 Å stubs at scale 1, two 0.5 Å stubs
after moving the slider to 0.5, and two 1 Å half-bonds with stub mode off. The
test also checks that view controls do not dirty the structure. The existing
48-atom Miller cut-preview bond case remains a separate regression.

The release contains two kinds of evidence:

- Historical native Codex user checks: water rendered in 3D; IrO2 CIF displayed
  its cell and six atoms; the native slab controls generated a cut.
- Automated tests: stdio MCP discovery and resources, complete program hash,
  XYZ/CIF/POSCAR parsing, edits, undo/redo, version-checked saves and conflicts,
  real WebGL pixels in an opaque-origin protocol harness, import protection,
  Miller-index slab generation, and periodic preview bond endpoints/lengths.

The native confirmations apply to earlier development versions. They do not
establish that all later releases, other operating systems, or native saves
have been tested. The browser harness identifies itself as a protocol test host;
it is not the Codex desktop app. Receipts are retained under the plugin's
`acceptance/` directory, with new release results separately recorded.

`vendor/catgo/SOURCE.json` identifies the extracted sources.
`plugins/catgo-editor/references/catgo-dev-slab.json` pins the cutting path;
`assets/build-receipt.json` records the embedded scalar WASM and bundle provenance.
The direct WASM suite covers 17 slab scenarios. The periodic bond UI test checks
48 atoms in an IrO2 (001) 2×2 preview, short bonds, visible endpoints, and Save.

The tests use disposable structures. They do not submit scientific jobs or
overwrite a user's existing structure.

Version 0.2.10 adds the 23 retained upstream periodic-selection/constraint and
CP2K KIND cases. The periodic-selection browser case checks Ctrl-box selection,
sending editable atom IDs to the host, right-click selection preservation,
periodic frozen indicators, POSCAR Save/Export constraints, and undo/redo.
This remains a protocol-harness check; native Windows rendering is separate.
