# CapCut desktop draft initialization

Checked 2026-10-21. Research only: no app launch, UI automation, credential inspection, native project writes or upload was performed.

## Result

No documented, supported way was found to open an exact existing local Windows draft in the desktop editor without user interaction. This is a bounded research result, not proof that CapCut has no internal entry point. Retain the native builder and distinguish an app launch from editor initialization.

The user verified that opening a generated draft in desktop CapCut enabled automatic upload, then verified download and editor opening on mobile. That is stronger evidence than the earlier home-screen-only observation, but does not establish an unattended initialization interface. Source: the current user instruction; earlier observations are recorded in [the handoff](../STATUS.md) and [cloud MCP research](../capcut-cloud-mcp-research.md).

## Official supported workflows

CapCut's help describes opening a saved desktop project by choosing it in Projects or Spaces and clicking it. It also states that projects must be uploaded to Spaces for cross-platform use. This documents the interactive workflow, not a command-line or local-draft URI contract. [CapCut: modify a historical task](https://www.capcut.com/help/modify-history-task).

The official transfer guide describes selecting Spaces, choosing Upload, selecting a local video or CapCut project, and uploading it. It supplies no desktop automation endpoint or initialization switch. [CapCut: share large video files](https://www.capcut.com/resource/how-to-share-large-video-files).

The official CapCut × Codex page advertises editable drafting and links its plugin installer. Its public text does not document opening an arbitrary registered native Windows draft by ID/path. The authenticated inventory already inspected in this repository exposes Web STDraft persistence but no native-folder import, destination-Space selection or desktop initialization tool; conversion read-back is explicitly lossy. The marketing phrase about uploading an existing draft is insufficient to infer an undocumented tool. [CapCut × Codex](https://www.capcut.com/tools/capcut-x-codex); [local authenticated inventory findings](../capcut-cloud-mcp-research.md).

## Installed and upstream interfaces

The pinned AiPersonacademy MCP launcher calls `spawn(exePath, [])` for an ordinary app launch. Its project-specific operation instead opens the draft directory in Explorer. Consequently `capcut_open_app({project_name_or_id})` cannot initialize that draft in the editor, regardless of the tool name. This was checked in the installed source and its owning upstream source at the pinned commit. [Pinned app-launcher.ts](https://github.com/AiPersonacademy/capcut-mcp/blob/37e526dfbe427cb71abafe08b799519e42c4105a/src/capcut/app-launcher.ts); [pinned tool registration](https://github.com/AiPersonacademy/capcut-mcp/blob/37e526dfbe427cb71abafe08b799519e42c4105a/src/index.ts#L428).

The parent investigation read the installed CapCut 9.6 first-party `Resources/common_agent/skills/timeline-draft-cli/SKILL.md`. It explicitly excludes “opening/replacing a project” and requires the current native-open project plus a host-injected session. This is an editor-session interface, so it does not solve the preceding initialization step. Its package manifest lists the skill; no CLI was executed and no session capability was reconstructed. Local source: `C:/Users/bezaw/AppData/Local/CapCut/Apps/9.6.0.4097/Resources/common_agent/skills/timeline-draft-cli/SKILL.md`.

The parent investigation also read the current user's Windows protocol registration. `capcut` is registered under HKCU, with a shell-open command targeting the installed CapCut bootstrap executable and forwarding a URI argument. This establishes handler registration only. It does not document a route, argument schema, native-draft ID semantics, callback or success condition. No URI was invoked. Local source: `HKCU\Software\Classes\capcut\shell\open\command`.

## Deep-link limitations

Official template help is inconsistent: one page describes launching desktop templates from TikTok Web, while two other pages call template deep linking mobile-only. These pages address templates, not an existing local native project, and publish no usable local-draft route. Do not derive `capcut://...draft_id=...` or command-line switches from these examples. [TikTok anchor-point templates](https://www.capcut.com/help/video-with-tiktok-points), [template switch failure](https://www.capcut.com/help/templates-switch-fails), [template jump exception](https://www.capcut.com/help/template-jump-exception).

A separate third-party MCP implementation independently documents that saving does not initiate upload and that opening then closing a project in CapCut on Mac starts upload. This corroborates the distinction between native-file creation and app initialization; it supplies neither a Windows API nor vendor support. [simopa/capcut-mcp-kit, editing existing projects](https://github.com/simopa/capcut-mcp-kit#editing-existing-projects).

## Practical next step

Keep editor initialization as an explicit unresolved capability rather than implement guessed protocols, altered cloud flags, private cloud requests or a fabricated success result. A vendor-confirmed CLI/URI/API that selects a local project by exact ID/path is the missing contract. The useful support question is: “On CapCut Windows 9.6, which supported interface opens an existing registered local project by draft ID or path, so CapCut performs normal project initialization and automatic Spaces upload? What confirms completion, and can the opened project be closed without affecting another editor?” CapCut documents Feedback as its support route for persistent Spaces issues. No support message was sent. [CapCut: Space bugs and feedback](https://www.capcut.com/help/bugs-for-space-storage).

Until such a contract is supplied, the demonstrated supported path includes a user opening the generated project. Existing local upload-completion observations remain local evidence; the user's mobile confirmation verifies the particular tested project, not every future upload.
