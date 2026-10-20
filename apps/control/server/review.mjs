import { suggestTitle, retakeResolved } from '../shared/review_metadata.mjs';
export const AUDIO_RETENTION_MS = 30 * 86400000;
export class ReviewValidationError extends Error {}
export const sourceId = value => typeof value === 'string' && /^\d{4}$/.test(value);
export const audioKey = (job, source) => `review-audio/${job}/${source}.mp3`;

export function validateTranscript(input) {
  if (!input || !Array.isArray(input.sources) || !input.sources.length || input.sources.length > 500 || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 4000) throw new ReviewValidationError('Invalid transcript.');
  const sources = input.sources.map(s => {
    if (!sourceId(s.id) || typeof s.name !== 'string' || s.name.length > 250) throw new ReviewValidationError('Invalid recording.');
    return { id: s.id, name: s.name };
  });
  if (new Set(sources.map(s => s.id)).size !== sources.length) throw new ReviewValidationError('Duplicate recording.');
  const lines = input.lines.map((line, index) => {
    if (line.id !== String(index) || !sources.some(s => s.id === line.source) || !Number.isFinite(line.start) || !Number.isFinite(line.end) || line.start < 0 || line.end <= line.start || typeof line.text !== 'string' || !line.text.trim() || line.text.length > 2000 || !Array.isArray(line.uncertain) || line.uncertain.some(w => typeof w !== 'string' || w.length > 200)) throw new ReviewValidationError('Invalid transcript sentence.');
    return { id: line.id, source: line.source, start: line.start, end: line.end, text: line.text.trim(), uncertain: line.uncertain, accepted: false, excluded: false };
  });
  const retakes = input.retakes || [];
  if (!Array.isArray(retakes) || retakes.length > 60) throw new ReviewValidationError('Invalid retake suggestions.');
  const ids = new Set();
  const groups = retakes.map(g => {
    if (!g || !Array.isArray(g.lineIds) || g.lineIds.length !== 2 || g.lineIds[0] === g.lineIds[1] || g.lineIds.some(id=>!lines.some(l=>l.id===id)) || g.id !== `retake-${g.lineIds.join('-')}` || ids.has(g.id) || !Number.isFinite(g.similarity) || g.similarity < 0 || g.similarity > 1) throw new ReviewValidationError('Invalid retake suggestion.');
    ids.add(g.id);
    return {id:g.id,lineIds:g.lineIds,similarity:g.similarity,keepLineIds:null};
  });
  return { sources, lines, projectTitle:suggestTitle(lines), retakes:groups,
    ...(Array.isArray(input.retakes) ? {retakeReviewVersion:1} : {}) };
}

export function applyReview(document, edits, metadata = {}) {
  if (!Array.isArray(edits) || edits.length !== document.lines.length) throw new ReviewValidationError('Review every sentence.');
  const lines = document.lines.map((line, i) => {
    const edit = edits[i];
    if (!edit || edit.id !== line.id || typeof edit.text !== 'string' || !edit.text.trim() || edit.text.length > 2000 || typeof edit.accepted !== 'boolean' || typeof edit.excluded !== 'boolean') throw new ReviewValidationError('Invalid sentence review.');
    return { ...line, text: edit.text.trim(), accepted: edit.accepted, excluded: edit.excluded };
  });
  const title = metadata.projectTitle ?? document.projectTitle ?? suggestTitle(lines);
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 80 || /[\u0000-\u001f\u007f\\/:*?"<>|]/.test(title)) throw new ReviewValidationError('Use a project title of 1–80 characters without filename symbols such as / or :');
  const decisions = metadata.retakes;
  if (decisions !== undefined && (!Array.isArray(decisions) || decisions.length !== (document.retakes || []).length || new Set(decisions.map(g=>g.id)).size !== decisions.length || decisions.some(g=>!(document.retakes || []).some(old=>old.id===g.id)))) throw new ReviewValidationError('Invalid retake decisions.');
  const retakes = (document.retakes || []).map(group => {
    const decision = decisions?.find(g=>g.id===group.id);
    const keep = decision ? decision.keepLineIds : group.keepLineIds;
    if (keep !== null && (!Array.isArray(keep) || new Set(keep).size!==keep.length || keep.some(id=>!group.lineIds.includes(id)))) throw new ReviewValidationError('Invalid retake choice.');
    return {...group,keepLineIds:keep};
  });
  return {...document,lines,projectTitle:title.trim(),retakes};
}

export async function reviewRoutes(request, env, url, machine, json, body) {
  const match = url.pathname.match(/^\/api\/(worker\/)?jobs\/([a-f0-9-]+)\/(review|approve|audio)(?:\/(\d{4}))?$/);
  if (!match) return null;
  const [, , id, action, source] = match;
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(id).first();
  if (!job) return json({ error: 'Job not found.' }, 404);
  const leaseValid = () => job.status === 'running' && job.lease_until >= Date.now() && request.headers.get('X-Worker-Lease') === job.lease_token;
  if (machine && !leaseValid()) return json({ error: 'Job lease lost.' }, 409);
  const row = await env.DB.prepare('SELECT * FROM transcript_reviews WHERE job_id=?').bind(id).first();

  if (action === 'audio' && sourceId(source)) {
    if (!env.REVIEW_AUDIO) return json({ error: 'Review audio storage is not configured.' }, 503);
    const key = audioKey(id, source);
    if (machine && request.method === 'PUT' && job.phase === 'transcribe') {
      if (request.headers.get('content-type') !== 'audio/mpeg') throw new ReviewValidationError('Expected compressed MP3 audio.');
      const length = Number(request.headers.get('content-length'));
      if (!length || length > 20 * 1024 * 1024) throw new ReviewValidationError('Review audio must be under 20 MB per recording.');
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength !== length) throw new ReviewValidationError('Audio size mismatch.');
      const existing = await env.REVIEW_AUDIO.head(key);
      if (!existing) await env.REVIEW_AUDIO.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: { expiresAt: String(Date.now() + AUDIO_RETENTION_MS) } });
      return json({ ok: true });
    }
    if (!machine && ['GET', 'HEAD'].includes(request.method) && row) {
      const document = JSON.parse(row.document);
      if (!document.sources.some(s => s.id === source)) return json({ error: 'Recording not found.' }, 404);
      const head = await env.REVIEW_AUDIO.head(key);
      if (!head || Date.now() >= Number(head.customMetadata?.expiresAt || 0)) return json({ error: 'Review audio expired after 30 days.' }, 410);
      const headers = new Headers({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
      let offset = 0, end = head.size - 1, partial = false;
      const range = request.headers.get('range');
      if (range) {
        const parsed = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!parsed || (!parsed[1] && !parsed[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } });
        offset = parsed[1] ? Number(parsed[1]) : Math.max(0, head.size - Number(parsed[2]));
        end = parsed[1] && parsed[2] ? Math.min(end, Number(parsed[2])) : end;
        if (offset > end || offset >= head.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } });
        partial = true;
        headers.set('Content-Range', `bytes ${offset}-${end}/${head.size}`);
      }
      headers.set('Content-Length', String(end - offset + 1));
      if (request.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers });
      const object = await env.REVIEW_AUDIO.get(key, { range: { offset, length: end - offset + 1 } });
      if (!object) return json({ error: 'Review audio has expired.' }, 410);
      return new Response(object.body, { status: partial ? 206 : 200, headers });
    }
  }

  if (action === 'review' && request.method === 'GET' && row) {
    if (machine && (job.phase !== 'montage' || !row.approved_at)) return json({ error: 'Transcript not approved.' }, 409);
    const document = JSON.parse(row.document);
    return json({ ...document, projectTitle: document.projectTitle || suggestTitle(document.lines,job.batch_name), retakes:document.retakes || [], revision: row.revision, approved: !!row.approved_at, audioExpiresAt: row.created_at + AUDIO_RETENTION_MS });
  }
  if (action === 'review' && machine && request.method === 'POST' && row && job.phase === 'transcribe') return json({ok:true});
  if (action === 'review' && machine && request.method === 'POST' && job.phase === 'transcribe' && !row) {
    const document = validateTranscript(await body(request));
    if (!env.REVIEW_AUDIO) return json({ error: 'Review audio storage is not configured.' }, 503);
    for (const recording of document.sources) {
      const audio = await env.REVIEW_AUDIO.head(audioKey(id, recording.id));
      if (!audio || Number(audio.customMetadata?.expiresAt) <= Date.now()) throw new ReviewValidationError('Upload all review audio first.');
    }
    const now = Date.now();
    const inserted = await env.DB.prepare(`INSERT INTO transcript_reviews(job_id,document,created_at) SELECT id,?,? FROM jobs WHERE id=? AND status='running' AND phase='transcribe' AND lease_token=? AND lease_until>=?`).bind(JSON.stringify(document), now, id, job.lease_token, now).run();
    if (!inserted.meta.changes) return json({ error: 'Job lease lost.' }, 409);
    return json({ ok: true });
  }
  if (!machine && action === 'review' && request.method === 'PUT' && row && job.status === 'awaiting_review' && !row.approved_at) {
    const input = await body(request), document = applyReview(JSON.parse(row.document), input.lines, input);
    const result = await env.DB.prepare('UPDATE transcript_reviews SET document=?,revision=revision+1 WHERE job_id=? AND revision=? AND approved_at IS NULL').bind(JSON.stringify(document), id, input.revision).run();
    return result.meta.changes ? json({ revision: row.revision + 1 }) : json({ error: 'This review changed on another device. Reload before saving.' }, 409);
  }
  if (!machine && action === 'approve' && request.method === 'POST' && row && job.status === 'awaiting_review') {
    const input = await body(request), document = JSON.parse(row.document);
    if (input.revision !== row.revision) return json({ error: 'Save your latest changes before approving.' }, 409);
    if (document.lines.some(l => !l.excluded && !l.accepted) || !document.lines.some(l => !l.excluded)) throw new ReviewValidationError('Accept every included sentence and keep at least one sentence.');
    if ((document.retakes || []).some(g=>!retakeResolved(g,document.lines))) throw new ReviewValidationError('Resolve every possible retake before approving. You can keep both takes.');
    if (!document.projectTitle?.trim()) throw new ReviewValidationError('Save a project title before approving.');
    // A single D1 transaction freezes the review and queues montage generation.
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE transcript_reviews SET approved_at=? WHERE job_id=? AND revision=? AND approved_at IS NULL').bind(Date.now(), id, input.revision),
      env.DB.prepare("UPDATE jobs SET status='queued',stage='queued',phase='montage',updated_at=? WHERE id=? AND status='awaiting_review' AND EXISTS (SELECT 1 FROM transcript_reviews WHERE job_id=? AND revision=? AND approved_at IS NOT NULL)").bind(Date.now(), id, id, input.revision)
    ]);
    if (!results[0].meta.changes || !results[1].meta.changes) return json({error:'Review changed. Reload before approving.'},409);
    return json({ ok: true });
  }
  return json({ error: row ? 'This review is no longer editable.' : 'Transcript is not ready yet.' }, 409);
}
