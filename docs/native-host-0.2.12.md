# Native coordinate editing and save acceptance: 0.2.12

The native Linux file editor passed coordinate-editing, host-file Save and
post-save Undo/Redo acceptance on **2026-10-29**. This is a separate native
result from the protocol-harness lifecycle regression.

The installed desktop package was `26.1023.51421`. Before editing and after
the final operation, the actual native document's entry script matched
SHA256 `3502e8fd46ef6823c9dd3ee91a6ae2331cc019745f0d625b35b6d5bc1707a1eb`,
which pins the 0.2.12 program
`925a11bb954a1beec67d7843119c9de540cfe4d3566b91e2fb6c92f1f503839b`.
The loaded program was verified directly; the installed version label alone
was not used as acceptance evidence.

## Completed sequence

1. Open a fresh disposable copy through the host's native file entrypoint.
   It initially matched the protected original byte for byte and showed
   `Saved · 157 atoms`, with no error alerts.
2. Use **Coordinates → Apply coordinates** to move the first atom by 0.1 Å
   in Cartesian X. The editor becomes dirty and enables Undo and Save;
   independent disk checking confirms no write occurs before Save.
3. Use the native **Save** button. Independently parse the saved POSCAR and
   verify the intended displacement, all other coordinates at export precision,
   the cell, species/counts and every selective-dynamics flag.
4. Without reopening the file, click **Undo**, then **Coordinates** to read
   the current geometry. The previous coordinates return, Redo and Save are
   enabled, and the document is dirty. Click **Redo** and **Coordinates**:
   the saved coordinates and clean state return, with Save disabled.
5. Continue in the retained document with a 0.1 Å Y edit and then a 0.1 Å Z
   edit. Repeat native Save, disk parsing and post-save Undo/Redo after each
   edit. All **three Save cycles** and **three post-save Undo/Redo cycles** pass.
6. Traverse the complete history across all three saves: three Undo steps
   restore the initial coordinates; three Redo steps restore the final saved
   coordinates. Undo changes the in-memory document but does not write to disk.
7. Verify the final native state: `Saved · 157 atoms`, Save and Redo disabled,
   Undo enabled, no alerts, and visible 3D atoms. Retain the final native
   screenshot locally and independently check the final disk file again.

The disposable copy retains the cumulative first-atom edit `[0.1, 0.1, 0.1] Å`.
All other coordinates are unchanged within the eight-decimal fractional POSCAR
export precision. The maximum Cartesian rounding difference was
0.000000206 Å, within the cell-derived bound of 0.000000209 Å. The protected
original's SHA256 and modification time remained unchanged throughout.

## Control observations and limits

An initial screenshot request timed out before editing. Focusing the existing
chat restored control without closing or reopening the file. During the
extended history traversal, automation target handles changed; the retained
document still had its Redo history. The extended-history automation call
returned `target unavailable` instead of a normal completion acknowledgement.
After acquiring a fresh handle, independent native read-back and the final
visible-document screenshot confirmed that all three edits had been redone
and the editor was clean. This verifies the final history state, but does not
demonstrate an uninterrupted control channel throughout that optional
traversal. No file reopen or reload was used to recover editing, saving or history.

These observations are retained alongside the successful functional checks.
They do not establish general host automation reliability or recovery from a
genuinely disconnected host transport. Native hidden-tab startup, save-conflict
UI, keyboard shortcuts, fresh-reopen readback and native macOS/Windows were
not exercised in this sequence.

See the [versioned native receipt](../plugins/catgo-editor/acceptance/native-edit-save-0.2.12.json).
This is a maintainer-reported private-fixture result: original structures,
absolute coordinates, screenshots, hashes, local paths and session identifiers
remain local. The public report contains only aggregate verification results.
No runtime, release version or installation was changed for this acceptance;
no uninstall/reinstall or scientific job submission was performed.
