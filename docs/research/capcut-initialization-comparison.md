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

The next useful end-to-end trial is one fresh build with both snapshots synchronized, followed by home-screen-only automatic upload and a single mobile download/open verification. This session did not authorize a new app launch or UI automation. The user need not repeat the earlier opening-only trial or monitor intermediate local checks.
