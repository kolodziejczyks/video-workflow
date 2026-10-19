# Reference caption analysis

The two `samples/copy_*.mov` exports show the same treatment in the sampled frames:

- Heavy white uppercase lettering with a thin dark outline and shadow.
- Short centered phrases, usually two or three lines, around chest level (roughly y=1490 on a 1080x1920 canvas).
- A vivid purple rounded rectangle behind the active spoken word, moving to the next word as speech progresses.
- Tight cuts plus occasional phone screenshots / screen overlays. These overlays are part of the exports, not separate assets in the supplied raw recordings.

The exact font and effect settings cannot be recovered from burned-in exports. The first native approximation uses Montserrat Black, approximately `#8000EE` purple, and word-timed text states. Font source and license: https://github.com/JulietaUla/Montserrat (OFL). The font is downloaded under ignored `work/fonts/`, not installed system-wide.

`scripts/analyze_reference_captions.py` samples both exports into a caption contact sheet. `scripts/plan_reference_captions.py` derives phrase layout and word states from the source transcripts and edit plan. `scripts/build_reference_style_project.mjs` adds the clips and editable text through MCP, applies the local rich-text extension, then wraps the result in a native 9.6 scaffold.

Created project: `Polish Caption Style 2026-10-19T20-23-27-855Z`. Duration: 36.6 seconds, seven video intervals, 29 phrase groups, 110 highlighted-word states and 272 editable text materials. The original user-confirmed playback project is preserved. Structural checks found no same-track overlaps and no missing font files; native timeline copies match. This does not confirm the text's rendered appearance. The user must review font size, spacing, position, purple background rendering and word timing in CapCut.

The style draft reuses the existing editorial experiment. Its montage has not been approved. No additional publishing approval was given.

The user reported that the caption treatment looks close, then requested CapCut's Montra font. After the user downloaded it and applied it to a caption, its actual saved font descriptor identified resource `7462281584457125126`. The cached TTF identifies itself as Montra Regular. The `capcut_use_saved_font` local MCP extension applied that exact descriptor to all 272 text materials and reflowed positions using Montra metrics. It matches CapCut's frame-rounded segment timings without changing them and synchronizes both native timeline copies. Full project backups are under `work/font-change/`. The user reviewed the Montra result in CapCut and said it looks great; this caption appearance is now the accepted baseline.
