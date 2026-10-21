# DaVinci Resolve MCP feasibility

Checked 2026-10-21. Research only: no installation, connection to Resolve, app launch, project migration or render test was performed.

## Finding

Yes: [samuelgursky/davinci-resolve-mcp](https://github.com/samuelgursky/davinci-resolve-mcp) is an open-source, third-party MCP server. Its documented live interface covers project creation/loading, media import, timeline assembly, Fusion/TextPlus, audio and render jobs. It offers a default compound interface and a larger granular interface. These are upstream capabilities, not locally verified behavior. The optional advanced server also edits project files/database structures offline; that is a different and riskier integration surface than the live scripting API. Start evaluation with the live server. [Upstream README](https://github.com/samuelgursky/davinci-resolve-mcp#core-capabilities)

This is a plausible improvement for desktop automation: it can use Resolve's scripting API to build and render a project while Resolve runs, instead of depending on CapCut draft-file registration and the separately observed editor-opening/upload initialization sequence. That improvement is an inference from the interface and our [current handoff](../STATUS.md), not an end-to-end comparison.

## Edition and setup boundary

Blackmagic lists the remote scripting API among Studio features. A Blackmagic staff response explicitly distinguishes free-edition Console/menu scripts from Studio-only external scripting. Studio is therefore the straightforward route for an external MCP client; do not assume free desktop Resolve exposes that connection. [Official Studio overview](https://www.blackmagicdesign.com/products/davinciresolve/studio), [Blackmagic staff clarification](https://forum.blackmagicdesign.com/viewtopic.php?f=21&t=205175)

The community server documents an in-app bridge for free Resolve, with upstream Windows 11 user reports on free 21.0.x. Its README warns that Python menu scripts may not appear in free 21.1, so this is version-dependent and cannot be treated as dependable unattended Windows operation here. An installed version and edition must be established before choosing that path. [Upstream bridge instructions and limitations](https://github.com/samuelgursky/davinci-resolve-mcp#free-edition-in-app-bridge)

## Captions and migration fit

Resolve supports importing SRT/TTML and adjusting subtitle font, size, color and position, with burn-in or separate subtitle export. Existing approved wording can therefore be retained as an interchange input. This does not prove identical styling or automated control of every subtitle attribute. [Official subtitle documentation](https://www.blackmagicdesign.com/products/davinciresolve/edit)

Blackmagic's Resolve 20 guide identifies animated subtitle templates as Studio-only and describes custom templates made in Fusion. Resolve 21 adds word-timing analysis for imported or manually entered captions. Reproducing our positively reviewed Montra appearance still needs a native rendered comparison and font-availability check; a CapCut project is not evidence of a compatible Resolve template. [Resolve 20 guide, p. 28](https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf), [Resolve 21 guide, pp. 78–79](https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_21_New_Features_Guide.pdf)

The server is not free of API edge cases: upstream code records subtitle-generation calls whose booleans are unreliable, project settings that cannot be written, and interchange fidelity/relinking differences. These are upstream live-test reports tied to versions, not tests on this PC. Readback plus native render/playback validation remains necessary. [Upstream API behavior ledger](https://github.com/samuelgursky/davinci-resolve-mcp/blob/main/src/utils/api_truth.py)

## Mobile boundary and recommendation

Blackmagic's first-party App Store listing provides an iPad editor with cloud project collaboration and desktop-compatible project/archive interchange. It does not list iPhone compatibility. The cited first-party material does not establish an Android editor. Therefore this is not verified parity with our already user-confirmed CapCut phone editing workflow. [Blackmagic's iPad listing](https://apps.apple.com/us/app/davinci-resolve-for-ipad/id1581363826)

Recommendation: evaluate Resolve in one isolated sample project before switching. Verify API connection on the intended edition/version, exact clip timing/speed/audio, approved caption wording and appearance, real transitions without black fades, native rendered playback, and the intended review-device workflow. Retain CapCut until that passes. If editable projects on a phone remain essential, Resolve currently has an unresolved product-fit gap; desktop generation with phone video review is a different workflow. No migration, montage approval or publishing approval is implied by this research.
