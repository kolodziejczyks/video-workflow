import { reviewRoutes, ReviewValidationError } from './review.mjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { validateJob, validateBatches, stages } from './validation.mjs';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const keys = new Map();
async function identity(request, env) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAILS) return null;
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  if (!keys.has(issuer)) keys.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  try {
    const { payload } = await jwtVerify(token, keys.get(issuer), { issuer, audience: env.ACCESS_AUD });
    const allowed = env.ALLOWED_EMAILS.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    return typeof payload.email === 'string' && allowed.includes(payload.email.toLowerCase()) ? payload.email : null;
  } catch { return null; }
}
async function machineAuth(request, env) {
  if (!env.WORKER_TOKEN) return false;
  const supplied = request.headers.get('Authorization') || '';
  const hash = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(supplied), hash(`Bearer ${env.WORKER_TOKEN}`)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function body(request) {
  const text = await request.text();
  if (text.length > 2000000) throw new Error('Request too large.');
  return JSON.parse(text);
}
const publicJob = row => row && Object.fromEntries(Object.entries(row).filter(([k]) => !['lease_token', 'lease_until'].includes(k)));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const machine = url.pathname.startsWith('/api/worker/');
    try {
      let email;
      if (machine) {
        if (!await machineAuth(request, env)) return json({ error: 'Worker authentication required.' }, 401);
      } else {
        email = await identity(request, env);
        if (!email) return json({ error: 'Sign in through Cloudflare Access. Access configuration is required before using this app.' }, 401);
        if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return json({ error: 'Invalid request origin.' }, 403);
      }
      const reviewResponse = await reviewRoutes(request, env, url, machine, json, body);
      if (reviewResponse) return reviewResponse;
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (url.pathname === '/api/overview' && request.method === 'GET') {
        const state = await env.DB.prepare('SELECT * FROM worker_state WHERE id = 1').first();
        const { results } = await env.DB.prepare("SELECT * FROM jobs WHERE status!='removed' ORDER BY created_at DESC LIMIT 50").all();
        return json({ email, inboxUrl: `https://drive.google.com/drive/folders/${env.DRIVE_INBOX_ID}`, worker: state ? { lastSeen: state.last_seen, message: state.message } : null, batches: state ? JSON.parse(state.batches_json) : [], jobs: results.map(publicJob) });
      }
      const removal = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/);
      if (!machine && removal && request.method === 'DELETE') {
        const input = await body(request);
        if (input.confirm !== true) return json({error:'Confirm removal of this entry and its CapCut draft.'},400);
        const job = await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(removal[1]).first();
        if (!job) return json({error:'Project not found.'},404);
        if (job.status === 'removed') return json({ok:true});
        if (job.status === 'delete_queued' || job.status === 'running' && job.phase === 'delete') return json({ok:true,pending:true},202);
        const result = await env.DB.prepare("UPDATE jobs SET status='delete_queued',stage='delete_queued',phase='delete',message='Removal requested. Your PC will back up and remove the CapCut draft when CapCut is closed.',updated_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND status IN ('ready','failed','delete_failed','awaiting_review','queued')").bind(Date.now(),job.id).run();
        return result.meta.changes ? json({ok:true,pending:true},202) : json({error:'This project is processing. Wait until it finishes before removing it.'},409);
      }
      if (url.pathname === '/api/jobs' && request.method === 'POST') {
        const state = await env.DB.prepare('SELECT * FROM worker_state WHERE id = 1').first();
        if (!state || Date.now() - state.last_seen > 120000) return json({ error: 'The PC worker is offline. Start it before submitting a batch.' }, 409);
        const input = validateJob(await body(request), JSON.parse(state.batches_json));
        const id = crypto.randomUUID(), now = Date.now();
        // Unique partial index makes double taps and concurrent submissions harmless.
        const result = await env.DB.prepare("INSERT OR IGNORE INTO jobs(id,batch_id,batch_name,brief,target_seconds,created_at,updated_at,phase) VALUES(?,?,?,?,?,?,?,'transcribe')").bind(id, input.batchId, input.batchName, input.brief, input.targetSeconds, now, now).run();
        const job = result.meta.changes ? await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first() : await env.DB.prepare("SELECT * FROM jobs WHERE batch_id = ? AND status IN ('queued','running','awaiting_review')").bind(input.batchId).first();
        return json({ job: publicJob(job), existing: !result.meta.changes }, result.meta.changes ? 201 : 200);
      }
      if (url.pathname === '/api/worker/heartbeat' && request.method === 'POST') {
        const input = await body(request), batches = validateBatches(input.batches);
        await env.DB.prepare('INSERT INTO worker_state(id,last_seen,batches_json,message) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,batches_json=excluded.batches_json,message=excluded.message').bind(Date.now(), JSON.stringify(batches), String(input.message || '').slice(0,500)).run();
        return json({ ok: true });
      }
      if (url.pathname === '/api/worker/claim' && request.method === 'POST') {
        const input = await body(request);
        const canDelete = Array.isArray(input?.capabilities) && input.capabilities.includes('project-removal-v1') ? 1 : 0;
        const now = Date.now(), token = crypto.randomUUID();
        // One atomic statement: no concurrent claims, including across HTTP retries.
        const job = await env.DB.prepare(`UPDATE jobs SET status='running', lease_token=?, lease_until=?, updated_at=?, attempt=attempt+1
          WHERE id=(SELECT id FROM jobs WHERE status='queued' OR (status='delete_queued' AND ?=1) OR (status='running' AND lease_until < ? AND (phase!='delete' OR ?=1)) ORDER BY created_at,id LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM jobs WHERE status='running' AND lease_until >= ?) RETURNING *`).bind(token, now + 90000, now, canDelete, now, canDelete, now).first();
        return json({ job });
      }
      const update = url.pathname.match(/^\/api\/worker\/jobs\/([a-f0-9-]+)$/);
      if (update && request.method === 'POST') {
        const input = await body(request);
        if (!stages.has(input.stage)) throw new Error('Invalid processing stage.');
        const currentJob = await env.DB.prepare('SELECT phase FROM jobs WHERE id=?').bind(update[1]).first();
        if (input.stage === 'removed' && currentJob?.phase !== 'delete') return json({error:'This project has no removal request.'},409);
        if (currentJob?.phase === 'delete' && !['preparing','waiting_for_capcut','removed','failed'].includes(input.stage)) return json({error:'Invalid removal stage.'},409);
        if (jobGuardRequired(input.stage)) {
          const job = await env.DB.prepare('SELECT phase FROM jobs WHERE id=?').bind(update[1]).first();
          if (job?.phase === 'transcribe') return json({ error: 'Approve the transcript before building a montage.' }, 409);
        }
        if (input.stage === 'awaiting_review') {
          const job = await env.DB.prepare('SELECT phase FROM jobs WHERE id=?').bind(update[1]).first();
          if (job?.phase !== 'transcribe' || !await env.DB.prepare('SELECT job_id FROM transcript_reviews WHERE job_id=?').bind(update[1]).first()) return json({ error: 'Upload the transcript first.' }, 409);
        }
        const now = Date.now(), status = input.stage === 'removed' ? 'removed' : input.stage === 'ready' ? 'ready' : input.stage === 'failed' ? currentJob?.phase === 'delete' ? 'delete_failed' : 'failed' : input.stage === 'awaiting_review' ? 'awaiting_review' : 'running';
        const result = await env.DB.prepare('UPDATE jobs SET stage=?,status=?,message=?,project_name=COALESCE(?,project_name),updated_at=?,lease_until=? WHERE id=? AND lease_token=? AND status=\'running\' AND lease_until>=?').bind(input.stage, status, String(input.message || '').slice(0,1000), typeof input.projectName === 'string' ? input.projectName.slice(0,200) : null, now, now+90000, update[1], input.leaseToken || '', now).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Job lease lost. Stop processing.' }, 409);
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      if (error instanceof ReviewValidationError || error instanceof SyntaxError || /^Invalid|^Choose|^Keep|^This batch|^Request too/.test(error.message)) return json({ error: error.message }, 400);
      console.error('Request failed:', error.name);
      return json({ error: 'The request failed. Check the service configuration and try again.' }, 500);
    }
  }
};

function jobGuardRequired(stage) { return ['planning','captions','building','waiting_for_capcut','ready'].includes(stage); }
