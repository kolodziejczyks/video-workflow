# Current handoff

Verified against local files and user feedback on 2026-10-19. Read this after `AGENTS.md`; conversation history is not required.

## Continue here

Active CapCut project: **Polish Caption Style 2026-10-19T20-23-27-855Z**.

It is a 36.6-second native 9:16 draft with seven selected video intervals, 29 caption phrase groups and 272 editable text states. All captions use CapCut's **Montra Regular**, resource `7462281584457125126`. White uppercase letters, dark outline/shadow, chest-level placement, and purple `#8000EE` active-word boxes reproduce the supplied reference treatment. The user reviewed this result and said it looks great. Retain this caption baseline.

| Item | Status |
| --- | --- |
| Native project opening, playback, speed, sound | User confirmed working |
| Subtitle wording | Approved for the existing draft; new transcripts still need review |
| Montra caption appearance | User reviewed positively; accepted baseline |
| Montage/cuts | Not approved; user previously disliked the montage |
| Black flashes at cuts | Removed; do not reintroduce edge fades |
| Native transition | User selected “W lewo”; two app-saved instances copied through MCP to all six cuts (~0.47s). New instances await playback review. |
| Final CapCut export and publishing | Not tested/approved; destination accounts unspecified |

The next unresolved creative work is montage review/refinement. Do not redo the font, infer montage approval, publish, or restart setup simply because a new agent takes over.

## Local assets and projects

- Repository: `C:\code\video-workflow`; GitHub SSH origin `git@github.com:kolodziejczyks/video-workflow.git`. SSH push is verified. Use Git status/log and the remote branch to check the latest checkpoint; commit/push only when requested.
- CapCut executable: `C:\Users\bezaw\AppData\Local\CapCut\Apps\9.6.0.4097\CapCut.exe`.
- Draft root: `C:\Users\bezaw\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft`.
- The active project above is a subfolder of that draft root.
- `1019` is the empty app-authored 9.6 template. Preserve it. Its top-level and native timeline files are the scaffold for new drafts.
- `Polish Samples 96 Repair 2026-10-19T20-15-47-425Z` is the working 28-file import used to establish playback compatibility.
- `Polish Samples 2026-10-19T20-12-27-560Z` is the failed upstream-generated project. Do not use it as the working draft or template.
- `samples/` contains 26 raw MOV takes plus two `copy_*.mov` reference exports (28 files, about 4m12s including references). The two reference exports show the same caption treatment in sampled frames; they are not raw source footage.
- Local transcripts: `work/transcripts/`. The local edit plan used by scripts is `work/plans/full.json`; its seven source intervals are also preserved in tracked `config/current-edit-plan.json`.
- Current build state: `work/reference-style/build-2026-10-19T20-23-27-853Z/state.json`. This predates the Montra switch: use the active native project's saved content as the latest visual state.
- Pre-Montra project backup: `work/font-change/2026-10-19T20-33-12-779Z/project-before-font-change/`. Other operation backups remain under `work/`.

Montra font file:
`C:\Users\bezaw\AppData\Local\CapCut\User Data\Cache\effect\7462281584457125126\6667874da3a7ce4e77b7c2fed5055c3a\font.ttf`.
The font filename is generic; its internal family name and saved CapCut descriptor identify Montra. Do not substitute the earlier Montserrat approximation.

## Tooling facts and constraints

- Use the local AiPersonacademy MCP checkout at pinned commit `37e526dfbe427cb71abafe08b799519e42c4105a` plus the tracked patch. It currently exposes 28 tools (24 upstream + 4 local). Scripts invoke real stdio MCP calls; there is no global MCP registration.
- Upstream from-scratch generation was rejected by CapCut as an “unusual path”. Native-template rebuilding fixed opening/playback; use that approach. Native main-timeline and top-level content must stay synchronized.
- Upstream transition/sticker code invents resource IDs. Do not treat an OK response as a working CapCut resource. Its FFmpeg preview ignores text/transitions and embedded video audio, so it cannot verify the finished edit.
- `capcut_apply_saved_transition` clones the app-saved “W lewo” material, resource `6724227717195108867`. Two instances retained, four added. Backup: `work/transitions/2026-10-19T21-04-40-925Z/project-before-transitions/`.
- Transcription is local faster-whisper; highlight selection/edit decisions are made by the agent, not an unattended selector. No publishing integration or native export automation is implemented.
- Several scripts contain workstation/project-specific paths. Some do not enforce the CapCut-running check internally. Follow `AGENTS.md` and the setup instructions before any native-store write.
- Source recordings, native projects, transcripts, models, downloaded tools/fonts and backups are local and ignored. A Git clone alone does not restore them.
