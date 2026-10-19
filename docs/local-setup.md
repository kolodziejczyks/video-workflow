# Local setup and commands

Read `AGENTS.md` and `docs/STATUS.md` first. This is a Windows workstation prototype, not a portable packaged application. Do not rebuild or overwrite the working project to re-establish setup.

## Runtime paths

- Node: available as `node` in this session.
- Bundled pnpm: `C:\Users\bezaw\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd` (use its full path if `pnpm` is not on PATH).
- Python with Pillow: `C:\Users\bezaw\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.
- Transcription Python: `.venv\Scripts\python.exe`; dependencies are pinned in `requirements-transcription.lock.txt`.
- Portable FFmpeg/ffprobe: `work\tools\ffmpeg-essentials\ffmpeg-9.0.2-essentials_build\bin\`. Downloaded from Gyan's build linked by ffmpeg.org and checksum-verified. Use this build, not CapCut's limited bundled FFmpeg. Add it only to child-process PATH.
- Whisper small model: `work/models/`.
- CapCut native template/project store and downloaded Montra font: exact paths are in `docs/STATUS.md`. `%LOCALAPPDATA%` can resolve inside a sandbox, so use the explicit draft-root path.

## MCP checkout

The installed source is `work/aiperson-capcut-mcp/`, from https://github.com/AiPersonacademy/capcut-mcp at commit `37e526dfbe427cb71abafe08b799519e42c4105a`.

Only if the checkout is missing, clone that repository into this path and check out the pinned commit. Install its locked dependencies (`pnpm import`, then `pnpm install --frozen-lockfile --ignore-scripts`), apply the local patch, and compile. From inside the checkout:

```powershell
git apply --unidiff-zero ../../patches/aiperson-local-tools.patch
node node_modules/typescript/bin/tsc
```

Do not apply the patch twice. The SDK imports in our scripts require the checkout's installed `node_modules`.

Set `CAPCUT_NATIVE_HELPER` to the file URL of `scripts/capcut_native_template.mjs` when launching the server. Our Node entry scripts do this themselves. The patch adds native-template rebuilding, reference-text styling, saved-font application and saved-transition replication. There are 28 tools total. No global MCP registration or restart is required for these stdio scripts.

## Current entry points

| Script | Purpose / inputs |
| --- | --- |
| `preflight.ps1 -DraftRoot <actual-path>` | Read-only tool and draft check; PATH-only results can miss bundled tools, and sandbox process visibility can be incomplete |
| `inspect_samples.py --ffmpeg <exe>` | Inventory and contact sheet from `samples/` |
| `transcribe_samples.py --ffmpeg <exe>` | Local Polish transcripts, word timings and SRT under `work/transcripts/`; reuses matching source-hash/model outputs |
| `analyze_reference_captions.py` | Samples both `copy_` references; expects portable FFmpeg at the path above |
| `plan_reference_captions.py --font <Montra-font-path>` | Creates caption layout using `work/plans/full.json` and transcripts; always pass Montra, since its default is the old Montserrat fallback |
| `build_reference_style_project.mjs` | Creates a new isolated MCP project from the caption plan, then wraps it in the native template |
| `build_reference_style_project.mjs --publish <build-dir>` | Registers a separate new project in the real CapCut store; no internal process guard, so check that CapCut is closed first |
| `apply_saved_caption_font.mjs` | Applies the saved Montra descriptor and reflows text in the specific active project; has a process guard and full backup |
| `apply_saved_transition.mjs` | Copies the app-saved transition to remaining cuts in the active project; preserves existing instances, checks the process and makes a full backup |
| `capcut_native_template.mjs` | MCP helper module; not a standalone command |

Before planning on a fresh checkout, create `work/plans/` and copy `config/current-edit-plan.json` to `work/plans/full.json`. The tracked selection is experimental and has no montage approval. Recordings, transcripts, fonts and the native template must also exist locally.

The builder's basic text-style helper still labels text with the initial Montserrat approximation; it does not propagate CapCut's saved Montra resource ID. For the existing project, use the saved-font tool. For a new project, parameterize/adapt that tool's currently hardcoded project path and seed it with a saved Montra descriptor before claiming the approved native style is reproduced. Do not rerun the builder expecting it to preserve manual changes to an existing project.

## Validation and writes

Use syntax checks and the upstream suite when code changes justify them. The upstream suite can be run with `node --test dist/tests/draft-builder.test.js` inside the built checkout, with portable FFmpeg/ffprobe on that child process's PATH. Its 21 tests passed; they do not establish native rendering compatibility.

Before native-store writes, confirm CapCut is closed, preserve backups, and use MCP. Never stop an active editing window without explicit authorization. User feedback already confirms the active native project's playback and Montra appearance; only new changes need fresh review. Exports and publication have separate approval requirements.
