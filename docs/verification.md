# Verification scope

Version **0.2.14** adds host-download and toolbar regressions. Actual browser
downloads are saved and reparsed, covering native Blob, standard MCP contents
and an advertised-capability/legacy-schema combination. Tests exercise the
Import / Export file chooser, Keep editing and explicit Discard, error/cancel
preservation, molecule format availability, and a reversible drawing-resolution
toggle. A 201-atom fixture with partial occupancy checks real sphere geometry
as well as drawing-buffer resolution. See the [fix report](file-actions-0.2.14.md).
These are real packaged-editor/SDK tests in a controlled protocol host.
Native 0.2.14 activation and GUI acceptance are deferred at the maintainer's
request while local browser control is disabled; earlier native receipts do
not establish native acceptance of the new version.

Version **0.2.12** adds a lifecycle regression against the real bundled editor
and official SDK in the protocol test host: hidden startup beyond the old
three-second deadline, repeated hide/show, resource updates before a write
acknowledgement and after Save, continued Undo/Redo and duplicate file input.
It asserts one SDK initialization and one resource subscription across those
operations, and checks that a truly changed external version still loads.
Controlled file reads and unsubscribe acknowledgements also verify that rapid
file switching keeps the latest requested document subscribed to updates.
The unavailable-GPU case verifies that genuine graphics errors remain visible.
See the [fix report](lifecycle-fix-0.2.12.md) and
[versioned receipt](../plugins/catgo-editor/acceptance/lifecycle-fix-0.2.12.json).
These browser tests are not native Codex GUI evidence.

Native Linux acceptance of **0.2.12** was completed separately on **2026-10-29**.
The actual loaded entry script was verified before and after the sequence.
A fresh disposable 157-atom copy passed three native coordinate-edit/Save
cycles, Undo/Redo after every Save, and complete history traversal across all
three saves, without reopening or reloading the file for recovery. Independent
disk parsing checked the edit, other coordinates at export precision, cell,
species/counts and every selective-dynamics flag. The protected original's
SHA256 and modification time were unchanged; the final native screenshot
shows the saved state and 3D atoms. See the [native report](native-host-0.2.12.md)
and [receipt](../plugins/catgo-editor/acceptance/native-edit-save-0.2.12.json).
The report also records the screenshot timeout before editing and control-target
remapping during extended history traversal. General host transport recovery,
native hidden startup, conflicts, keyboard shortcuts and other operating systems
remain outside this native check.

Native Codex Linux acceptance of **0.2.11** was completed on 2026-10-21 in the
actual right-panel file editor. A synthetic two-Si structure visibly changed
its boundary bonds at Stub Length 1.0/0.5 and when stub mode was disabled and
re-enabled. All four comparison captures used the same camera. A private
157-atom structure also rendered, and its original/copy SHA256 checks matched.
A follow-up with a fresh disposable copy verified native coordinate editing,
Undo/Redo before Save, actual host-file Save and reading the saved coordinates
back in a new native file tab. Independent disk parsing checked the edit,
cell, species/counts and all selective-dynamics flags at the eight-decimal
POSCAR export precision. The protected original's SHA256 and modification time
were unchanged; no reinstall or runtime change was made.
See the [native screenshots and reproduction steps](native-host-0.2.11.md)
and separate [rendering receipt](../plugins/catgo-editor/acceptance/native-host-0.2.11.json)
and [editing/save receipt](../plugins/catgo-editor/acceptance/native-edit-save-0.2.11.json).
The private follow-up is a maintainer-reported result with local evidence.
Those 0.2.11 checks did not exercise native non-Linux rendering, save-conflict UI,
keyboard shortcuts or Undo/Redo across Save. The follow-up also recorded a hidden-tab startup
diagnostic and a side-panel automation interruption; reopening in the active
chat completed the persistence check without an alert. See the native report
for these limits.

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

The historical native confirmations apply to their recorded development
versions; the separate 0.2.11 and 0.2.12 receipts cover only their stated checks.
They do not establish coverage of later releases or other operating systems.
The browser harness identifies itself
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
