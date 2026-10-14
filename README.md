# CatGo Structure Editor for Codex

[中文说明](README.zh-CN.md)

Open and edit molecular and crystal structures in the Codex desktop app's
right-hand panel. CatGo's Svelte/Three.js viewer, scalar WASM and MCP App assets
are included. Installation does not require a CatGo checkout, a running CatGo
service, Node.js, npm, or a GitHub account.

## Install

Requirements: a Codex desktop app supporting MCP Apps and file entrypoints,
a recent Codex CLI with `codex plugin marketplace`, and Python 3.10 or later
available as `python3` on the app's PATH. Linux is the locally tested platform;
macOS and Windows native host rendering have not been tested.

```sh
codex plugin marketplace add Hello-QM/catgo-codex-plugin
codex plugin add catgo-editor@catgo
```

Refresh plugin connections or start a new chat after installation. Open a
`.cif`, `.xyz`, `.extxyz`, `.poscar`, or `.vasp` file in the right-hand panel.
For an extensionless `POSCAR`/`CONTCAR`, open the CatGo editor and use **Open**.
Sample structures are in [examples/](examples/).

For Windows, check that `python3 --version` runs from the environment that
launches Codex before installing. The shipped launcher uses that command;
`python` or `py` alone is insufficient. See [troubleshooting](docs/troubleshooting.md).

## Use

- Rotate and inspect atoms, bonds and the unit cell; select atoms and edit coordinates.
- Use undo/redo. **Save** writes a host-opened writable file with a version check;
  conflicts keep pending edits. **Export** saves an edited copy.
- Import through **Open** or drag/drop, when allowed by the host. Imported copies
  use **Export**; they do not overwrite the previously opened host file.
- Open **Build Tools → Slab** to cut by Miller indices, choose thickness/layers,
  termination, in-plane supercell, conventional cell and vacuum. Geometry is
  generated locally; this is not a relaxation or an energy calculation.
- **Send selection** explicitly adds the selected atoms to model context.

The MCP server serves its packaged UI/resources. File reads and writes go through
the Codex host bridge; the server does not resolve host URIs to filesystem paths.
Rendering and slab construction run in the embedded editor. The plugin has no
standalone telemetry service. Files and explicitly sent selection context remain
subject to the host application's own data handling.

## Update and remove

```sh
codex plugin marketplace upgrade catgo
codex plugin add catgo-editor@catgo
```

Refresh connections before reopening a file. To uninstall:

```sh
codex plugin remove catgo-editor@catgo
codex plugin marketplace remove catgo
```

This is an independently published GitHub marketplace source. It has not been
submitted to or approved for OpenAI's public Plugin Directory. Users add this
source explicitly. No API key or CatGo account is required.

## Development and verification

The repo includes the plugin source, a standalone bundler and the CatGo viewer
and scalar WASM corresponding source in `vendor/catgo/`. No private-repository
access is needed to build. See [development](docs/development.md),
[verification](docs/verification.md), and [changelog](CHANGELOG.md).

CatGo's core code is AGPL-3.0-or-later. Retained third-party components have their
own licenses; see [LICENSE](LICENSE), [NOTICE](NOTICE.md) and
[third-party notices](plugins/catgo-editor/THIRD_PARTY_NOTICES.md).
