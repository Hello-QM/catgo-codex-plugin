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

## Save is unavailable or reports a conflict

Save requires a host-opened writable resource and version token. Imported copies
use **Export**. For external file changes, keep/export pending edits and reopen
the current file; the editor does not silently retry an unconditional overwrite.

## Drag/drop is unavailable

Some native hosts block OS drag/drop. Use **Open** in the editor as the import route.

Report reproducible problems at:
https://github.com/Hello-QM/catgo-codex-plugin/issues
