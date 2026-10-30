# File actions and performance controls — 0.2.14

This release carries the [Export and toolbar repairs](file-actions-0.2.13.md)
forward with explicit UI build configuration and corrected browser-test waits.
The 0.2.13 candidate tag remains immutable; its prepared downloadable Release
was not published after CI failures. Native GUI acceptance of **0.2.14** remains
deferred at the maintainer's request.

## User-visible behavior

- Export requests a separate download through the host bridge. Both Codex's
  Blob/name payload and the advertised MCP contents contract are covered.
  Host-reported cancellation and unsupported downloads report an error and preserve edits
  and history. The success notice acknowledges a request; it does not claim
  that the user completed a native system dialog.
- Import / Export opens working file actions with the existing unsaved-edit
  guard. POSCAR, Extended XYZ and CIF downloads are saved and reparsed in tests.
  Cell-only formats are unavailable for molecules, copy names must match their
  format, and the pane explains CIF's loss of fixed/free flags.
- Extended XYZ rereading restores declared per-axis or whole-atom movement
  masks, including ASE and binary integer masks. Declared force columns remain
  intact; invalid or conflicting constraints preserve the current document.
- Without WebGPU, the gauge toggles WebGL drawing resolution and restores it
  on the return trip. A 201-atom partial-occupancy fixture checks that sphere
  meshes remain unchanged. The existing available-WebGPU action is retained.

## Build and test corrections

The first candidate's CI exposed two failures: a seven-second download event
deadline and Apply Cut waiting for a scheduled navigation. Its
[main run](https://github.com/Hello-QM/catgo-codex-plugin/actions/runs/41024397088)
and [tag run](https://github.com/Hello-QM/catgo-codex-plugin/actions/runs/41024396755)
each retain their initial failure and one unsuccessful retry. They are not
reported as successful acceptance.

A controlled slow-renderer diagnostic reproduced a false download failure:
the old deadline expired at 7 seconds, the click completed at 7.56 seconds, and
the actual successful download arrived at 7.95 seconds. The revised helper
listens before the click, then starts a bounded 30-second event wait after it.
It removes its listener and timer in `finally`. Files still have to be saved
and reparsed with the expected geometry and constraints. Cancellation and
unsupported-download checks remain separate.

Apply Cut changes the current document in place. Its tests skip the navigation
wait and retain the original 30-second atom-count and Preview-phase waits,
bond geometry checks and parsed Save results for the 24/48-atom cases. This
change does not establish the cause of every earlier CI interruption.

Exact CI build artifacts made the earlier fingerprint difference inspectable.
The only difference was a redundant 13-byte `"use strict";` directive in the
injected session-store initializer. This checkout had inherited strict mode
from a parent project's TypeScript configuration; standalone CI did not.
Removing that directive made the complete programs byte-identical. It is
redundant in the dynamically imported ES module and does not explain the
download timeout. The plugin now has its own UI configuration without
`extends`; CI retains its actual build and requires all rebuilt runtime
assets to match the committed ones before running the browser suite.

The versioned [automated receipt](../plugins/catgo-editor/acceptance/file-actions-0.2.14.json)
records the final package and completed local checks. Final source/tag CI and
publication checks are recorded in the Release notes.

## Native status and limits

Work's local browser control remains disabled by the maintainer's choice.
This follow-up does not activate or replace the current native editor tab.
The current tab's unsaved state has not been reverified after control became
unavailable. The previous 0.2.12 native coordinate/Save/history acceptance
remains scoped to that version.

Protocol-host tests do not establish native system-dialog/download-folder
behavior. The available-WebGPU large-system backend and native macOS/Windows
remain outside this follow-up. Private scientific inputs, screenshots, file
hashes and local paths remain local. No uninstall/reinstall or scientific job
submission was performed.
