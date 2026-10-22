# Changelog

## Unreleased — 2026-10-22

Safety hardening from a repository-wide review; no feature changes.

- Draft removal addresses the CapCut draft ID instead of the name, so a namesake draft is never deleted; missing or duplicated IDs refuse.
- Native registration verifies all timeline/upload copies and re-checks that CapCut is closed before the single index write, removes the unregistered folder on failure, and keeps a verified per-attempt index backup instead of overwriting the previous one.
- The PC worker keeps processing through transient heartbeat failures and an unavailable recording inbox; the processor is stopped only on lease/credential rejection or after 60 seconds without renewal.
- The background wrapper recovers an old empty lock, treats a reused lock PID that is not Node as stale, logs worker exit codes, and launches the worker with absolute paths so it is visible to the related-process scan.
- The upload launcher correlates CapCut ownership with the PID reported by the patched MCP `capcut_open_app`, falling back to a launch-time window only after PID correlation had its chance.

Validation: 40 JavaScript tests, six planner tests and three thumbnail tests pass. The live worker still runs the previous code until an explicitly authorized restart; processor, MCP and wrapper changes apply to future child processes.

## v0.1.0 — 2026-10-20

- Start the PC worker automatically at Windows sign-in and recover exited workers through a one-minute scheduled task.
- Preserve worker logs, recover verified stale locks, and supply the Node runtime to background processors.
- Show separate video-creation progress after transcript approval.
- Track the exact CapCut instance opened for an upload and gracefully close its home window after the draft records upload completion and a 30-second settling period. Preserve active editing windows and manually opened instances.

Validation: 26 JavaScript tests and the React production build pass. A live worker recovery completed in 32 seconds; the completed uploader exited normally. The web update is deployed and both Windows tasks are installed on the configured workstation. Reboot/sign-in and a future complete generate/upload/close cycle still need observation.

Windows must be awake and the user signed in. Upload completion comes from local CapCut metadata; it does not independently verify phone availability. No video export or publishing is included.
