# Google Drive recording inbox

Upload recordings to [vids](https://drive.google.com/drive/folders/1Gnbuq3g6SfZckD7iBWGmRWacWK0vgCnW). The folder was verified through the connected Drive account on 2026-10-19 and was empty. Its configuration is in `config/drive-inbox.json`; it contains no credentials.

## First batch

1. Create a subfolder inside `vids`, for example `2026-10-20-topic`.
2. Upload the original recordings for one finished video into that subfolder. Keep reference exports in a separate folder.
3. Wait until all uploads finish.
4. In this chat, request: “Process the Drive batch 2026-10-20-topic into a CapCut draft.” Include a target length or creative brief if relevant.

The [React control page and Windows worker](remote-control.md) now implement remote submission and first-pass batch processing locally. Cloudflare deployment, Google Access configuration, Drive desktop sync and an end-to-end test are still required. No worker service or scheduled job is installed. Uploading alone does not start processing. A chat request can still be used for agent-guided work, but chat is not yet connected to the remote job API.

## Processing contract

The implemented remote path uses Drive for desktop to sync files. The PC worker advertises stable local subfolders, stages files under an isolated, ignored `work/batches/<job-id>/` folder, and verifies copied media hashes. Cloudflare stores job metadata only. Do not delete or move uploads. Direct intake through the connected Drive tools remains an alternative for agent-guided runs; ground source metadata and use authenticated raw fetches in that path.

The batch processor transcribes Polish speech locally with word timings, creates a conservative chronological speech edit plan, and assembles a separate native CapCut draft through MCP from the empty 9.6 template. It uses per-job paths rather than the old edit plan and seeds the native Montra font descriptor from the accepted baseline. Semantic story selection and visual take ranking are not yet implemented.

New caption wording and montage remain unreviewed. Before registering a draft, confirm CapCut is closed and back up the project index. Never close the application automatically. Export and publishing require separate approval.

## Standalone jobs

The Windows worker uses the signed-in Drive desktop sync and its own Cloudflare machine credentials. It does not extract credentials from the interactive connector. Keep credentials outside Git. Validate the foreground worker end to end before installing it as a scheduled task.
