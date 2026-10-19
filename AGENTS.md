# Workflow preferences

Start with [the current handoff](docs/STATUS.md). Read [local setup](docs/local-setup.md) only when running or changing the tooling. Update the handoff when the active project or approval state changes; replace stale facts instead of appending a history log.

- Do not use desktop control, mouse/keyboard automation, screenshots of the live desktop, or launch the app unless the user explicitly requests it. Use MCP and repository tools. User-provided screenshots and reference videos may be analyzed.
- Use CapCut MCP for native project editing. FFmpeg can inspect media, extract reference frames, or support transcription; its previews do not prove that CapCut can render a project.
- Build new native projects from the empty CapCut 9.6 template. The upstream server's from-scratch draft was rejected; the native-template repair opened successfully, and the user confirmed playback, speed, and sound.
- Back up the project index before registration. Do not modify CapCut projects while its process is running. Stop a background process only with explicit user authorization; never assume authorization to close an active editing window.
- Keep approval scopes separate: subtitle wording, subtitle appearance, montage/cuts, and publishing. The user approved the subtitle wording and reviewed the reference-style captions with CapCut's Montra font positively. Use that caption appearance as the baseline; montage/cuts and publishing remain unapproved.
- Avoid black fades at cut boundaries. Native transitions must use real CapCut resources; generated random effect IDs are not evidence of valid transitions.
- Keep originals, generated projects, exports, downloaded tools/models/fonts and credentials outside Git. Publish only after explicit approval of the final export and destination.

## Agent skills

### Issue tracker

Use GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout. Before codebase exploration, read
`docs/agents/domain.md`.
