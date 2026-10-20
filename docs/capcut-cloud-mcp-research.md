# CapCut cloud MCP investigation

Checked 2026-10-20 for GitHub issue #1. Research only: no plugin installed, OAuth session created, media uploaded or native project modified.

## Verified user observations

- Manual upload of a generated Cutroom draft to Space 123 produces an editable phone project with correct playback.
- Auto-upload did not happen while CapCut was closed. Opening the PC home screen alone started uploading.
- This confirms upload initiation, not a machine-readable completion signal.

## Strongest lead: official CapCut plugin

CapCut's official page https://www.capcut.com/tools/capcut-x-codex links an installer document at https://sf16-sg.tiktokcdn.com/obj/eden-sg/962370eh7nupenuhbo/capcut_codex_plugin/SKILL.md . Its version 0.2.1 bundle was downloaded and read as data under ignored work/research/capcut-cloud-mcp/; no installer commands were executed.

The bundle configures OAuth MCP endpoint https://www.capcut.com/api/external_mcp and an identity-free resource endpoint. Its web-collaborative-editing documentation names start_stdraft_session, check_stdraft_state, get_stdraft_snapshot and push_stdraft_snapshot. First successful push creates a cloud draft; successful responses include a server version and usually the draft read back from the server. This is a documented cloud-persistence confirmation mechanism, not yet an authenticated runtime test.

New media must be uploaded and referenced through server resource identifiers. Local paths are not copied by draft push. The plugin uses STDraft, not the desktop draft_content.json format. No verified operation was found for uploading our existing desktop folder unchanged into a selected Space.

Open questions before adoption:

- Does an authenticated tool schema expose a suitable import operation and destination Space selection?
- Can our desktop edit plan be translated without losing editable Montra captions, word highlights, audio or transitions?
- Does a resulting Web cloud draft open as an editable mobile project in Space 123?
- Can OAuth and these tools run reliably from the unattended PC worker, independently of a chat session?
- Does server read-back prove both draft and media are ready for mobile use?

## Other MCP projects

- https://github.com/simopa/capcut-mcp-kit explicitly documents that save does not initiate upload; CapCut must open/close the project. macOS-focused. No solution for unattended upload confirmation.
- https://github.com/spectrika/capcut-mcp documents local project writes and explicitly disables draft upload. No cloud upload/status capability identified.
- https://github.com/iamtatenda/Capcut-MCP points to the CapCut-hosted MCP and implements video/image asset upload. Its standalone upload script returns media identifiers, not an imported editable desktop project. Its third-party upload skill requires public video assets; do not adopt that uploader for private footage without checking the actual visibility contract. The official bundle has a different, ticket-based upload implementation.
- https://github.com/Simon-del424/capcut-mate-mcp advertises Jianying draft creation and cloud video rendering. No evidence found of import to the user's international CapCut Space or mobile project availability.

## Recommendation

Evaluate the official authenticated cloud-draft tools first, with a separate test draft. Do not replace the working native pipeline or claim automatic delivery is solved. If Web/mobile compatibility or format fidelity fails, retain the demonstrated native auto-upload route and investigate an explicit upload-completion signal from the desktop app. Automatic CapCut launch/closure remains subject to repository process rules and user authorization.

## Authenticated discovery

Installed and enabled official CapCut@CapCut 0.2.1, then completed OAuth with the user's consent. The helper emitted completed success=true and exited 0. Authenticated MCP schema discovery through Codex App Server returned 28 tools, server v1.15.7 and authStatus oAuth. No token was read or printed; no cloud draft or media was created.

The live schemas confirm the four STDraft session tools above. start_stdraft_session accepts no destination argument; push_stdraft_snapshot accepts only session_id, base_package_id and stdraft_json. No native desktop-folder upload, existing-Space selection or desktop-upload-status tool is exposed in this inventory. get_stdraft_snapshot explicitly states conversion is lossy and drops features STDraft cannot express. This is not a drop-in replacement for the verified native/mobile transfer. Keep the current native builder and investigate its auto-upload completion signal; treat Web conversion as a separate fidelity experiment.

## Local upload observation

The live root index can retain empty cloud fields even after the individual draft metadata records completion. draft_meta_info.json for generated job 1cc3b0bd-abf3-48da-a8eb-7fb9664327bb contains a matching native project ID, positive cloud entry and Space IDs, and tm_draft_cloud_completed=1792522508000 (milliseconds, 2026-10-20 20:55:08 Europe/Warsaw). Its native modified/create timestamps are microseconds and predate completion. These units and meanings are observations of this installation, not an official stability contract.

The read-only checker scripts/inspect_capcut_upload.mjs reports recorded_complete with remoteAvailability=unverified. It rejects wrong identities, missing bindings, partial JSON and stale completion records. It does not infer progress/failure from absent metadata, inspect tokens or query private APIs. More trials must correlate these records with phone visibility and unfinished/failed uploads before production integration. Local paths and root indexes may move during cloud synchronization.
