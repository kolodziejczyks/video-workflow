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

## Next workflow: uploaded recording batches

The user wants to upload recordings from their phone and trigger a script/job to generate a montage and captions. They selected **Google Drive** as the upload inbox: [vids](https://drive.google.com/drive/folders/1Gnbuq3g6SfZckD7iBWGmRWacWK0vgCnW), ID `1Gnbuq3g6SfZckD7iBWGmRWacWK0vgCnW`. Connector metadata verified it as a folder on 2026-10-19; listing returned no children. Use one subfolder per video. The user selected **React**, their own **Cloudflare** account with a supplied `workers.dev` hostname, and **Google login** allowing only `bezawka@gmail.com`.

Implemented locally:

- `apps/control/`: responsive React/Vite control page; signed Access JWT/email validation; D1 migrations; duplicate-protected job submission; atomic leases and job progress; machine authentication. Production fails closed until Access is configured.
- `worker/`: local Drive desktop inbox inventory, 30-second stability check, isolated/hash-verified copies, one-worker lock, outbound polling, progress/lease renewal and processor execution. No worker service is installed.
- `scripts/process_batch.mjs` and `scripts/plan_batch.py`: parameterized transcription/caption pipeline, conservative chronological speech selection with near-duplicate removal, staged native MCP builds, saved Montra descriptor, wait for closed CapCut and backed-up registration. Creative notes are saved but not interpreted; semantic montage and visual take ranking remain future work.
- Setup and limitations: `docs/remote-control.md`. No media upload to Cloudflare, no exports/publishing, no reuse of interactive connector credentials. The PC uses its own Drive desktop sync.

Validation: 8 API/inventory tests and 2 Python selector tests passed; React production build and Wrangler deployment dry run passed. Parameterized caption planning against the existing selection reproduced 272 states/29 groups/36.6 seconds under ignored `work/control-validation/`. No native project was modified or opened. Browser layout and new-batch native playback have not been verified.

Cloudflare CLI login succeeded; database creation and web-app deployment are authorized. D1 `video-workflow` (ID `52244328-8844-41ed-ac4c-3c0c48cda29d`) is bound as `DB`; migration `0001_jobs.sql` is applied. The user configured Google login, confirmed the provider test for `bezawka@gmail.com`, and reported adding an Allow policy for only that address. They selected the custom hostname `cutroom.kolodziejczyks.pl` and supplied Access audience `393e8fab50cdf6aa3310b386da2a912c0dbec54dbdb9605663927f0d75e9629d` for team `falling-thunder-f3eb.cloudflareaccess.com`.

Deployment on 2026-10-20: version `539295bf-6a70-4e94-9fa1-9c4941d4e7f2`, attached custom domain https://cutroom.kolodziejczyks.pl. Team, audience and sole-email allowlist are deployed. The old workers.dev address is disabled (HTTP 404 verified). Public DNS and HTTPS confirmed the Access redirect. Chrome Secure DNS resolved browser access and the user confirmed login. Node/system DNS resolves outside the sandbox; sandbox DNS and Drive mount access are restricted. `WORKER_TOKEN` is provisioned in Cloudflare, with its local counterpart stored in ignored `work/worker.env`. Cutroom PC service credentials are stored in ignored work/worker.env. The user configured the scoped machine Access application/policy; authenticated heartbeat returned HTTP 200 on 2026-10-20.

The user confirmed successful custom-domain Google login. They installed Drive for desktop and made the inbox available at `G:\Mój dysk\vids`; read access to the mount was verified outside the sandbox. Ignored `worker/config.local.json` now points to that path and https://cutroom.kolodziejczyks.pl. The PC worker is running in foreground exec session 64360, launched outside the sandbox with node --env-file=work/worker.env worker/run.mjs worker/config.local.json; it reported connected and is polling. No worker service is installed. The inbox was empty on 2026-10-20. Next: upload a fresh batch as a subfolder of vids, wait for sync and inventory stability, submit it in Cutroom, and test end to end. Check the existing worker/lock before starting another process. Keep Google/Cloudflare secrets out of chat. The local design preview runs on port 5174 outside the sandbox; development mode shows a preview banner and does not call the unconnected API. Nine JS tests and two Python tests pass after that fix. The user reviewed the UI positively. Do not launch CapCut without the user's request. New wording/cuts and final native export still need separate review. The user authorized committing and pushing the remote-control implementation on 2026-10-20.

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

- Matt Pocock's 27 published engineering/productivity skills are installed in `C:\Users\bezaw\.codex\skills` from commit `5beb35b040e3de97e54fa9e386d7e42d15c295c2`. Repository configuration is approved and saved in `docs/agents/`, with pointers in `AGENTS.md`: GitHub Issues, five default triage labels, single-context domain docs. GitHub label creation remains pending: the connector exposes no repository-label creation tool, `gh` is unavailable, and Git's credential helper returned no existing HTTPS credential. The user has already authorized creating missing labels; do not ask again once an authenticated route is available.

- Use the local AiPersonacademy MCP checkout at pinned commit `37e526dfbe427cb71abafe08b799519e42c4105a` plus the tracked patch. It currently exposes 28 tools (24 upstream + 4 local). Scripts invoke real stdio MCP calls; there is no global MCP registration.
- Upstream from-scratch generation was rejected by CapCut as an “unusual path”. Native-template rebuilding fixed opening/playback; use that approach. Native main-timeline and top-level content must stay synchronized.
- Upstream transition/sticker code invents resource IDs. Do not treat an OK response as a working CapCut resource. Its FFmpeg preview ignores text/transitions and embedded video audio, so it cannot verify the finished edit.
- `capcut_apply_saved_transition` clones the app-saved “W lewo” material, resource `6724227717195108867`. Two instances retained, four added. Backup: `work/transitions/2026-10-19T21-04-40-925Z/project-before-transitions/`.
- Transcription is local faster-whisper; highlight selection/edit decisions are made by the agent, not an unattended selector. No publishing integration or native export automation is implemented.
- Several scripts contain workstation/project-specific paths. Some do not enforce the CapCut-running check internally. Follow `AGENTS.md` and the setup instructions before any native-store write.
- Source recordings, native projects, transcripts, models, downloaded tools/fonts and backups are local and ignored. A Git clone alone does not restore them.
