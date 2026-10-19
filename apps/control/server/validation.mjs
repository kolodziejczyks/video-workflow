export const stages = new Set(['preparing', 'transcribing', 'planning', 'captions', 'building', 'waiting_for_capcut', 'ready', 'failed']);
export function validateJob(body, batches) {
  if (!body || typeof body.batchId !== 'string') throw new Error('Choose a recording batch.');
  const batch = batches.find(b => b.id === body.batchId);
  if (!batch) throw new Error('This batch is not available on the PC. Refresh and try again.');
  if (typeof body.brief !== 'string' || body.brief.length > 2000) throw new Error('Keep the brief under 2,000 characters.');
  if (!Number.isInteger(body.targetSeconds) || body.targetSeconds < 15 || body.targetSeconds > 180) throw new Error('Choose a duration between 15 and 180 seconds.');
  return { batchId: batch.id, batchName: batch.name, brief: body.brief.trim(), targetSeconds: body.targetSeconds };
}
export function validateBatches(batches) {
  if (!Array.isArray(batches) || batches.length > 500) throw new Error('Invalid batch inventory.');
  const ids = new Set();
  return batches.map(b => {
    if (!b || !/^[a-f0-9]{64}$/.test(b.id) || ids.has(b.id) || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200 || !Number.isInteger(b.files) || b.files < 1 || !Number.isFinite(b.bytes) || b.bytes < 0) throw new Error('Invalid batch inventory.');
    ids.add(b.id);
    return { id: b.id, name: b.name, files: b.files, bytes: b.bytes };
  });
}
