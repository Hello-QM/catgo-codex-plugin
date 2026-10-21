# Verification scope

Native Codex Linux acceptance of **0.2.11** was completed on 2026-10-21 in the
actual right-panel file editor. A synthetic two-Si structure visibly changed
its boundary bonds at Stub Length 1.0/0.5 and when stub mode was disabled and
re-enabled. All four comparison captures used the same camera. A private
157-atom structure also rendered, and its original/copy SHA256 checks matched.
See the [native screenshots and reproduction steps](native-host-0.2.11.md)
and [versioned native receipt](../plugins/catgo-editor/acceptance/native-host-0.2.11.json).
This check did not edit coordinates or exercise native Save, undo/redo or
non-Linux host rendering.

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

The historical native confirmations listed above apply to earlier development
versions; the separate 0.2.11 native receipt covers only the checks described
at the top of this page. Neither establishes coverage of later releases,
other operating systems or native saves. The browser harness identifies itself
as a protocol test host; it is not the Codex desktop app. Receipts are retained
under the plugin's `acceptance/` directory, with new results separately recorded.

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
