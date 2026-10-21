# Remote control: React + Cloudflare + Windows

The control app lives in `apps/control/`: React/Vite frontend, a Cloudflare Worker API, and D1 job storage. `worker/run.mjs` runs under the Windows user's account and polls outbound HTTPS. No inbound PC port or tunnel is required. The control app is deployed at https://cutroom.kolodziejczyks.pl. Windows Task Scheduler runs the PC worker in the signed-in user's session through `worker/start-background.ps1`.

## What the first version does

- Lists video batches found in the configured, locally synced Google Drive inbox.
- Requires a stable inventory for 30 seconds before advertising a batch. The user must still finish uploading before submitting; a pause in an upload is not proof that the upload is complete.
- Creates duplicate-protected jobs and reports processing stages, failures and project names.
- Copies originals to an isolated job directory and verifies SHA-256 hashes.
- Transcribes Polish speech locally with configurable vocabulary hints (AI by default). New jobs pause for transcript review before any montage is built. Word probabilities and possible AI/jaj confusions are exposed as review hints, not guarantees of correctness.
- Provides sentence/clause-sized text review, audio playback, wording acceptance and explicit exclusion from the montage. Save progress before leaving or switching devices; revision checks prevent stale saves. Approval requires all included sentences accepted and at least one included sentence.
- After approval, force-aligns edited wording to the original audio, retains original timing for unchanged sentences, and uses only included approved sentences for chronological selection with no duration cutoff. New reviews use explicit retake choices; older reviews retain the original near-duplicate selector. Alignment failure stops the job instead of inventing word timing. Edited review intervals longer than 30 seconds are rejected by the current aligner.
- Keeps included approved speech in recording order. For new reviews, possible retakes are suggestions resolved by the user, and Keep both is respected without later silent duplicate removal. Legacy reviews retain whole-sentence near-duplicate removal. Reviewed montages have no duration limit: the UI has no Aim for control, and later recordings must not be dropped to meet a target. Legacy jobs retain their previous target behavior. Short approved utterances are kept. Continuous same-source sentences within .65 seconds are joined, and speech gets up to .5 seconds of trailing audio, capped at the source end or an excluded/removed-duplicate interval.
- Suggests an editable topic title from included transcript words. The saved title names the native project, for example `Google i podsumowania AI - draft 3f340764`; the short job suffix distinguishes versions. Existing/staged projects retain their names. Internal job folders/media keys and original filenames remain stable.
- Creates editable Montra captions and a native template-based CapCut project through MCP. Copies the saved Montra font descriptor from the approved baseline.
- Waits for CapCut to close, backs up the project index through the native helper, then registers the new draft. It never launches or closes CapCut.
- Persists staged builds for interrupted-job retries and checks synchronized timeline copies and caption font metadata before reporting ready.

Creative notes are saved but not interpreted by this first-pass selector. Visual take ranking and semantic story assembly remain future work. A ready status means a structurally checked draft exists; native playback, new wording and cuts still need review. No exports or publishing are performed.

## Install and verify

From `apps/control/`:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run
```

If pnpm is not on PATH, use the bundled executable listed in `docs/local-setup.md`. The repo requires Node 24 for its SQLite-backed tests. The package manager allowlist permits only esbuild and workerd build scripts.

The frontend can be served with `pnpm dev`; its API needs the authenticated Worker backend. It intentionally has no fake data or production authentication bypass. `pnpm preview` runs the built Worker locally, but authenticated API tests are the supported local verification path until Access is configured. Do not launch a browser or CapCut without the user's request.

## Cloudflare deployment setup

1. Authenticate on the Windows PC using `pnpm exec wrangler login`. This is an interactive account login; do not paste account tokens into chat.
2. Create the database with `pnpm exec wrangler d1 create video-workflow`, then copy its returned database ID into `wrangler.jsonc`.
3. Apply the migration: `pnpm exec wrangler d1 migrations apply video-workflow --remote`.
4. Set a cryptographically random `WORKER_TOKEN` using `pnpm exec wrangler secret put WORKER_TOKEN`. Store the matching value in the PC user's local environment as `VIDEO_WORKER_TOKEN`; never commit it.
5. Configure Cloudflare Access with Google as an identity provider. Google setup requires an OAuth client ID and secret and Cloudflare's exact callback URL. Follow [Cloudflare's Google instructions](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/).
6. Protect the Worker's `workers.dev` hostname using Access. Allow exactly only `bezawka@gmail.com`. Set `ACCESS_TEAM_DOMAIN` to the team hostname without `https://`, and `ACCESS_AUD` to the Access application's audience tag. `ALLOWED_EMAILS` already contains the sole approved address. The Worker validates signed Access tokens, audience, issuer and email, and fails closed when settings are missing.
7. Create an Access service token/policy for `/api/worker/*` and provide `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` to the Windows worker. These machine routes also require `VIDEO_WORKER_TOKEN`; machine credentials cannot access user routes. Scope the service policy to machine routes and keep Google login on the page and user API.
8. Build and deploy using `pnpm build` and `pnpm exec wrangler deploy`. Verify unauthenticated requests cannot access the page or API, the approved Google account can log in and other accounts are denied, and worker calls reach the machine API. Use [Cloudflare's Access routing documentation](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) for hostname protection. Preview URLs are disabled.

The app reads its batches from the PC worker, not directly from the interactive Drive connector. Browser Google login does not grant Drive API access. Drive for desktop provides media access on the PC.

## Windows setup

1. Install/sign in to Google Drive for desktop. Make `vids` available offline and note its real local path.
2. Complete the existing transcription/MCP setup in `docs/local-setup.md`. Preserve the native empty template and approved Montra project. This initial processor still uses the workstation's documented native-store, font, Python and FFmpeg locations.
3. Copy `worker/config.example.json` to ignored `worker/config.local.json`. Set the deployed control URL and actual synced inbox path. Keep the processor command as `node scripts/process_batch.mjs`, or use an absolute Node executable if needed.
4. Set `VIDEO_WORKER_TOKEN`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` in the worker's local environment, then run:

```powershell
node worker/run.mjs worker/config.local.json
```

5. For automatic operation, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File worker/install-background.ps1` with the same Windows account. This installs and starts **Cutroom PC Worker**, triggered at sign-in and every minute with overlapping instances ignored and no execution time limit. It runs on battery and after missed triggers. No password or credential is stored in the task arguments: Node reads ignored `work/worker.env`. The wrapper puts its absolute Node runtime directory on the worker tree's PATH so processors and MCP can find Node outside Codex.
6. Upload one subfolder per batch, wait for sync, and submit from the control page. Windows must be awake and the user signed in for Drive and CapCut access. After logout the next sign-in starts processing again; this task does not wake a sleeping PC.

Persistent diagnostics are in ignored `work/worker-logs/supervisor.log` and per-run `worker-*.log` / `.log.stderr` files. The wrapper retains the newest 40 process log files and archives stale lock records. It reclaims a lock only when its PID is absent and no matching processor is visible; malformed locks, live PIDs and failed process inspection fail closed. Existing worker/processor processes are never stopped by the wrapper. A named mutex and the worker's exclusive lock prevent duplicate launches. If the worker exits, the next one-minute trigger starts it again; temporary Drive unavailability can therefore recover after sync starts.

To disable automatic processing, use `Disable-ScheduledTask -TaskName 'Cutroom PC Worker'`. Disabling prevents future starts but does not stop a live worker. Stop/restart a live worker only with explicit user authorization; never close CapCut as part of service maintenance. Re-running the installer updates the task without stopping an existing instance.

A new job has phase `transcribe` and releases its lease in `awaiting_review`. Approving the frozen review queues phase `montage`, which reads the staged source copies and approved wording. Legacy jobs retain their original behavior. Pending reviews count as active for duplicate protection but do not block other processing.

The worker uses a local exclusive lock and a 90-second server lease renewed every 20 seconds. Idle network/timeout/429/5xx failures retry with bounded backoff. Active-job heartbeat failures stop the processor tree and exit to protect the lease; the scheduled task restores the worker. The wrapper handles verified stale locks after a crash. An offline PC leaves pending jobs in D1. Expired running jobs can be reclaimed; jobs already marked failed need resubmission using Try again. The old files and logs remain under `work/batches/<job-id>/`.

## Before calling it ready for everyday use

Run a new recording batch end to end. Test interrupted processing, duplicate submissions, an offline PC, and an open CapCut session. Inspect the generated draft in CapCut and get feedback on cuts and captions. Local builds, API tests and FFmpeg inspection cannot establish native CapCut playback compatibility.

## Private review audio and retention

The PC creates mono MP3 proxies at 48 kbps, once per source recording. Only these review proxies are uploaded; original video stays on Drive/the PC. Cloud storage is the private R2 bucket `cutroom-review-audio`, binding `REVIEW_AUDIO`. The existing Google Access login and signed user identity protect playback; machine credentials cannot read the user playback route. Byte-range playback supports seeking on phones. Objects are capped at 20 MB per recording.

The bucket has the verified lifecycle rule `delete-review-audio-after-30-days`, prefix `review-audio/`, expiry 30 days after object creation. The playback API additionally denies access at the object's 30-day expiration even if physical lifecycle removal is still pending. Retries do not overwrite an existing object or extend its expiry. Transcript text, originals and native projects are retained. This policy covers cloud review proxies; local transcription caches remain on the PC. Playback can work while the PC is offline after upload; montage generation waits for the PC.

For a fresh account, enable R2 in the dashboard first. Provision and verify the private bucket (do not enable public access):

```powershell
node node_modules/wrangler/bin/wrangler.js r2 bucket create cutroom-review-audio
node node_modules/wrangler/bin/wrangler.js r2 bucket lifecycle add cutroom-review-audio delete-review-audio-after-30-days review-audio/ --expire-days 30 --force
node node_modules/wrangler/bin/wrangler.js r2 bucket lifecycle list cutroom-review-audio
node node_modules/wrangler/bin/wrangler.js d1 migrations apply video-workflow --remote
```

Stop/restart an existing worker only with user authorization. Deploy the new backend and restart the updated worker together: an old worker must not claim new transcript-review jobs. Frontend code is built before deployment. Browser/mobile playback and a reviewed-text native draft need user validation; unit tests and local alignment checks do not establish those outcomes.

## Retake comparisons and project titles

After preparing the review audio/text, `scripts/review_suggestions.py` runs a multilingual E5 ONNX model on the PC. Transcripts are never sent to the model provider; only the pinned model files are downloaded. Existing transcription dependencies (onnxruntime, tokenizers, numpy and huggingface_hub) are reused. Cache: ignored `work/models/retake-e5/`. Model: `Xenova/multilingual-e5-small`, revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, quantized ONNX plus tokenizer. Symmetric semantic comparisons use the documented `query: ` prefix, attention-mask average pooling and normalized vectors. Reference: https://huggingface.co/intfloat/multilingual-e5-small .

The model compares whole passages and their first 18 words, so a retaken opening with a different continuation can be suggested. At most 60 pair cards are returned; this is not exhaustive detection or an accuracy guarantee. No suggestion changes exclusions. Each card can keep one entire passage, keep both, or confirm manual exclusions. Full text and the existing audio playback are available for comparison; keeping just one passage also excludes any additional content in the other. Wording edits or manual exclusions reset affected choices. Overlapping comparisons are rechecked when exclusions actually change.

A review cannot be approved until every suggestion is resolved consistently with the included lines. Retake choices and the editable 1–80 character title are saved with the existing review revision and frozen at approval. `retakeReviewVersion: 1` tells the planner to honor these choices, including Keep both, instead of applying a second hidden near-duplicate filter. Old review records need no migration and preserve the prior selection behavior.

Title suggestions are lightweight extractive topic labels using included words, not generated factual summaries. The user can write a natural title or regenerate the suggestion after corrections/exclusions. The filename-safe approved title is read from `approved-review.json` by the native builder. Retake resolution, title changes and wording share the existing optimistic revision check. No new database migration, worker restart or CapCut launch is needed for this feature; future processor children read the updated scripts. Existing completed reviews/projects are unchanged. Start a new transcription to use the new suggestions.

## Remove test drafts

Choose Remove draft on a job and confirm the named project. The API queues phase delete; only workers advertising project-removal-v1 can claim it. Running generation is protected. The PC waits for CapCut to close without stopping it, verifies the exact registered identity and native-root path, and backs up the project/index under work/removed-projects/<job-id>/ before calling capcut_delete_project through MCP. Protected templates and the caption baseline cannot be removed.

The entry stays visible until native deletion is verified, then is hidden from the overview. Failures retain a retry action; repeated requests are idempotent. An offline PC leaves deletion queued. Originals, staged media, local backups and stored transcripts remain; cloud review audio follows its normal 30-day retention. This is not a backup purge or an undo UI. No database migration is required. Restart the PC worker with explicit authorization when deploying this worker capability.

## Native cloud upload observations

Migration 0003_upload_observations.sql stores per-job observations separately from generation status and leases. The idle PC worker checks ready jobs every heartbeat against their registered project IDs and native draft_meta_info.json. The API accepts only unverified or recorded_complete for ready jobs. The UI shows Upload unverified / Upload recorded complete, with the observation time and a stale-check warning. This is local CapCut evidence, not a remote phone availability check. A successful generation alone is never an upload confirmation. Missing/moved/malformed metadata remains unverified.

Set autoOpenCapCut=true in ignored worker/config.local.json to request the CapCut home screen through MCP after a newly generated draft is registered. Existing running CapCut is left alone. Failure to launch does not fail or delete a successfully generated draft; inspect work/batches/<id>/upload-launch.log. Native auto-upload must already be enabled in CapCut.

The launcher records the exact process PID/start time and job ID in ignored work/capcut-upload-owner.json only when it launches CapCut itself. The **Cutroom Upload Cleanup** scheduled task runs scripts/finish_capcut_upload.mjs at sign-in and every minute. After the exact registered project's metadata records upload completion and a 30-second settling period passes, it requests a graceful CloseMainWindow only for that same process, with exactly one CapCut window titled CapCut and no native project .locked markers. Identity and editing guards are rechecked in the close operation. It never force-kills the application or dismisses prompts. A manually opened/restarted app, missing ownership, pending upload, or visible editing state is left alone. A close request that fails to exit stays pending for later checks; inspect work/worker-logs/upload-cleanup.log. The owner file is removed only after verified exit. This observes local CapCut upload records, not remote phone availability. Registration/removal still waits for all CapCut processes to exit.

worker/install-background.ps1 installs both tasks without stopping an existing worker. Both actions use Windows Script Host (wscript.exe) and worker/launch-background.vbs, which launches the supervisor or cleanup with window style 0 and waits for its exit. This avoids allocating a visible console at each one-minute trigger; PowerShell's own WindowStyle Hidden alone can still flash during startup. Windows Script Host must be enabled. The waiting launcher preserves Task Scheduler overlap protection and child exit status. Disable cleanup with Disable-ScheduledTask -TaskName 'Cutroom Upload Cleanup'. Restart an existing worker only with explicit user authorization.
