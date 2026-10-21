# Native editor initialization comparison

Checked 2026-10-21 without launching, closing or controlling CapCut. Existing native projects were read only; the real-job rebuild used MCP with an explicitly created isolated draft root under ignored `work/initialization-analysis/`.

## Evidence and limits

Compared the preserved staged **AI desktop-open test 4158d719** with its registered copy that the user opened and verified on mobile. The staged project and registered project have different IDs because registration rebuilds from the same source. This is not a byte-identical before/after capture: registration, editor normalization and cloud upload all contribute changes. Existing files cannot isolate causality between these steps.

Reproducible, read-only inspection:

```powershell
$s = Get-Content work/upload-repair/desktop-open-test/state.json -Raw | ConvertFrom-Json
node scripts/inspect_capcut_initialization.mjs $s.stagedProject.destination $s.registeredProject.destination
```

The script normalizes timeline directory IDs when comparing file inventories. It reports structural counts, file sizes, hashes internally for comparison, source-file coverage and snapshot equality. It does not emit caption text, media paths or cloud IDs, and preserves large JSON integers during parsing. It never writes project files. Reports are observations, not an upload test.

| Observation | Generated | Opened and uploaded |
| --- | --- | --- |
| Video materials / existing source files / metadata path matches | 8 / 8 / 8 | 8 / 8 / 8 |
| Unique source bytes on disk | 540,300,515 | 540,300,515 |
| Text materials | 717 | 717 |
| Text tracks | 4 | 6 |
| Timeline duration, microseconds | 90,436,688 | 90,466,666 |
| Top-level content file bytes | 1,580,025 | 3,992,843 |
| Top-level snapshot equals content | yes | yes |
| Nested timeline snapshot equals content | **no** | yes |
| Nested `draft.extra` bytes | 26 | 668,628 |
| Nested material-ID mapping bytes | 65 | 47,916 |
| Recorded timeline material size | 70,776 | 544,616,816 |

Source paths already exist and appear in metadata before opening. The opened project still has empty local-ID bindings on these video materials, so assigning invented local IDs is not supported by this comparison. The recorded size is neither the sum of raw source bytes nor evidence of remote availability; no size field was fabricated.

Opening also creates top-level attachment files and binary state, adds eight entries each in six supporting material categories (canvases, placeholder information, speeds, sound-channel mappings, material colors and vocal separations), expands segment descriptors and adjusts timing. The changed track count retains all 717 text segments. These changes are correlated with initialization; none is independently established as the upload prerequisite.

The available matching `Log/VeDetector_2026-10-21T19-45-26.log` contains detector diagnostics, with no cloud status, `draft.extra` reference or error/failure marker in the targeted keyword check. No readable cloud-packaging trace was obtained from the checked log directories. No credential stores, network requests or private endpoints were inspected. Absence of useful log evidence is not evidence that an operation did not happen.

## Fixed independent defect

The native-template builder synchronized the top-level `template-2.tmp` but left `Timelines/<main-id>/template-2.tmp` containing the empty starter. The preserved staged project demonstrates this omission. The initialized copy has both snapshots synchronized.

The regression fixture now includes that nested starter snapshot. Before the fix, `node --test apps/control/tests/native-upload-snapshot.test.mjs` failed with **Nested upload snapshot still contains the empty template**. The builder, saved-font and saved-transition operations now synchronize both snapshots. The batch processor verifies both before requesting upload. Backup `.bak` files and opaque binary state are not transplanted or fabricated.

All 28 JS tests passed after the fix outside the sandbox, including Windows launcher fixtures. Sandbox rename restrictions prevented the fixture test from reaching its assertion; the outside-sandbox failing run established the actual defect before changing production code. Syntax and diff checks passed.

An offline MCP rebuild from the real job's CaptionSource then produced 725 segments (8 video plus 717 text), duration 90.436688 seconds, all eight source files present, and matching top-level content, main timeline, top-level snapshot and nested snapshot. Preserved comparison and rebuild evidence is under ignored `work/initialization-analysis/`; no live project was registered or changed.

An initial diagnostic attempt omitted creation of the override directory, causing the upstream resolver to fall back to the sandbox's virtual CapCut store and fail on rename. The probe was corrected to create its explicit staging draft root before connecting. No real desktop project store was written by that failed attempt.

## Remaining validation

The fixed snapshot is a real consistency repair, not a proven solution for automatic mobile delivery. Existing artifacts do not provide an agent-runnable test for the exact symptom (a project downloading and opening on mobile). Do not replace that test with local completion timestamps or snapshot equality. Do not copy opaque `draft.extra` or cloud identifiers from another project.

## Fresh-trial result: snapshot synchronization is insufficient

The user ran the fresh trial after checkpoint `b60a088` and reported that the video still displays **0.0 B**. Job `db7c46c3-a1c2-44d3-8a56-bfed0ae0d9df`, native project `23AC2888-13A3-4071-A079-1F2513DB3053`, has all three checked copies matching the top-level content, all eight sources present (540,300,515 bytes) and all eight matching metadata paths. Its recorded timeline material size remains zero.

The exact project nevertheless records upload completion at 2026-10-21T18:23:23Z (20:23:23 Europe/Warsaw), cloud entry `7699188455246397970` in the intended Space `7246391828080116738`. This correlates a current local completion record with a user-reported 0 B result. It is direct evidence against treating those records as a delivery success signal. No mobile download/open success was reported for this trial.

Preserved a read-only copy under ignored `work/initialization-analysis/failed-db7c46c3-a1c2-44d3-8a56-bfed0ae0d9df/native-snapshot/`, with its original build state. Structural comparison is `work/initialization-analysis/failed-db7c46c3-summary.json`. No native project was modified, app launched/closed, worker restarted or UI controlled during inspection.

Both snapshot defects remain valid consistency fixes, but neither alone nor together removes the initialization prerequisite in this trial. Do not request another identical snapshot-only trial, fabricate media sizes, transplant opaque state or label delivery fixed. The demonstrated successful route still includes desktop editor opening. Further progress requires a supported project-opening interface or separately authorized desktop interaction; current repository rules prohibit assuming that authorization.

## Authorized Computer Use opening of the same failed draft

The user explicitly authorized “Capture the CapCut window, open draft db7c46c3, and return home for automatic upload.” Computer Use restored the minimized existing CapCut window, observed the exact local card ending `db7c46c3` at 0.0 B, double-clicked it, verified the exact project name/path and populated native editor, then closed that editor using its upper-right close control. A fresh window enumeration and capture verified return to HomeWindow. No Upload button, prompt dismissal, export or publishing action was used. The existing application was not terminated and native files were not edited by repository tools.

The same card then showed **519.3M**, with native metadata reporting 544,616,830 bytes. The old completion record initially became stale relative to the editor save. At 2026-10-21T18:29:40Z the same exact native project recorded a newer automatic upload, cloud entry `7699190071919903233` in the same intended Space. The user subsequently confirmed this exact retry is working on mobile (“I already see it working. Great”). Mobile usability is therefore verified by user report; separate playback/sound checks were not specified. Its previous failed record used a different cloud entry; preserve both rather than deleting cloud copies.

This supplies a direct same-project before/after artifact comparison, stored under ignored `work/initialization-analysis/db7c46c3-after-editor-summary.json`, against the preserved failed-trial snapshot. It demonstrates one successful agent-operated desktop initialization and a subsequent local upload record. It does not establish an unattended worker integration: Qt accessibility exposes only broad window containers, so the two clicks relied on observed screenshots; neither coordinates nor transient window handles should be hardcoded into the worker.
