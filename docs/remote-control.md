# Remote control: React + Cloudflare + Windows

The control app lives in `apps/control/`: React/Vite frontend, a Cloudflare Worker API, and D1 job storage. `worker/run.mjs` runs under the Windows user's account and polls outbound HTTPS. No inbound PC port or tunnel is required. This is prepared locally, not deployed or installed as a background service.

## What the first version does

- Lists video batches found in the configured, locally synced Google Drive inbox.
- Requires a stable inventory for 30 seconds before advertising a batch. The user must still finish uploading before submitting; a pause in an upload is not proof that the upload is complete.
- Creates duplicate-protected jobs and reports processing stages, failures and project names.
- Copies originals to an isolated job directory and verifies SHA-256 hashes.
- Transcribes Polish speech locally, keeps speech segments in recording order, removes near-duplicates, and uses a soft duration target without truncating the final selected segment.
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

5. Upload one subfolder per batch, wait for sync, and submit from the control page. Start with the foreground worker for validation. Installing it with Windows Task Scheduler is a later setup step after successful end-to-end testing, using the same Windows account and environment.

The worker uses a local exclusive lock and a 90-second server lease renewed every 20 seconds. On heartbeat failure it stops its processor tree and exits; restart after resolving the connection. After a crash, confirm no worker/processor is running before removing `work/batches/worker.lock`. An offline PC leaves pending jobs in D1. A failed job can be loaded into the form and submitted as a new attempt; the old files and logs remain under `work/batches/<job-id>/`.

## Before calling it ready for everyday use

Run a new recording batch end to end. Test interrupted processing, duplicate submissions, an offline PC, and an open CapCut session. Inspect the generated draft in CapCut and get feedback on cuts and captions. Local builds, API tests and FFmpeg inspection cannot establish native CapCut playback compatibility.
