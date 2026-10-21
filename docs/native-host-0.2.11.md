# Native Codex acceptance: 0.2.11

The CatGo 0.2.11 file editor passed the following visual checks in the actual
Codex right panel on Linux on 2026-10-21 (Codex desktop 26.1016.51333).
These screenshots are native-host evidence, separate from the automated
browser protocol harness.

## Results

| Check | Result |
| --- | --- |
| Native file read and two-Si rendering | Passed; the footer displayed `Saved · 2 atoms` and a real canvas showed the atoms. |
| Stub Length 1.0 → 0.5 | Passed; both visible boundary bond segments shortened. |
| Cell-edge stub bonds unchecked | Passed; complete half-bonds appeared. In this fixture they matched the checked 1.0 rendering. |
| Stub mode rechecked at 0.5 | Passed; the 0.5 rendering returned exactly. |
| Private 157-atom structure | Passed; visible native rendering, a `Saved · 157 atoms` footer and no error alerts. |
| Original/copy integrity | Passed; the private structure's original and copies matched their initial SHA256. No coordinate edits or Save actions were performed. |

The private structure, its screenshot, local file paths and session identifiers
are not included in this public repository. Its result is a maintainer-reported
check with local evidence. The public evidence below uses only the synthetic Si
fixture. This run does not verify native Save, coordinate editing, undo/redo,
Windows or macOS rendering.

## Reproduce

1. Open [Si-boundary-stubs-0.2.11.poscar](../examples/Si-boundary-stubs-0.2.11.poscar)
   through the Codex native file entrypoint and select its right-panel file tab.
   The 10 Å cubic cell has two Si atoms at fractional x = 0.1 and 0.9, with
   y = z = 0.5. Their nearest bond crosses the x boundary.
2. Confirm that the actual atoms are visible and the footer reports two atoms.
   A chat tool's "Opened" response or a welcome page is insufficient.
3. Open **Controls → Bonds**. Keep **Bonds = Always**, **Strategy = Atom Radii**
   and **Bond scale = 1.15**. Keep the camera and all other display settings
   unchanged throughout the comparison.
4. With **Cell-edge stub bonds** checked, compare **Stub Length = 1.0** and
   **0.5**. Close the controls pane for unobstructed canvas screenshots. The
   default 0.15 can be hidden inside the atom spheres.
5. At 0.5, uncheck and then recheck **Cell-edge stub bonds**. The unchecked
   state shows complete half-bonds; the checked state restores shorter stubs.
6. Confirm the document remains clean. These are display controls; do not save
   or edit coordinates as part of this visual check.

## Native captures

All four captures below used an 880 × 932 viewport and the same freshly read
camera angles: X = −91.1°, Y = 1°, Z = −0.5°. The image files are unmodified
captures. Pixel comparison used the scene region x = 0–879, y = 230–899,
excluding the toolbar. Length 1.0 versus 0.5 changed 2,547 pixels around the
boundary bonds; rechecking 0.5 restored the scene region with zero changed pixels.
The unchecked state and checked 1.0 state also matched in that region.

| Checked, length 1.0 | Checked, length 0.5 |
| --- | --- |
| ![Native Si boundary bonds at 1.0](evidence/native-host-0.2.11/stubs-1.0.png) | ![Native Si boundary bonds at 0.5](evidence/native-host-0.2.11/stubs-0.5.png) |

| Stub mode unchecked | Rechecked, length 0.5 |
| --- | --- |
| ![Native Si complete half-bonds with stub mode unchecked](evidence/native-host-0.2.11/stubs-off.png) | ![Native Si short bonds restored after rechecking](evidence/native-host-0.2.11/stubs-rechecked.png) |

The [native receipt](../plugins/catgo-editor/acceptance/native-host-0.2.11.json)
records capture hashes and the tested program hash. The earlier
[browser regression receipt](../plugins/catgo-editor/acceptance/boundary-bonds-0.2.11.json)
remains unchanged as a separate historical record. No runtime files, installed
configuration or release version were changed by this acceptance update.
