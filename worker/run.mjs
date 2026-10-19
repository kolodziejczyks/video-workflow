import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanInbox, stableBatches } from './inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = process.argv[2];
if (!configPath) throw new Error('Usage: node worker/run.mjs <local-config.json>');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
if (!config.inbox || !config.controlUrl || !process.env.VIDEO_WORKER_TOKEN) throw new Error('Configure inbox, controlUrl and VIDEO_WORKER_TOKEN.');
const base = new URL(config.controlUrl);
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('The control URL must use HTTPS.');
if (!Array.isArray(config.processor) || !config.processor.length || config.processor.some(s => typeof s !== 'string')) throw new Error('Configure a local processor executable and argument array. See docs/remote-control.md.');
const work = path.join(root, 'work', 'batches');
await fs.mkdir(work, { recursive: true });
const lockPath = path.join(work, 'worker.lock');
let lock;
try { lock = await fs.open(lockPath, 'wx'); } catch { throw new Error('A worker lock exists. Check the running process before removing work/batches/worker.lock.'); }
await lock.writeFile(String(process.pid));
let stopped = false, child, current = null, seen = new Map(), inventory = [], busy = false, finalizing = false;
let tickPromise = Promise.resolve();
function stopProcessor() {
  if (!child?.pid) return;
  if (process.platform === 'win32') execFile('C:/Windows/System32/taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else child.kill();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; stopProcessor(); });
async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(route, input) {
  const response = await fetch(new URL(route, base), { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VIDEO_WORKER_TOKEN}`,
    ...(process.env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET || '' } : {})
  }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Control API ${response.status}; check authentication, Access policies and the worker lease.`);
  return response.json();
}
async function update(stage, message = '', projectName) {
  await api(`/api/worker/jobs/${current.id}`, { leaseToken: current.lease_token, stage, message, projectName });
  current.stage = stage; current.message = message;
}
async function tick() {
  const scan = stableBatches(seen, await scanInbox(config.inbox), Date.now());
  seen = scan.seen; inventory = scan.ready;
  await api('/api/worker/heartbeat', { batches: inventory.map(({ sources,...batch }) => batch), message: current ? 'Processing a recording batch.' : 'Ready for a recording batch.' });
  if (current && !finalizing) {
    let progress;
    try { progress=JSON.parse(await fs.readFile(path.join(work,current.id,'progress.json'),'utf8')); } catch(e) { if(e.code!=='ENOENT')throw e; }
    await update(progress?.stage || current.stage || 'preparing', progress?.message || current.message || '');
  }
}
async function execute(job) {
  current = { ...job, stage: 'preparing' };
  try {
    await update('preparing', 'Checking the synced batch and staging original recordings.');
    const batch = (await scanInbox(config.inbox)).find(b => b.id === job.batch_id);
    if (!batch) throw new Error('The batch changed after submission. Wait for sync, then submit it again.');
    const directory = path.join(work, job.id), media = path.join(directory, 'media');
    await fs.mkdir(media, { recursive: true });
    const sources = [];
    for (const [i,source] of batch.sources.entries()) {
      const name = `${String(i+1).padStart(4,'0')}${path.extname(source.name).toLowerCase()}`;
      const destination = path.join(media, name);
      await fs.copyFile(source.source, destination);
      const stat = await fs.stat(source.source), copy = await fs.stat(destination);
      if (stat.size !== source.size || stat.mtimeMs !== source.mtime || copy.size !== source.size) throw new Error('Source footage changed while copying. Resubmit after sync finishes.');
      const [originalHash, copyHash] = await Promise.all([hashFile(source.source), hashFile(destination)]);
      if (originalHash !== copyHash) throw new Error('Copied media differs from the original. Resubmit after sync finishes.');
      sources.push({ originalName: source.name, path: destination, size: copy.size, sha256: copyHash });
    }
    const manifest = path.join(directory, 'job.json');
    await fs.writeFile(manifest, JSON.stringify({ id: job.id, batchName: job.batch_name, brief: job.brief, targetSeconds: job.target_seconds, sources, directory }, null, 2));
    const log = await fs.open(path.join(directory, 'processor.log'), 'a');
    try {
      await new Promise((resolve, reject) => {
        const childEnv = { ...process.env, VIDEO_JOB_DIRECTORY: directory };
        for (const key of ['VIDEO_WORKER_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']) delete childEnv[key];
        child = spawn(config.processor[0], [...config.processor.slice(1), manifest], { cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
        child.stdout.on('data', chunk => { log.write(chunk).catch(() => {}); });
        child.stderr.on('data', chunk => { log.write(chunk).catch(() => {}); });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Batch processor exited with code ${code}. See the local processor log.`)));
      });
    } finally { child = null; await log.close(); }
    // The processor must explicitly attest completion; exit 0 alone is insufficient.
    const result = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
    if (result.jobId !== job.id || result.status !== 'ready' || typeof result.projectName !== 'string' || !result.projectName.trim()) throw new Error('Processor did not return a verified native project result.');
    finalizing = true;
    await tickPromise;
    await update('ready', 'Native draft created. Open CapCut to review wording and cuts.', result.projectName);
  } catch (error) {
    console.error(error.message);
    finalizing = true;
    await tickPromise;
    try { await update('failed', error.message); } catch { /* An expired lease must never be overwritten. */ }
  } finally { current = null; finalizing = false; }
}
try {
  // Keep inventory and job leases alive while the processor runs.
  const timer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    tickPromise = tick().catch(error => { console.error(error.message); stopProcessor(); stopped = true; }).finally(() => { busy = false; });
  }, 20000);
  try {
    await tick();
    console.log('Worker connected. Waiting for synced batches and draft requests.');
    while (!stopped) {
      if (!busy) {
        const { job } = await api('/api/worker/claim', {});
        if (job) await execute(job);
      }
      if (!stopped) await delay(5000);
    }
  } finally { clearInterval(timer); await tickPromise; }
} finally { await lock.close(); await fs.unlink(lockPath); }
