# Troubleshooting

## Installation reports `missing plugin.json`

Version 0.2.8 only included the portable root `plugin.json`. Older Codex clients,
including CLI 0.134.0 and 0.137.0, look for `.codex-plugin/plugin.json` instead and can add
the marketplace while failing to install the plugin. Version 0.2.9 includes
both manifests and their MCP configurations.

Refresh the marketplace snapshot, then install again:

```sh
codex plugin marketplace upgrade catgo
codex plugin add catgo-editor@catgo
```

Refresh plugin connections or start a new chat. If the same error persists,
check `codex --version` and `codex plugin marketplace list` to confirm which
client and marketplace checkout are being used. Include those outputs in an issue.

## Plugin cannot start

Run `python3 --version` and `codex plugin marketplace list`. The MCP configuration
launches `python3`; it uses only the Python standard library. Make sure the desktop
app inherits the same PATH as the terminal. On Windows, a Python installation
exposing only `python` or `py` needs a working `python3` command before this package
can start. Windows native rendering is not yet verified.

## The file opens as text

Check that `catgo-editor@catgo` is installed/enabled. Refresh plugin connections
or start a new chat, then reopen the file. Native automatic entrypoints are
advertised for `.cif`, `.xyz`, `.extxyz`, `.poscar`, `.vasp`; use **Open** inside
the editor for extensionless `POSCAR`/`CONTCAR`. An older host without MCP App
file-entrypoint support can only provide its own available app-opening behavior.

## Buttons show but the 3D view is blank

Wait for the local MCP resource loading to finish. Record any visible “3D view”
or “CatGo could not open” error and include the plugin/host versions in an issue.
WebGL must be available in the host sandbox. Coordinate edits can remain usable
when the host's graphics initialization fails.

## The editor reports a missing file-resource interface

The message `This host does not provide the file-resource interface required by the editor.`
can appear in an app opened directly from a chat tool call. The tool result's
"Opened" message does not establish that the native file viewer has read the
file. Open the workspace structure through Codex's file entrypoint and select
its right-panel file tab. Confirm the filename, visible atoms and atom count
in the footer. If an agent's open request is queued or creates an inactive tab,
select the intended file tab before checking the canvas.

In the 0.2.11 native check, the actual file viewer provided the host resource
bridge while the directly invoked tool app did not. No plugin reinstall or
host-code patch was needed to complete that native check. A host without the
file-entrypoint capability still cannot provide that bridge; imported copies
through **Open** use **Export**, not host-file Save.

Fixed in **0.2.12**: the initialization check waits for a visible layout and
rechecks in the same tab when its size or visibility changes. Actual WebGL
exceptions are still reported. See the [lifecycle fix](lifecycle-fix-0.2.12.md).

The earlier 0.2.11 follow-up observed a hidden tab retaining a `size: 0 × 0`
initialization diagnostic after atoms became visible. Keep the intended file
tab selected in the active chat. After confirming any edits are saved to disk,
close and reopen that file if needed. The recorded follow-up reopened without
an alert and read the saved coordinates back; this is a recovery observation,
not a runtime fix or a reason to reinstall the plugin.

## Missing program-manifest.json after updating

A chat may retain a server from a removed plugin cache version. Refresh its
plugin connections before opening a new editor. The current server snapshots
assets at initialization to protect already-open editors.

## Cell-edge stub bonds or Stub Length has no effect

Update to 0.2.11 or later and reopen the editor. Earlier plugin versions forced
incomplete bonds hidden in the ordinary viewer, overriding these controls.
The cut preview still hides incomplete bonds to avoid misleading preview sticks.

Stub Length affects cross-cell bonds only. It is a fraction of the half-bond
length; very short stubs (such as 0.15) can be entirely inside an atom sphere.
Try 0.5–1.0 when checking the setting. Bonds with both endpoints drawn remain
complete, and molecular bonds do not change.

Disabling **Cell-edge stub bonds** restores complete half-bonds in the tested
two-Si boundary case; it does not hide every bond. See the
[native comparison](native-host-0.2.11.md) and its public synthetic fixture.

## Save is unavailable or reports a conflict

Version 0.2.12 also fixes delayed notifications of the editor's own Save
resetting history and closing the coordinates panel. Matching saved versions
now retain the current document; truly changed disk versions still refresh or
show the external-change notice. Repeated input for the same file no longer
restarts its editor state.

Save requires a host-opened writable resource and version token. Imported copies
use **Export**. For external file changes, keep/export pending edits and reopen
the current file; the editor does not silently retry an unconditional overwrite.

## Drag/drop is unavailable

Some native hosts block OS drag/drop. Use **Open** in the editor as the import route.

Report reproducible problems at:
https://github.com/Hello-QM/catgo-codex-plugin/issues
