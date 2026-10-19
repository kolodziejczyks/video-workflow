# CapCut MCP video workflow

Automate montage assembly and editable captions in native CapCut projects through MCP. This repository combines local transcription, agent-selected cuts, and CapCut MCP tools to turn source recordings into short vertical videos for review.

The workflow supports:

- **Montage assembly:** build a native 9:16 timeline from selected source intervals and apply real, app-saved CapCut transitions through MCP.
- **Caption automation:** transcribe locally with faster-whisper and create editable, timed captions with active-word highlighting. The current baseline uses CapCut's Montra font, white uppercase text, and purple word boxes.
- **Native project compatibility:** build from an empty CapCut 9.6 template, keeping the native timeline and project content synchronized.

Cut selection and creative decisions are agent-guided. Caption wording, appearance, montage, and publishing have separate review steps. Native opening, playback, speed, and sound have been confirmed for the current draft, and its caption appearance has been reviewed positively. Montage review and final export remain pending; native export automation and publishing integrations are not implemented.

## Getting started

Read [AGENTS.md](AGENTS.md), then [the current handoff](docs/STATUS.md) for the working project, approval state, and local assets. Follow [local setup](docs/local-setup.md) for tools and commands.

## Repository layout

- `scripts/` — workflow scripts and MCP clients.
- `patches/` — local extensions to the upstream CapCut MCP server.
- `config/current-edit-plan.json` — the current experimental source intervals.
- `docs/` — setup instructions and the current handoff.

Source media, native projects, transcripts, models, and generated assets stay outside Git in local folders such as `samples/` and `work/`.
