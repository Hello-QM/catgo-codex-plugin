# File downloads and toolbar actions: 0.2.13

## Changes

The Export button previously fell back to an anchor inside the app sandbox
when the host did not advertise the newer MCP download capability. The current
Codex host accepts `ui/download-file` with structured-cloned `{blob, name}`;
the newer SDK contract uses embedded `contents`. The editor now supports both
through the host bridge. Only an argument-schema error receives one compatible
retry. Cancellation and unsupported/failed downloads produce visible errors,
retain unsaved coordinates/history and do not write the source file.
The success notice says **Download requested**, describing the host's
acknowledgement rather than asserting that a system dialog has completed.

The Import / Export toolbar button previously opened a pane omitted from the
standalone package. It now opens the wrapper's supported file actions: import
through the existing file picker, or export POSCAR, Extended XYZ and CIF to a
separate copy. Import reuses Keep editing / Discard protection. Names must match
the selected format and cannot contain a folder path. Cell-only formats are
disabled for molecules; the pane explains that CIF does not retain fixed/free
constraints, while POSCAR and Extended XYZ do.

The retained XYZ parser also omitted explicit movement-constraint columns.
The editor now restores per-axis and whole-atom flags from their declared
`Properties` offsets, including quoted/unquoted layouts. Declared forces are
preserved; logical columns are not mistaken for force vectors. Invalid or
contradictory movement flags are rejected before replacing the open document.
This normalization applies to the editor's file-entry/import paths.
The reader supports both whole-atom and three-axis `move_mask` columns,
including binary integer masks. These layouts follow the
[ASE Cartesian-constraint format](https://gitlab.com/ase/ase/-/merge_requests/2201)
and [integer-mask compatibility case](https://gitlab.com/ase/ase/-/issues/1015).

The gauge used to be disabled without WebGPU. In that environment it now
toggles the existing WebGL drawing-buffer resolution and restores it when
switched off. Where WebGPU is available, the original large-system renderer
remains the action. The fallback does not change atomic coordinates, constraints,
the document's dirty state or sphere mesh resolution. In particular, it avoids
the upstream `performance_mode` path that reduces sphere segments for structures
over 200 atoms without restoring them on exit.

## Regression evidence

Tests use the real bundled editor, official SDK and browser renderer. The
controlled host reproduces the native Blob argument schema and blocks direct
downloads from the editor iframe. A download is counted only after the host
initiates it, the browser saves bytes, and the output reparses with the expected
geometry. The test fixtures are synthetic and contain no private scientific
structure.

- Against the previous 0.2.12 program, the export download, file-action pane
  and unavailable-WebGPU control each failed its new regression.
- Review of the first fix found an additional large-structure issue. A new
  201-atom CIF fixture with one partially occupied atom demonstrated real sphere
  segments remaining at 12 instead of the original 20 after a speed/quality
  round trip. The final fallback controls drawing resolution independently.
- The final cases cover native Blob, standard contents and schema-mismatch
  compatibility; actual POSCAR/CIF downloads; fixed/free flags; preserved dirty
  state/history; cancellation and unsupported exports; real file-picker import
  with Keep editing and Discard; molecule export; and reversible drawing-buffer
  and partial-occupancy sphere quality.
- Round-trip tests additionally caught extXYZ flags present in the downloaded
  file but missing after reparse. Literal parser fixtures cover per-axis and
  whole-atom flags, numeric/text logical values, declared force offsets and
  invalid-input preservation. The browser checks the exported file after
  parsing, rather than accepting the presence of header fields as sufficient.

The versioned [automated receipt](../plugins/catgo-editor/acceptance/file-actions-0.2.13.json)
records the final build and completed checks. Existing editor, lifecycle,
boundary-bond and slab regressions remain in CI.

## Native status and limits

Native activation and GUI acceptance of **0.2.13** are deferred at the
maintainer's request while Work's local browser control is disabled. The prior
0.2.12 native coordinate/Save/history result remains scoped to that program.
Protocol-host downloads do not establish native system-dialog or download-folder
behavior. The new fallback is exercised with WebGPU absent; the available-WebGPU
large-system backend and native macOS/Windows are outside this follow-up.

This follow-up does not update the installed plugin or reload its active
native tab. Unsaved native state was not reverified after browser control
became unavailable. No uninstall/reinstall or scientific
calculation submission was performed. Private input structures, screenshots,
file hashes and paths remain outside the public repository.
