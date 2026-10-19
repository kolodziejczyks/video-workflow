# CapCut automation investigation

Investigated 2026-10-19. Installed version reported by user: 9.6.0.4097.
No MCP server or dependencies have been installed.

## Local findings

- Repository has one initial commit and an SSH origin at `git@github.com:kolodziejczyks/video-workflow.git`. Remote authentication was not tested.
- Node is available through the bundled runtime. `python.exe` resolves to the WindowsApps alias; a working Python interpreter is not confirmed.
- FFmpeg, ffprobe and uv were not found on PATH.
- The standard `%LOCALAPPDATA%\CapCut` directory was not found in the command environment. Here `%LOCALAPPDATA%` resolves inside a sandbox package, so this is not a reliable check of the user's actual CapCut installation or draft location. Run the preflight in the user's PowerShell with the actual draft path to confirm.
- No raw footage is present in the repository. Uploads are still in progress.

## Options

### Follow-up local verification

Using the explicit user-profile path resolved the sandbox environment mismatch:

- Confirmed executable: `C:\Users\bezaw\AppData\Local\CapCut\Apps\9.6.0.4097\CapCut.exe`, file version `9.6.0.4097`.
- Confirmed local draft root: `C:\Users\bezaw\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft`.
- Existing project `1019` has readable JSON in both its top-level and timeline draft files. This passes the initial format check, but does not establish that a third-party server can safely edit or export it.

Use the explicit draft root with the preflight script when running in the sandbox environment.

Sample inspection subsequently found CapCut's bundled `ffmpeg.exe` in its version directory. It can decode the standard AAC audio track and render H.264 through Windows Media Foundation, although it is not on PATH. No ffprobe executable was located. The 21 samples total 86.6 seconds and are short portrait talking-head takes rather than one long recording. Local faster-whisper transcription and a burned-caption style preview work without an MCP server. PyAV 16.0.1 is required by the tested dependency combination; see the transcription lock file.

| Option | Useful capabilities | Limits / verification needed |
| --- | --- | --- |
| CapCut desktop features | Auto captions with language selection and manual correction | Check Polish availability and entitlement in this installation; no supported desktop automation API was established in this investigation |
| LHenri88/capcut-mcp | Timeline reads, cuts, text, transitions, audio, FFmpeg previews, backup and save protection | Author reports testing 9.3.x, not this 9.6 build; requires readable draft JSON; export is not automated |
| JmsLdrn/capcut-mcp | Template-based draft cloning, trim/split, text/audio, validation and backups | Transitions/effects are best effort; text needs a real template; no demonstrated 9.6.0.4097 compatibility |
| VectCutAPI wrappers | Generate drafts with media, subtitles and effects | More backend components; generated draft compatibility and remote/storage behavior need source review |
| FFmpeg plus transcription | Independent clip renders, subtitle burn-in, audio mix and transitions | Requires dependencies and a transcription model; semantic highlight selection is a separate stage |

These are third-party project claims, not verified results on this computer. Prefer evaluating LHenri88 first for its read/preview loop, with JmsLdrn as an alternative. Do not install either until a scratch draft from this exact CapCut version is inspected and the selected server's code and dependencies are reviewed. An FFmpeg preview does not prove CapCut will render every effect identically.

## Proposed production flow

1. Wait for each upload to complete, then register a stable local source with duration and checksum. Preserve originals. Do not process a growing upload.
2. Transcribe Polish speech with timestamps, retaining a full transcript and SRT. Whisper is a candidate; use Polish transcription, not translation. Review names, numbers and Polish diacritics.
3. Rank coherent excerpts using the transcript; propose source in/out times, hook and rationale. Silence detection alone does not select good highlights.
4. Build draft shorts, initially 9:16 at 1080x1920, roughly 20–60 seconds (provisional defaults). Check framing and caption safe areas. Start with clean cuts; use short transitions only where useful.
5. Add optional licensed music with speech ducking. Record the music source and permitted publishing destinations.
6. Review the actual export for cut boundaries, subtitle timing/spelling, framing and audio. Keep revision identifiers so approval applies to a specific export.
7. Publish only after explicit approval of that export and its destination, title and description. A changed export needs fresh review. Publishing platforms and account integrations remain unspecified.

## Compatibility trial after uploads

Locate CapCut's actual draft storage. Create a disposable project with a short source, Polish text, a transition and an audio track; close CapCut and copy the entire project for testing. Confirm whether its draft is readable JSON without attempting to decrypt or bypass protection. Audit a pinned server revision, then test read, clone, edit, reopen and export against the disposable copy. Keep originals and backup projects intact. If draft editing fails, use independent rendering and CapCut for review or manual finishing.

## Sources

- https://www.capcut.com/help/how-to-recognise-subtitles
- https://github.com/LHenri88/capcut-mcp
- https://github.com/JmsLdrn/capcut-mcp
- https://github.com/goransmoljanovic015-cell/capcut-mcp-server
- https://github.com/openai/whisper
