import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import {requestInitialization} from '../worker/desktop-initialization.mjs';
import {ownedInstance} from '../worker/upload-lifecycle.mjs';
import {Client} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jobId=path.basename(process.env.VIDEO_JOB_DIRECTORY || '');
let config={};
try {config=JSON.parse(await fs.readFile(path.join(root,'worker/config.local.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;}
const initialization=['codex','worker'].includes(config.desktopInitialization) ? config.desktopInitialization : null;
if(initialization) {
 if(!/^[a-f0-9-]{36}$/i.test(jobId))throw new Error('An exact job is required for desktop initialization.');
 await requestInitialization(root,jobId);
 console.log(`Desktop initialization queued (${initialization}). Upload cleanup waits for an observed return home.`);
}
const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH'],{windowsHide:true});
if(/CapCut\.exe/i.test(stdout))console.log('CapCut is already running; upload remains unverified.');
else {
 const client=new Client({name:'cutroom-upload-launcher',version:'1.0.0'});
 try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'work/aiperson-capcut-mcp/dist/src/index.js')],stderr:'pipe'}));
  const launchedAt=Date.now();
  const result=await client.callTool({name:'capcut_open_app',arguments:{}});
  if(result.isError)throw new Error('CapCut could not be opened for automatic upload.');
  // The patched MCP server reports the spawned PID on its last output line.
  const lastLine=(result.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n').trim().split('\n').pop();
  let launchedPid=null;
  try {launchedPid=lastLine?.startsWith('{') ? JSON.parse(lastLine).pid : null;} catch {launchedPid=null;}
  console.log(`CapCut launch requested (pid ${launchedPid ?? 'unknown'}). Upload completion still requires local metadata.`);
  // Record ownership only for the instance this job launched, never an existing app.
  if(/^[a-f0-9-]{36}$/i.test(jobId)) {
   let rule=null;
   // CapCut re-launches itself through short-lived processes; on this workstation the home window
   // appeared 25 s after the spawn with its intermediate parent already exited, so keep polling for 90 s.
   for(let attempt=0;attempt<90 && !rule;attempt++) {
    const {stdout}=await promisify(execFile)('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/capcut_upload_process.ps1')],{windowsHide:true});
    const {processInfo,lockedProjects}=JSON.parse(stdout);
    // Prefer exact PID correlation; accept the launch time window only after PID correlation had its chance.
    rule=ownedInstance({launchedPid,launchedAt:attempt>=10?launchedAt:null,processInfo,lockedProjects});
    if(rule) {
     await fs.writeFile(path.join(root,'work/capcut-upload-owner.json'),JSON.stringify({...processInfo,jobId,launchedPid,ownershipRule:rule}));
     console.log(`Ownership recorded for CapCut PID ${processInfo.pid} by rule ${rule}.`);
    } else await new Promise(resolve=>setTimeout(resolve,1000));
   }
   if(!rule)console.log('No CapCut home window could be attributed to this launch; cleanup will not close it.');
   // Worker-driven initialization: open this exact draft once in the editor and return home.
   if(initialization==='worker') {
    const {spawn}=await import('node:child_process');
    const code=await new Promise(resolve=>{
     const child=spawn(process.execPath,[path.join(root,'scripts/initialize_capcut_draft.mjs'),jobId],{cwd:root,stdio:['ignore','inherit','inherit'],windowsHide:true});
     child.on('error',()=>resolve(-1));child.on('exit',resolve);
    });
    console.log(code===0?'Desktop initialization completed.':code===2?'Desktop initialization deferred; run initialize_capcut_draft.mjs later.':'Desktop initialization failed; see initialization.log.');
   }
  }
 } finally {await client.close();}
}
