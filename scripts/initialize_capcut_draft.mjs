// On-demand desktop initialization of one registered draft: open its card in the CapCut home
// screen, let the editor load, close the editor to return home, then record returned-home so the
// existing cleanup and upload gates apply. Every step observes the real window state first and
// stops on anything unexpected without dismissing prompts, closing other windows or retrying input.
//
//   node scripts/initialize_capcut_draft.mjs <job-uuid> [--dry-run]
//
// Exit codes: 0 done or dry run, 2 deferred (home screen not ready, no state changed), 1 failed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readInitialization, beginOpening, recordReturnedHome, nativeDraftRoot} from '../worker/desktop-initialization.mjs';
import {homeReady, findDraftCard, toScreen, classifyWindows, HOME_CLASS_PREFIX} from '../worker/home-screen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const powershell = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const jobId = process.argv[2] || '';
const dryRun = process.argv.includes('--dry-run');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if (!uuid.test(jobId)) throw new Error('Usage: initialize_capcut_draft.mjs <job-uuid> [--dry-run]');
const jobDirectory = path.join(root, 'work/batches', jobId);
const evidence = path.join(jobDirectory, 'initialization');
const logFile = path.join(jobDirectory, 'initialization.log');
const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function log(event, details = {}) {
  await fs.mkdir(jobDirectory, {recursive: true});
  await fs.appendFile(logFile, `${new Date().toISOString()} ${event} ${JSON.stringify(details)}\n`);
  console.log(event, JSON.stringify(details));
}
async function observe(imagePath) {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/capcut_home_observe.ps1')];
  if (imagePath) args.push('-ImagePath', imagePath);
  const {stdout} = await run(powershell, args, {windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024});
  // PowerShell 5.1 leaves rare control characters from OCR text unescaped; the report is one line, so drop them all.
  let report;
  try { report = JSON.parse(stdout.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')); }
  catch (error) { await fs.mkdir(evidence, {recursive: true}); await fs.writeFile(path.join(evidence, `observe-${stamp()}.txt`), stdout); throw error; }
  report.windows = asArray(report.windows);
  report.lines = asArray(report.lines).map(line => ({...line, words: asArray(line.words)}));
  return report;
}
async function act(mode, window, rolePrefix, extra = []) {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/capcut_home_act.ps1'),
    '-Mode', mode, '-Handle', String(window.handle), '-ExpectedPid', String(window.pid), '-ExpectedClassPrefix', window.class, '-ExpectedRolePrefix', rolePrefix, ...extra];
  const {stdout} = await run(powershell, args, {windowsHide: true, timeout: 30000});
  return JSON.parse(stdout);
}
async function lockedProjects() {
  let count = 0;
  for (const entry of await fs.readdir(nativeDraftRoot, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    try { await fs.access(path.join(nativeDraftRoot, entry.name, '.locked')); count++; } catch {}
  }
  return count;
}
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
class Deferred extends Error {}

try {
  const request = await readInitialization(root, jobId);
  if (!request) throw new Error('No initialization request exists for this job.');
  if (request.status === 'returned_home') { await log('already-initialized', {returnedHomeAt: request.returnedHomeAt}); process.exit(0); }
  if (request.status !== 'pending') throw new Error(`Request is '${request.status}'; confirm the editor is closed, then run capcut_initialization_queue.mjs reset-opening ${jobId}.`);
  const state = JSON.parse(await fs.readFile(path.join(jobDirectory, 'build/state.json'), 'utf8'));
  const project = state.registeredProject;
  if (!project || project.projectId !== request.projectId || project.name !== request.projectName) throw new Error('Registered project does not match the initialization request.');
  const locked = path.join(project.destination, '.locked');

  // 1. The home screen must be the only CapCut window and the desktop must be idle. A manual run
  //    starts right after a keystroke, so wait up to 20 s for idle; a dry run sends no input.
  const minimumIdleMs = dryRun ? 0 : 3000;
  let report, ready;
  for (let i = 0; i < 20; i++) {
    report = await observe();
    ready = homeReady({windows: report.windows, lockedProjects: await lockedProjects(), idleMs: report.idleMs, minimumIdleMs});
    if (ready.ok || !/actively using/.test(ready.reason)) break;
    await sleep(1000);
  }
  if (!ready.ok) throw new Deferred(ready.reason);
  const home = ready.home;

  // 2. Read the home screen and locate the exact card by its job suffix.
  await fs.mkdir(evidence, {recursive: true});
  const image = path.join(evidence, `home-${stamp()}.png`);
  report = await observe(image);
  const card = findDraftCard(report.lines, {projectName: project.name, jobId});
  await fs.writeFile(image.replace(/\.png$/, '.json'), JSON.stringify({windows: report.windows, lines: report.lines, card}, null, 2));
  if (!card.found) throw new Deferred(`${card.reason} Screenshot: ${image}`);
  const target = toScreen(home, card.target);
  await log(dryRun ? 'dry-run' : 'card-located', {window: home.handle, line: card.line, imagePoint: card.target, screenPoint: target, image});
  if (dryRun) process.exit(0);

  // 3. Bring the home window forward, re-verify, persist uncertainty, then double-click the cover.
  const activated = await act('activate', home, HOME_CLASS_PREFIX);
  if (!activated.window?.foreground) throw new Deferred('Could not bring the CapCut home window to the foreground.');
  report = await observe();
  const again = homeReady({windows: report.windows, lockedProjects: await lockedProjects(), idleMs: report.idleMs, minimumIdleMs});
  if (!again.ok || again.home.handle !== home.handle) throw new Deferred(again.reason || 'Home window changed before clicking.');
  await beginOpening(root, jobId);
  await log('begin-opening', {projectId: project.projectId});
  const clicked = await act('double-click', home, HOME_CLASS_PREFIX, ['-X', String(target.x), '-Y', String(target.y)]);
  if (!clicked.sent) throw new Error('Click injection was not accepted.');

  // 4. Wait for exactly this project to open in the editor.
  let editor = null;
  for (let i = 0; i < 60 && !editor; i++) {
    await sleep(1000);
    report = await observe();
    const view = classifyWindows(report.windows);
    if (view.others.length) throw new Error(`A dialog or extra window appeared ('${view.others[0].title}'); leaving everything as is.`);
    if (view.editor && await exists(locked)) editor = view.editor;
  }
  if (!editor) throw new Error('The editor did not open this project within 60 s; request stays "opening".');
  await log('editor-open', {window: editor.handle, page: editor.role, title: editor.title});
  if (!editor.role) throw new Error('The editor window reports no page type; not closing it.');
  const otherLocked = (await lockedProjects()) - 1;
  if (otherLocked > 0) throw new Error('Another project is also marked open; not closing anything.');
  await sleep(10000); // Let the editor finish loading media and write its state.

  // 5. Close the editor through its own close control and wait for the home screen.
  const closed = await act('close-window', editor, editor.role);
  if (!closed.posted) throw new Error('Close request was not delivered.');
  let backHome = null;
  for (let i = 0; i < 60 && !backHome; i++) {
    await sleep(1000);
    report = await observe();
    const view = classifyWindows(report.windows);
    if (view.others.length) throw new Error(`A dialog appeared while closing ('${view.others[0].title}'); leaving it for the user.`);
    if (!report.windows.length) throw new Error('CapCut has no window; it may have exited instead of returning home.');
    if (view.home && !view.editor && !(await exists(locked))) backHome = view.home;
  }
  if (!backHome) throw new Error('The editor did not return to the home screen within 60 s.');
  await sleep(3000);
  const recorded = await recordReturnedHome(root, jobId, project.projectId);
  await log('returned-home', {initializedModified: recorded.initializedModified, home: backHome.handle});
} catch (error) {
  await log(error instanceof Deferred ? 'deferred' : 'failed', {message: error.message});
  process.exit(error instanceof Deferred ? 2 : 1);
}
