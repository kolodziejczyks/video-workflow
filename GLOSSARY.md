# Glossary

- **Recording inbox**: the user's Google Drive `vids` folder, synced locally by Drive for desktop.
- **Batch**: one subfolder containing recordings intended for one video. The worker derives a versioned identifier from filenames, sizes and modification times.
- **Job**: a request to process a particular batch version, with target duration and review notes.
- **Control page**: the React interface hosted on the user's Cloudflare Worker, protected by Google login through Access.
- **PC worker**: the Windows process that advertises local batches, claims jobs and invokes the batch processor over outbound connections.
- **Review draft**: an editable native CapCut project whose generated wording and montage still require review. A ready job does not imply verified native playback or approval to publish.
