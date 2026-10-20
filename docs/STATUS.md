# Current handoff

Verified against local files and user feedback on 2026-10-19. Read this after `AGENTS.md`; conversation history is not required.

## Continue here

Approved caption baseline project: **Polish Caption Style 2026-10-19T20-23-27-855Z**.

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
- Transcript-first review: new jobs pause for per-sentence edits, audio playback, acceptance/exclusion, and explicit text approval before montage. Reviewed montages have no duration limit; Aim for was removed at the user's request. Near-duplicate removal remains enabled (explicitly confirmed by the user). Short included utterances are retained. Private compressed audio proxies are uploaded to R2 with 30-day lifecycle deletion and API expiry; originals stay local/Drive. Approved edits are force-aligned to audio before captions.
- Setup and limitations: `docs/remote-control.md`. No exports/publishing or reuse of interactive connector credentials. The PC uses its own Drive desktop sync.

Validation: 8 API/inventory tests and 2 Python selector tests passed; React production build and Wrangler deployment dry run passed. Parameterized caption planning against the existing selection reproduced 272 states/29 groups/36.6 seconds under ignored `work/control-validation/`. No native project was modified or opened. Browser layout and new-batch native playback have not been verified.

Cloudflare CLI login succeeded; database creation and web-app deployment are authorized. D1 `video-workflow` (ID `52244328-8844-41ed-ac4c-3c0c48cda29d`) is bound as `DB`; migration `0001_jobs.sql` is applied. The user configured Google login, confirmed the provider test for `bezawka@gmail.com`, and reported adding an Allow policy for only that address. They selected the custom hostname `cutroom.kolodziejczyks.pl` and supplied Access audience `393e8fab50cdf6aa3310b386da2a912c0dbec54dbdb9605663927f0d75e9629d` for team `falling-thunder-f3eb.cloudflareaccess.com`.

Deployment on 2026-10-20: version `b38abfcd-eff5-4afb-b8ae-96632454f7d0`, attached custom domain https://cutroom.kolodziejczyks.pl. A Cutroom SVG favicon matching the lime brand icon is explicitly linked and deployed. Team, audience and sole-email allowlist are deployed. The old workers.dev address is disabled (HTTP 404 verified). Public DNS and HTTPS confirmed the Access redirect. Chrome Secure DNS resolved browser access and the user confirmed login. Node/system DNS resolves outside the sandbox; sandbox DNS and Drive mount access are restricted. `WORKER_TOKEN` is provisioned in Cloudflare, with its local counterpart stored in ignored `work/worker.env`. Cutroom PC service credentials are stored in ignored work/worker.env. The user configured the scoped machine Access application/policy; authenticated heartbeat returned HTTP 200 on 2026-10-20.

The user confirmed successful Google login and the first fresh batch's local CapCut playback (folder `1`, 10 videos). At the user's request, the obsolete pre-review project/job `3f340764-ed00-45b7-9981-3d0a46ac1691` was removed from CapCut through MCP and from Cutroom. Project, index and job backups are in ignored `work/removed-projects/2026-10-20T15-00-51-213Z/`; original recordings and staged job files remain. The newer post-approval job `76ad3b0b-a85b-49d5-bb17-ec51467f8af8`, project `1 - draft 76ad3b0b`, is ready and was verified preserved in both indexes. This does not approve all wording/cuts or publishing. Drive for desktop syncs `G:\Mój dysk\vids`; ignored `worker/config.local.json` points there and to Cutroom. Worker credentials stay in ignored `work/worker.env`. No worker service is installed.

Current feature: transcript review before montage. The user approved sentence-level text editing/acceptance/exclusion with audio playback, followed by explicit text approval before montage, and automatic deletion of cloud review audio after 30 days. R2 was enabled by the user; private bucket `cutroom-review-audio` exists with verified lifecycle rule `delete-review-audio-after-30-days` on `review-audio/`. Playback additionally denies expired objects after 30 days. Text, originals, native projects and local transcription caches are retained. Migration `0002_transcript_review.sql` is applied remotely. Backend/frontend deployed as version `b38abfcd-eff5-4afb-b8ae-96632454f7d0`. Updated PC worker started with `node --env-file=work/worker.env worker/run.mjs worker/config.local.json` outside the sandbox in foreground exec session 37155 and reported connected. Unauthenticated page and audio routes redirect to Access (HTTP 302 verified). The user explicitly authorized stopping/restarting the worker for this update; the idle worker from session 64360 was verified and stopped, and its lock cleared. CapCut was not closed or launched.

Validation: 11 JS API/client/inventory tests and 5 Python selector tests pass; React build passes. Real single-source processing stopped at `awaiting_review` without building/registering a draft. Local tests corrected both `podsumowania jaj` and `firmy jajowe` to user-supplied AI wording and force-aligned positive ordered word timestamps. Artifacts are ignored under `work/review-validation/` and `work/batches/00000000-0000-4000-8000-000000000001/`. These are test fixtures, not user-approved transcripts. The approved-review-to-native-project flow completed, and the user reviewed the corrected draft positively (looks way better). Phone playback/layout still needs explicit validation. This feedback is not approval to publish. A vocabulary hint improved one clip but did not solve all AI/jaj confusions; do not claim automatic recognition is fixed.

New native project builds now use the batch folder name plus ` - draft <first 8 job-ID characters>` (for example `AI news - draft 3f340764`) instead of `Recording Batch <UUID>`. This naming change is local and takes effect when the running worker starts its next builder child; no restart or web deployment is needed. Existing/staged projects and original media are not renamed. Syntax and naming checks passed. The user clarified they prefer short content-derived titles using the transcript; an editable suggested Project title in text review was proposed, but is not implemented yet.

Current correction: project `1 - draft 76ad3b0b` was missing ending clips because the reviewed selector still stopped at its legacy 45-second target (47.54 seconds selected). The selector now has no duration cutoff for reviewed jobs while retaining near-duplicate removal, with regression coverage. A separate corrected job `eb575663-be8a-4d1d-a604-caca77d4dce7` reuses the same approved transcript and exclusions; it is registered and ready as `1 - draft eb575663`, 79.1 seconds / 17 speech intervals / 677 caption states, including source 0010. Its exact intervals match the final no-limit/deduplicated selector. Existing draft 76ad3b0b is preserved. After the user fully exited CapCut, the worker safely registered the corrected project with an index backup and returned ready. The user reviewed the corrected draft positively and checkpoint 334325c was committed and pushed. At the user's next request, all 16 cuts of this corrected draft received native W lewo transitions through MCP (resource 6724227717195108867); 3 effects were shortened to fit short adjacent clips. Captions and 79.1-second duration were preserved, synchronized timelines verified, and isolated-fixture checks passed. Backup: work/transitions/2026-10-20T15-17-18-379Z/. Transition playback on this draft still needs user review. The helper and script now support seeding new drafts from the saved baseline, but the batch pipeline does not automatically apply transitions yet. CapCut was not launched or terminated by the agent.

Current review correction: native draft `1 - draft 87ec53d3` (83.44s, 7 video intervals, 687 caption states) protected speech endings by merging continuous same-source sentences and adding up to .5s trailing audio bounded by excluded/removed-duplicate intervals and source length. It received native W lewo at 4 of 6 boundaries with adequate tail; 2 stay clean. Backup: work/transitions/2026-10-20T15-25-02-835Z/. User then identified a semantic repeated take: source 0008 line 9 (bardzo dobra zmiana) followed by the fuller source 0010 line 14 (bardzo dobra decyzja plus the AI-company responsibility argument). Whole-sentence similarity did not catch the repeated opening because the second sentence contains additional content. Do not claim semantic retake detection is implemented.

The user-authorized correction excludes only line 9 and retains line 14 and all its continuation. A separate job `e8af0f24-d68d-4f3d-b961-66e51ededa05` was queued from the existing approved review with that exact exclusion; local downloaded review was checked. Build and registration completed: `1 - draft e8af0f24`, 80.33 seconds, 6 video intervals, 654 caption states. Native material verification confirms source 0008 is absent, source 0010 remains, and timeline copies match. Four margin-safe native W lewo transitions were applied, with one tight boundary left clean; backup work/transitions/2026-10-20T15-31-57-349Z/. Playback of the correction awaits user review. User confirmed CapCut closed for registration. Existing drafts are preserved. The generic selector still removes near-identical whole sentences, not semantic paraphrases. The user requested a Git checkpoint for the current favicon, transition tooling, speech-ending protection and retake correction.

Editable CapCut phone sync remains separate and unimplemented. The user confirmed the same CapCut account on PC and phone. CapCut documents uploading projects to Spaces; MCP exposes no cloud upload tool. Manual transfer compatibility has not yet been confirmed. Final native export and publishing remain unapproved. Do not launch CapCut without a user request. Commit/push these new changes only when requested.

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
