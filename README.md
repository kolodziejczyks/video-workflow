# Video workflow

Workflow for turning Polish talking videos into reviewed short clips with subtitles, transitions, and optional music.

## Planned workflow

1. Import recordings without modifying originals.
2. Review unusable takes and candidate excerpts.
3. Generate and correct Polish subtitles.
4. Assemble clips and add optional transitions and licensed music.
5. Review exports before publishing.

CapCut MCP is installed locally for testing and invoked through its stdio protocol; it is not globally registered. Native-template projects open in CapCut 9.6.0.4097, and the user confirmed playback, speed, and sound. Subtitle appearance and final publishing remain under review.

See [the CapCut investigation](docs/capcut-investigation.md) for automation options, compatibility checks, and the proposed review-to-publish flow.

Run the read-only local check in PowerShell:

```powershell
.\scripts\preflight.ps1
# For a custom CapCut projects location:
.\scripts\preflight.ps1 -DraftRoot 'D:\CapCut\Projects\com.lveditor.draft'
```

Raw uploads must finish before processing. Publishing requires approval of the specific final export and destination.

## Local sample tools

The first test used 21 MOV files totaling 86.6 seconds; that test's media and outputs were removed at the user's request. The replacement set contains 28 MOV files totaling 251.64 seconds, including two captioned reference exports of 48.92 seconds each and raw takes up to 19.13 seconds. Generated files go under ignored `work/`.

The second test produced `work/test2-compact/review.mp4` (26.60 seconds) and `work/test2-full/review.mp4` (36.69 seconds), with source intervals recorded in each folder's `edit-plan.json`. Both pass full FFmpeg decoding. The user approved the subtitle wording, not the montage or placeholder design. Clip selection was performed by the assistant using transcripts and contact sheets; there is no unattended semantic highlight selector yet. Neither export is approved for publication.

- `scripts/inspect_samples.py --ffmpeg <path>` creates a metadata inventory and contact sheet. Requires Pillow (available in the bundled Python runtime).
- `scripts/transcribe_samples.py --ffmpeg <path>` creates unreviewed Polish SRT and word-timed JSON with faster-whisper. Uses the first audio track explicitly. First run downloads the small model into `work/models`; transcription runs locally. Cached outputs are reused only when the source SHA-256 and model match.
- `scripts/render_caption_test.py --ffmpeg <path> --stem IMG_1447` renders a 720x1280 H.264 subtitle style preview using Pillow overlays and Windows Media Foundation. Requires word-timed transcript JSON and the Windows Arial Bold font.
- `scripts/render_edit_plan.py --ffmpeg <path> --plan <plan.json>` renders a JSON list of source intervals with placeholder captions and normalized audio, and exports a review MP4 with a separate SRT. A plan has a `name` and a `clips` list; each clip specifies `source`, `in`, `out` (seconds), and an editorial `reason`. It is an earlier FFmpeg experiment; native edits now use MCP.

CapCut includes a usable FFmpeg at `C:\Users\bezaw\AppData\Local\CapCut\Apps\9.6.0.4097\ffmpeg.exe`. Its build lacks the usual libass subtitle filter and libx264 encoder, so the preview uses image overlays and `h264_mf`.

Transcription dependencies are recorded in `requirements-transcription.lock.txt`. Install in a local `.venv` with `python -m pip install -r requirements-transcription.lock.txt`. PyAV is pinned to 16.0.1 because version 19.0.1 failed with faster-whisper 1.2.1's `metadata_errors` argument.

Transcription implementation: [faster-whisper](https://github.com/SYSTRAN/faster-whisper). Review subtitles against audio before using them in a final export; the initial pass contains recognition errors and incomplete takes.

Raw footage, exports, and credentials remain outside Git.

## Native CapCut workflow checkpoint

See [MCP testing and compatibility](docs/aiperson-mcp-test.md), [reference subtitle styling](docs/reference-caption-style.md), and [local setup](docs/local-setup.md). Scripts currently target this Windows workstation and are not a portable packaged application. Reinstalling tools alone will not recreate ignored recordings, transcripts, fonts, edit plans or the native CapCut template.
