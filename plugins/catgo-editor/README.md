# CatGo Structure Editor

This package is the prebuilt local MCP runtime for CatGo's Codex structure editor.
Version: 0.2.14. Requires Python 3.10+ available as `python3` and a desktop host
supporting MCP Apps and file entrypoints. No CatGo server or account is required.

Install from the GitHub marketplace:

```sh
codex plugin marketplace add Hello-QM/catgo-codex-plugin
codex plugin add catgo-editor@catgo
```

Refresh plugin connections or start a new chat, then open a CIF/XYZ/POSCAR file.
The 3D viewer supports coordinate editing, undo/redo, version-checked host Save,
copy import/export and Miller-index slab cutting through **Build Tools → Slab**.
Extensionless POSCAR/CONTCAR can be imported through **Open**. Imported copies
use **Export**, while Save requires a writable host resource with a version token.
The **Import / Export** toolbar opens supported file actions. Export uses the
host's native Blob or standard MCP download bridge and reports its acknowledgement.
POSCAR and Extended XYZ retain fixed/free constraints; CIF retains geometry/cell.
Where WebGPU is unavailable, the gauge toggles reversible WebGL drawing resolution.
Native 0.2.14 activation/acceptance is pending; automated checks are separate.

The Python server only serves packaged UI and resources. Host file reads/writes
use the Codex bridge. The editor and WASM run inside the app surface; explicitly
sending selection adds selected atoms to the model context. Host data handling
continues to apply. The plugin has no separate telemetry service.

Source, complete installation guidance, verification boundaries and issue reporting:
https://github.com/Hello-QM/catgo-codex-plugin

Core CatGo code retains AGPL-3.0-or-later. Third-party components retain their own
notices in THIRD_PARTY_NOTICES.md and third_party/. Corresponding viewer and
scalar WASM Rust source is included in the repository's vendor/catgo directory.
This is a GitHub marketplace distribution, not an approved OpenAI Directory listing.
