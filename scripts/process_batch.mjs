import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = process.argv[2];
if (!manifest) throw new Error('Usage: node scripts/process_batch.mjs <job.json>');
const job = JSON.parse(await fs.readFile(manifest, 'utf8'));
const directory = path.resolve(job.directory);
if (path.dirname(directory) !== path.join(root, 'work', 'batches') || path.basename(directory) !== job.id) throw new Error('Job directory must be an isolated work/batches/<job-id> folder.');
const font = process.env.CAPCUT_MONTRA_FONT || 'C:/Users/bezaw/AppData/Local/CapCut/User Data/Cache/effect/7462281584457125126/6667874da3a7ce4e77b7c2fed5055c3a/font.ttf';
const baseline = process.env.CAPCUT_STYLE_SOURCE || 'C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft/Polish Caption Style 2026-10-19T20-23-27-855Z';
const python = path.join(root, '.venv', 'Scripts', 'python.exe');
const layoutPython = process.env.CAPCUT_LAYOUT_PYTHON || 'C:/Users/bezaw/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const ffmpegRoot = path.join(root, 'work', 'tools', 'ffmpeg-essentials');
const ffmpeg = path.join(ffmpegRoot, (await fs.readdir(ffmpegRoot)).find(n=>n.startsWith('ffmpeg-')), 'bin', 'ffmpeg.exe');
for (const file of [font, path.join(baseline,'draft_content.json'), python, layoutPython, ffmpeg]) await fs.access(file);
const env = { ...process.env, CAPCUT_BATCH_DIRECTORY: directory, CAPCUT_STYLE_SOURCE: baseline };
const progressFile = path.join(directory,'progress.json');
async function progress(stage, message) {
  await fs.writeFile(progressFile+'.tmp', JSON.stringify({ stage, message, phase: job.phase }));
  await fs.rename(progressFile+'.tmp', progressFile);
}
let child;
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { child?.kill(); process.exitCode=1; });
async function run(command, args) {
  await new Promise((resolve,reject) => {
    child=spawn(command,args,{cwd:root,env,windowsHide:true,shell:false,stdio:'inherit'});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error(`Processing command failed (${code}).`)));
  });
  child=null;
}
const stateFile=path.join(directory,'build','state.json');
let state;
try { state=JSON.parse(await fs.readFile(stateFile,'utf8')); } catch(e) { if(e.code!=='ENOENT')throw e; }
if(!state){
  // An interrupted build is preserved and a fresh build is started on retry.
  try { await fs.rename(path.join(directory,'build'),path.join(directory,`build-interrupted-${Date.now()}`)); } catch(e) { if(e.code!=='ENOENT')throw e; }
  await progress('transcribing','Transcribing Polish speech locally.');
  await run(python,[path.join(root,'scripts/transcribe_samples.py'),'--ffmpeg',ffmpeg,'--input',path.join(directory,'media'),'--output',path.join(directory,'transcripts')]);
  if (job.phase === 'transcribe') {
    await run(python,[path.join(root,'scripts/prepare_review.py'),manifest,'--ffmpeg',ffmpeg]);
    await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({jobId:job.id,status:'awaiting_review'}));
    process.exit(0);
  }
  if (job.phase === 'montage') {
    await progress('planning','Aligning your approved wording to the original audio.');
    await run(python,[path.join(root,'scripts/align_review.py'),manifest]);
  }
  await progress('planning',job.phase === 'montage' ? 'Keeping included approved text in recording order, removing near-duplicates, with no duration limit.' : 'Keeping speech in recording order and removing near-duplicate segments.');
  await run(python,[path.join(root,'scripts/plan_batch.py'),manifest]);
  await progress('captions','Creating editable Montra captions with active-word highlights.');
  await run(layoutPython,[path.join(root,'scripts/plan_reference_captions.py'),'--font',font,'--plan',path.join(directory,'edit-plan.json'),'--transcripts',path.join(directory,job.phase === 'montage' ? 'approved-transcripts' : 'transcripts'),'--output',path.join(directory,'caption-plan.json')]);
  await progress('building','Building a separate native CapCut draft through MCP.');
  await run(process.execPath,[path.join(root,'scripts/build_reference_style_project.mjs')]);
  state=JSON.parse(await fs.readFile(stateFile,'utf8'));
}
const draftRoot='C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft';
const destination=path.join(draftRoot,state.name);
let registered=false;
try {
  await fs.access(destination);
  // Recover registration completed just before a process/network interruption.
  const index=JSON.parse(await fs.readFile(path.join(draftRoot,'root_meta_info.json'),'utf8'));
  registered=index.all_draft_store.some(d=>d.draft_name===state.name);
  if(!registered)throw new Error('Destination exists without an index entry; inspect the registration backup before retrying.');
} catch(e) { if(e.code!=='ENOENT')throw e; }
if(!registered){
  while(true){
    const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH']);
    if(!/CapCut\.exe/i.test(stdout))break;
    await progress('waiting_for_capcut','Draft staged. Close CapCut when convenient to register it.');
    await new Promise(resolve=>setTimeout(resolve,10000));
  }
  await progress('building','Registering the new project with an index backup.');
  await run(process.execPath,[path.join(root,'scripts/build_reference_style_project.mjs'),'--publish',path.join(directory,'build')]);
}
const draft=JSON.parse(await fs.readFile(path.join(destination,'draft_content.json'),'utf8'));
const timeline=JSON.parse(await fs.readFile(path.join(destination,'Timelines','project.json'),'utf8'));
const top=await fs.readFile(path.join(destination,'draft_content.json'));
const copy=await fs.readFile(path.join(destination,'Timelines',timeline.main_timeline_id,'draft_content.json'));
if(!top.equals(copy) || !draft.tracks.some(t=>t.type==='video' && t.segments.length))throw new Error('Native project structural verification failed.');
if(!draft.materials.texts.length || draft.materials.texts.some(t=>t.font_name!=='Montra'))throw new Error('Montra caption verification failed.');
await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({jobId:job.id,status:'ready',projectName:state.name,directory:destination,nativePlaybackReview:'pending'},null,2));
