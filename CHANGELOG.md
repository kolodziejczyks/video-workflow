# Changelog

## v0.1.0 — 2026-10-20

- Start the PC worker automatically at Windows sign-in and recover exited workers through a one-minute scheduled task.
- Preserve worker logs, recover verified stale locks, and supply the Node runtime to background processors.
- Show separate video-creation progress after transcript approval.
- Track the exact CapCut instance opened for an upload and gracefully close its home window after the draft records upload completion and a 30-second settling period. Preserve active editing windows and manually opened instances.

Validation: 26 JavaScript tests and the React production build pass. A live worker recovery completed in 32 seconds; the completed uploader exited normally. The web update is deployed and both Windows tasks are installed on the configured workstation. Reboot/sign-in and a future complete generate/upload/close cycle still need observation.

Windows must be awake and the user signed in. Upload completion comes from local CapCut metadata; it does not independently verify phone availability. No video export or publishing is included.
