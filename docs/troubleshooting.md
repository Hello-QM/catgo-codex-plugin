# Troubleshooting

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

## Save is unavailable or reports a conflict

Save requires a host-opened writable resource and version token. Imported copies
use **Export**. For external file changes, keep/export pending edits and reopen
the current file; the editor does not silently retry an unconditional overwrite.

## Drag/drop is unavailable

Some native hosts block OS drag/drop. Use **Open** in the editor as the import route.

Report reproducible problems at:
https://github.com/Hello-QM/catgo-codex-plugin/issues
