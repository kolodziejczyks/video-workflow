# AiPersonacademy CapCut MCP test

Tested 2026-10-19, upstream commit `37e526dfbe427cb71abafe08b799519e42c4105a`.
Source: https://github.com/AiPersonacademy/capcut-mcp

The source was downloaded into ignored `work/aiperson-capcut-mcp`, dependencies installed from its imported lock with lifecycle scripts disabled, and TypeScript compilation passed. No global MCP registration was made. No desktop control was used. All test writes were redirected with `CAPCUT_DRAFTS_PATH` to an isolated workspace directory, not the actual CapCut project store.

## Actual protocol results

The real stdio MCP handshake and tool discovery passed: 24 tools are exposed. MCP calls successfully created and listed a project, added two still images to its timeline, saved a Polish text overlay, imported Polish SRT, changed a clip transform, and read back the saved project. Polish diacritics survived in saved native text materials. This verifies the protocol and JSON-writing behavior, not rendering compatibility in CapCut 9.6.0.4097.

Media probing and audio insertion failed because `ffprobe` is missing. Preview generation reached the existing CapCut FFmpeg executable but failed because that build lacks `libx264`. Real video insertion therefore remains unverified in this environment. Image insertion succeeded through the server's fallback metadata path.

## Tool coverage

- Projects: list, read, create, duplicate, delete; an app-launch tool also exists but was not invoked.
- Timeline: add video/images, trim, split, remove, transform and speed changes.
- Motion: keyframes, stickers and transitions.
- Text: text overlays, SRT subtitle import and styled caption construction.
- Audio: audio/music tracks, sound effects and fades.
- Utilities: media metadata, proxy preview and a combined video/audio/subtitle bridge.

There is no built-in speech recognition, semantic highlight ranking, publishing integration or native CapCut export tool in the 24-tool catalog. Those stages need separate tooling or a user action.

## Source limitations relevant to this workflow

1. `createTransitionMaterial` generates a random hex value for both `effect_id` and `resource_id`; the transition name does not resolve a real effect resource. Two MCP calls requesting the same Dissolve produced unrelated random IDs. A success response establishes that a transition record was written, not that CapCut can render that effect.
2. The proxy renderer ignores native text and transition materials. It only collects audio from separate audio tracks, so embedded speech on a video clip is not included. It cannot verify the complete talking-head edit even after FFmpeg dependencies are supplied.
3. Many draft edits use direct file writes rather than atomic replacement/backups. Lock-file checks exist, but there is no comprehensive process-running save guard like the previously inspected server.

The server is a useful prototype for programmatic timeline construction but is not validated for production in this installation. Preserve source recordings and test only disposable projects until actual CapCut loading/export is verified by the user.

## Reproduction

`node scripts/test_aiperson_mcp.mjs` exercises the actual MCP protocol using this checked-out server. It writes a fresh timestamped test directory under `work/aiperson-mcp-test/` and a detailed `report.json`. It does not invoke the app-launch or deletion tools.

First report: `work/aiperson-mcp-test/2026-10-19T20-05-01-529Z/report.json`.

## Follow-up compatibility test

Downloaded portable FFmpeg/ffprobe from Gyan's Windows build linked by ffmpeg.org, verified the archive against its published SHA-256, and extracted it under ignored `work/tools/`. No system PATH change was made.

- The unchanged upstream compiled suite passes all 21 reported tests using these dependencies.
- Actual stdio MCP calls now pass for real MOV probing, two video insertions, splitting, transforms, Polish SRT import, separate audio insertion, audio fades, and two proxy renders.
- A 10.4-second generated timeline preserves the 0.1-second source in-point, resolves every segment material, has nonnegative source ranges, and retains Polish diacritics. The original saved CapCut draft's SHA-256 is unchanged.
- Comparing against the actual 9.6 draft: native `new_version` is `189.0.0`; the generated draft declares `185.0.0` and app `9.4.0`. All native top-level keys are present in the generated draft, but its materials omit `ai_generate_holders`. These differences alone do not establish whether CapCut can load it.
- The video-only proxy contains no audio despite both videos carrying speech. A second proxy contains audio after an explicit audio-track insertion and passes full decoding. This confirms the previously identified preview limitation.

Real-media protocol report: `work/compatibility/2026-10-19T20-07-46-973Z/report.json`.

`node scripts/test_capcut_compatibility.mjs` repeats the isolated test. Adding `--register-test` prepares a new disposable 10.4-second project in the real CapCut project store through MCP, first checking the CapCut process and backing up the project index. The attempted registration was stopped by this guard because CapCut is running; no native project/index write occurred. The user must close CapCut first. Actual opening, playback, captions and export in 9.6 remain unverified; no desktop control will be used.

## Actual CapCut opening result and native-template repair

The subsequently registered 28-file project was rejected by CapCut with the user's screenshot: “Nie udało się użyć projektu … Obecny projekt pochodzi z nietypowej ścieżki i nie może być teraz użyty.” This is an actual compatibility failure for the upstream-generated project; the earlier software tests did not establish app compatibility.

The generated project omitted the real 9.6 template's native timeline directory and supporting files. A local MCP repair extension now clones the empty `1019` native project, remaps project/timeline IDs and paths, transplants the 28 source segments/materials, and synchronizes top-level and timeline draft JSON. It retains native version `189.0.0` and app version `9.6.0`. This addresses structural differences; the cause of the CapCut error is not definitively established.

The extension is implemented in `scripts/capcut_native_template.mjs` and exposed through a local change to the downloaded server's `src/index.ts` as `capcut_rebuild_from_native_template` (25 tools with this extension). `scripts/repair_capcut_project.mjs` invokes it over real MCP stdio. The patch is local and is not an upstream feature.

After explicit user authorization to stop CapCut's background process, a separate project was registered: `Polish Samples 96 Repair 2026-10-19T20-15-47-425Z`. All 28 clips resolve to existing sources; the main timeline ID matches the top-level content ID; timeline copies are identical. The failed project and pre-registration index were backed up under `work/native-repair/2026-10-19T20-15-47-425Z/backup/`. The original `1019` project was not edited.

The repaired candidate still requires the user to open it in CapCut. Do not report compatibility as passed until that check succeeds.
