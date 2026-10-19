# Local setup checkpoint

This is a workstation-specific prototype. No footage, generated native project, transcription model, font binary, tool binary, dependency directory or credential is committed.

## CapCut MCP source

- Repository: https://github.com/AiPersonacademy/capcut-mcp
- Tested commit: `37e526dfbe427cb71abafe08b799519e42c4105a`
- Local checkout: `work/aiperson-capcut-mcp/`
- Install dependencies from its package lock (the current machine used `pnpm import` followed by `pnpm install --frozen-lockfile --ignore-scripts`).
- Apply `patches/aiperson-local-tools.patch` inside that checkout using `git apply --unidiff-zero <absolute-patch-path>` and build with its TypeScript compiler.
- The local patch adds three MCP tools: native-template rebuilding, reference text styling, and applying a saved CapCut font. Set `CAPCUT_NATIVE_HELPER` to the file URL of `scripts/capcut_native_template.mjs`.
- Tests and build scripts launch this server directly over stdio using its SDK client. No global MCP registration has been made.

The tracked patch is necessary: cloning upstream alone does not supply the tools used by the repair/style scripts. Review the source and apply the patch only to the pinned revision.

## Media and transcription dependencies

- Working Python is bundled with the app. Its `.venv` contains `requirements-transcription.lock.txt`; the bundled Python also provides Pillow for frame/font analysis scripts.
- Portable FFmpeg/ffprobe are under `work/tools/ffmpeg-essentials/ffmpeg-9.0.2-essentials_build/bin/`, downloaded from https://www.gyan.dev/ffmpeg/builds/ (linked by https://ffmpeg.org/download.html). The downloaded zip was checked against its published SHA-256. These tools are added only to child-process PATH values.
- Whisper's downloaded small model is under `work/models/`.
- Montserrat Black and its OFL license are under `work/fonts/`. Font source: https://github.com/JulietaUla/Montserrat.

## Data needed to repeat the style experiment

Keep recordings in ignored `samples/`. Run the inspection and transcription scripts to generate the local inputs. The experimental edit selection is currently in ignored `work/plans/full.json`; it contains selected source filenames with `in`, `out` (seconds), and `reason` fields inside a `clips` array. Keep that plan with the local footage. It is not an approved montage.

`plan_reference_captions.py` writes `work/reference-style/caption-plan.json`. `build_reference_style_project.mjs` creates an isolated editable draft; `--publish <build-directory>` registers a separate native-template project after the app has been closed. The current automation scripts assume Windows and several explicit paths for this workstation.

## Native template and app checks

The empty app-authored template is `1019` in the actual CapCut draft store. Its schema/layout is preserved by the repair helper; original media tracks are added through MCP. User-confirmed playback compatibility applies to the repaired 28-file project. It does not automatically validate new text styling, effects, transitions or exports.

Never run registration while CapCut is running. Some entry scripts have process guards, but this is not enforced universally by every helper/tool. Check the process first and preserve explicit user authorization for closing it. Backups are written beside each build under ignored `work/`.
