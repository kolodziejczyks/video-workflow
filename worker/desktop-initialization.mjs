import fs from 'node:fs/promises';
import path from 'node:path';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const nativeDraftRoot = 'C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft';
function requestFile(root, jobId) {
  if (!uuid.test(jobId || '')) throw new Error('Invalid initialization job ID.');
  return path.join(root, 'work/desktop-initialization', `${jobId}.json`);
}
const readJson = async file => JSON.parse((await fs.readFile(file, 'utf8'))
  .replace(/(:\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
async function projectFor(root, jobId, draftRoot) {
  const state = await readJson(path.join(root, 'work/batches', jobId, 'build/state.json'));
  const project = state.registeredProject;
  if (!project || !uuid.test(project.projectId || '') || !project.name || path.basename(project.name) !== project.name) {
    throw new Error('No exact registered project for initialization.');
  }
  const expected = path.resolve(draftRoot, project.name);
  if (path.resolve(project.destination) !== expected || await fs.realpath(expected) !== expected) {
    throw new Error('Initialization project is outside the expected native draft root.');
  }
  const metadata = await readJson(path.join(expected, 'draft_meta_info.json'));
  if (metadata.draft_id !== project.projectId) throw new Error('Native project identity changed.');
  if (!/^\d+$/.test(String(metadata.tm_draft_modified)) || BigInt(metadata.tm_draft_modified) <= 0n) {
    throw new Error('Native project modification timestamp is unavailable.');
  }
  return {project, metadata};
}
function matches(request, project) {
  return request.projectId === project.projectId && request.projectName === project.name;
}
async function save(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2));
  await fs.rename(temporary, file);
}
export async function readInitialization(root, jobId) {
  try { return await readJson(requestFile(root, jobId)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function requestInitialization(root, jobId, {draftRoot = nativeDraftRoot, now = Date.now()} = {}) {
  const file = requestFile(root, jobId);
  const {project, metadata} = await projectFor(root, jobId, draftRoot);
  const existing = await readInitialization(root, jobId);
  if (existing) {
    if (!matches(existing, project)) throw new Error('Initialization request belongs to a different native project.');
    return existing;
  }
  const request = {jobId, projectId: project.projectId, projectName: project.name,
    status: 'pending', requestedAt: new Date(now).toISOString(), baselineModified: String(metadata.tm_draft_modified)};
  await save(file, request);
  return request;
}
// Persist uncertainty before clicking so an interrupted agent cannot blindly reopen.
export async function beginOpening(root, jobId, {draftRoot = nativeDraftRoot, now = Date.now()} = {}) {
  const file = requestFile(root, jobId);
  const request = await readInitialization(root, jobId);
  const {project} = await projectFor(root, jobId, draftRoot);
  if (!request || !matches(request, project) || request.status !== 'pending') throw new Error('Request is not pending; do not retry UI input.');
  const result = {...request, status: 'opening', openingAt: new Date(now).toISOString()};
  await save(file, result);
  return result;
}
// Call only after Computer Use actually observed the exact editor and return home.
// Positive size and changed metadata validate that attestation; they cannot replace it.
export async function recordReturnedHome(root, jobId, observedProjectId, {draftRoot = nativeDraftRoot, now = Date.now()} = {}) {
  const file = requestFile(root, jobId);
  const request = await readInitialization(root, jobId);
  if (!request) throw new Error('No initialization request.');
  const {project, metadata} = await projectFor(root, jobId, draftRoot);
  if (!matches(request, project) || observedProjectId !== project.projectId) throw new Error('Observed editor identity does not match request.');
  const modified = String(metadata.tm_draft_modified);
  if (!/^\d+$/.test(modified) || !/^\d+$/.test(request.baselineModified) || BigInt(modified) <= BigInt(request.baselineModified) ||
      !Number.isSafeInteger(metadata.draft_timeline_materials_size_) || metadata.draft_timeline_materials_size_ <= 0) {
    throw new Error('Editor initialization has not produced a newer draft with media.');
  }
  const result = {...request, status: 'returned_home', returnedHomeAt: new Date(now).toISOString(), initializedModified: modified};
  await save(file, result);
  return result;
}
export async function pendingInitializations(root, {draftRoot = nativeDraftRoot} = {}) {
  const directory = path.join(root, 'work/desktop-initialization');
  let names;
  try { names = await fs.readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const pending = [];
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const jobId = name.slice(0, -5);
    const request = await readInitialization(root, jobId);
    if (!['pending', 'opening'].includes(request.status)) continue;
    const {project} = await projectFor(root, jobId, draftRoot);
    if (!matches(request, project)) throw new Error('Pending initialization identity changed.');
    pending.push(request);
  }
  return pending;
}
