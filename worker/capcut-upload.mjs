// CapCut's local metadata is evidence of a recorded upload, not a remote availability check.
export function inspectUploadRecord(text, {projectId, spaceId} = {}) {
  const unknown = reason => ({status:'unverified', reason});
  let metadata;
  try {
    // Cloud identifiers exceed Number.MAX_SAFE_INTEGER; preserve their exact digits.
    metadata = JSON.parse(text.replace(/("tm_draft_cloud_(?:entry_id|space_id|parent_entry_id)"\s*:\s*)(-?\d+)(?=\s*[,}])/g, '$1"$2"'));
  } catch { return unknown('Metadata is missing or incomplete.'); }
  if (!projectId || metadata.draft_id !== projectId) return unknown('Project identity does not match.');
  const entry = String(metadata.tm_draft_cloud_entry_id ?? '');
  const space = String(metadata.tm_draft_cloud_space_id ?? '');
  if (!/^[1-9]\d*$/.test(entry) || !/^[1-9]\d*$/.test(space)) return unknown('No cloud project binding recorded.');
  if (spaceId && space !== spaceId) return unknown('Upload belongs to another Space.');
  const completed = Number(metadata.tm_draft_cloud_completed);
  const modified = Number(metadata.tm_draft_modified);
  const created = Number(metadata.tm_draft_create);
  if (![completed,modified,created].every(value=>Number.isSafeInteger(value) && value>0)) return unknown('Upload or project timestamps are unavailable.');
  // Observed native creation/modification values are microseconds; completion is milliseconds.
  if (completed * 1000 < Math.max(modified,created)) return unknown('Recorded upload predates the current draft.');
  return {status:'recorded_complete', projectId, cloudEntryId:entry, spaceId:space, completedAt:new Date(completed).toISOString(), remoteAvailability:'unverified'};
}
