import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanInbox, stableBatches } from './inventory.mjs';
import {reconnect, temporaryConnectionFailure, shouldStopProcessing} from './reconnect.mjs';
import {observeJobUpload} from './upload-observer.mjs';
import {uploadThumbnails} from './thumbnails.mjs';

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
let stopped = false, child, current = null, seen = new Map(), inventory = [], busy = false, finalizing = false, lastRenewal = 0;
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
async function api(route, input, options = {}) {
  const response = await fetch(new URL(route, base), { method: options.method || 'POST', headers: {
    'Content-Type': options.image ? 'image/jpeg' : options.audio ? 'audio/mpeg' : 'application/json', ...(current ? { 'X-Worker-Lease': current.lease_token } : {}), ...(options.audio || options.image ? { 'Content-Length': String(input.length) } : {}), Authorization: `Bearer ${process.env.VIDEO_WORKER_TOKEN}`,
    ...(process.env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET || '' } : {})
  }, body: options.method === 'GET' ? undefined : options.audio || options.image ? input : JSON.stringify(input), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Object.assign(new Error(`Control API ${response.status}; check authentication, Access policies and the worker lease.`), {status:response.status});
  return response.json();
}
async function update(stage, message = '', projectName) {
  await api(`/api/worker/jobs/${current.id}`, { leaseToken: current.lease_token, stage, message, projectName });
  lastRenewal = Date.now();
  current.stage = stage; current.message = message;
}
async function tick() {
  // An unavailable inbox (Drive not mounted yet) must never end the worker or an active job.
  let inboxMessage = 'Ready for a recording batch.';
  try {
    const scan = stableBatches(seen, await scanInbox(config.inbox), Date.now());
    seen = scan.seen; inventory = scan.ready;
  } catch (error) {
    console.error(`Recording inbox unavailable (${error.code || error.message}); advertising no batches until it returns.`);
    seen = new Map(); inventory = []; inboxMessage = 'Waiting for the recording inbox to become available on the PC.';
  }
  const heartbeat=await api('/api/worker/heartbeat', { batches: inventory.map(({ sources,...batch }) => batch), message: current ? 'Processing a recording batch.' : inboxMessage });
  if (current && !finalizing) {
    let progress;
    try { progress=JSON.parse(await fs.readFile(path.join(work,current.id,'progress.json'),'utf8')); } catch(e) { if(e.code!=='ENOENT')throw e; }
    if (progress?.phase !== current.phase) progress = null;
    await update(progress?.stage || current.stage || 'preparing', progress?.message || current.message || '');
  }
  // Observation must never jeopardize an active processing lease.
  if (!current && Array.isArray(heartbeat.thumbnailJobs)) {
    for(const job of heartbeat.thumbnailJobs) {
      if(!/^[a-f0-9-]{36}$/.test(job.id || ''))continue;
      try {await uploadThumbnails(path.join(work,job.id),job.id,api);}catch {console.error('Thumbnail upload pending; will retry while idle.');break;}
    }
  }
  if (!current && Array.isArray(heartbeat.uploadJobs) && heartbeat.uploadJobs.length) {
    try {
      const observations=[];
      for(const job of heartbeat.uploadJobs) observations.push(await observeJobUpload(work,job));
      await api('/api/worker/uploads',{observations});
    } catch(error) {console.error('Upload observation unavailable; processing remains connected.');}
  }
}
async function runProcessor(command,args,directory,logName){
  const log=await fs.open(path.join(directory,logName),'a');
  try{
    await new Promise((resolve,reject)=>{
      const env={...process.env,VIDEO_JOB_DIRECTORY:directory};
      for(const key of ['VIDEO_WORKER_TOKEN','CF_ACCESS_CLIENT_ID','CF_ACCESS_CLIENT_SECRET'])delete env[key];
      child=spawn(command,args,{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env});
      child.stdout.on('data',chunk=>{log.write(chunk).catch(()=>{});});
      child.stderr.on('data',chunk=>{log.write(chunk).catch(()=>{});});
      child.once('error',reject);
      child.once('exit',code=>code===0?resolve():reject(new Error(`Local processor failed (${code}); see ${logName}.`)));
    });
  }finally{child=null;await log.close();}
}
async function execute(job) {
  current = { ...job, stage: 'preparing' };
  lastRenewal = Date.now();
  try {
    if(job.phase==='delete'){
      const directory=path.join(work,job.id);await fs.mkdir(directory,{recursive:true});
      await update('preparing','Preparing to back up and remove the CapCut draft.');
      await runProcessor(process.execPath,[path.join(root,'scripts/remove_batch_project.mjs'),job.id,job.project_name||''],directory,'removal.log');
      const removed=JSON.parse(await fs.readFile(path.join(directory,'deletion-result.json'),'utf8'));
      if(removed.jobId!==job.id || removed.status!=='removed')throw new Error('Removal was not verified.');
      finalizing=true;await tickPromise;await update('removed','CapCut draft removed. Original recordings and backup were kept.');return;
    }
    await update('preparing', 'Checking the synced batch and staging original recordings.');
    const directory = path.join(work, job.id), media = path.join(directory, 'media');
    const manifest = path.join(directory, 'job.json');
    if (job.phase === 'montage') {
      const staged = JSON.parse(await fs.readFile(manifest,'utf8'));
      for (const source of staged.sources) if (await hashFile(source.path) !== source.sha256) throw new Error('Staged recording changed since transcription.');
      await fs.writeFile(manifest,JSON.stringify({...staged,phase:'montage'}));
    } else {
    const batch = (await scanInbox(config.inbox)).find(b => b.id === job.batch_id);
    if (!batch) throw new Error('The batch changed after submission. Wait for sync, then submit it again.');
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
    await fs.writeFile(manifest, JSON.stringify({ id: job.id, phase: job.phase, batchName: job.batch_name, brief: job.brief, targetSeconds: job.target_seconds, sources, directory }, null, 2));
    }
    if (job.phase === 'montage') {
      const review = await api(`/api/worker/jobs/${job.id}/review`, null, {method:'GET'});
      if (!review.approved) throw new Error('Transcript approval is required.');
      await fs.writeFile(path.join(directory,'approved-review.json'), JSON.stringify(review));
    }
    await runProcessor(config.processor[0],[...config.processor.slice(1),manifest],directory,'processor.log');
    try {await uploadThumbnails(directory,job.id,api);}catch {console.error('Thumbnail upload unavailable; video processing continues.');}
    // The processor must explicitly attest completion; exit 0 alone is insufficient.
    const result = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
    if (result.jobId === job.id && result.status === 'awaiting_review' && job.phase === 'transcribe') {
      const review = JSON.parse(await fs.readFile(path.join(directory,'review.json'),'utf8'));
      for (const source of review.sources) await api(`/api/worker/jobs/${job.id}/audio/${source.id}`, await fs.readFile(path.join(directory,'review-audio',`${source.id}.mp3`)), {method:'PUT',audio:true});
      await api(`/api/worker/jobs/${job.id}/review`,review);
      finalizing = true;
      await tickPromise;
      await update('awaiting_review','Review and accept the transcript before creating your montage.');
      return;
    }
    if (result.jobId !== job.id || result.status !== 'ready' || typeof result.projectName !== 'string' || !result.projectName.trim()) throw new Error('Processor did not return a verified native project result.');
    finalizing = true;
    await tickPromise;
    await update('ready', 'Native draft created. Open CapCut to review wording and cuts.', result.projectName);
    if(config.autoOpenCapCut===true) {
      try {await runProcessor(process.execPath,[path.join(root,'scripts/start_capcut_upload.mjs')],directory,'upload-launch.log');}
      catch {console.error('Draft is ready, but CapCut launch failed. See upload-launch.log.');}
    }
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
    tickPromise = tick().catch(error => {
      console.error(error.message);
      if (!current) { if (!temporaryConnectionFailure(error)) stopped = true; return; }
      // One failed renewal does not lose a 90-second lease; killing the processor mid-registration is the greater risk.
      const reason = shouldStopProcessing(error, {lastRenewal});
      if (!reason) { console.error('Lease still valid; processing continues while the control connection recovers.'); return; }
      console.error(`${reason}; stopping the local processor to protect the job lease.`);
      stopProcessor(); stopped = true;
    }).finally(() => { busy = false; });
  }, 20000);
  try {
    const retryOptions = {pause:delay, report:message=>console.error(message), stopped:()=>stopped};
    await reconnect(tick,retryOptions);
    console.log('Worker connected. Waiting for synced batches and draft requests.');
    while (!stopped) {
      if (!busy) {
        const claimed = await reconnect(()=>api('/api/worker/claim', {capabilities:['project-removal-v1']}),retryOptions);
        if (!claimed || stopped) break;
        const {job} = claimed;
        if (job) await execute(job);
      }
      if (!stopped) await delay(5000);
    }
  } finally { clearInterval(timer); await tickPromise; }
} finally { await lock.close(); await fs.unlink(lockPath); }
