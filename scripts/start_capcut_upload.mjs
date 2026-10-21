import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import {requestInitialization} from '../worker/desktop-initialization.mjs';
import {Client} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const jobId=path.basename(process.env.VIDEO_JOB_DIRECTORY || '');
let config={};
try {config=JSON.parse(await fs.readFile(path.join(root,'worker/config.local.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;}
if(config.desktopInitialization==='codex') {
 if(!/^[a-f0-9-]{36}$/i.test(jobId))throw new Error('An exact job is required for desktop initialization.');
 await requestInitialization(root,jobId);
 console.log('Desktop initialization queued. Upload cleanup waits for an observed return home.');
}
const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH'],{windowsHide:true});
if(/CapCut\.exe/i.test(stdout))console.log('CapCut is already running; upload remains unverified.');
else {
 const client=new Client({name:'cutroom-upload-launcher',version:'1.0.0'});
 try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'work/aiperson-capcut-mcp/dist/src/index.js')],stderr:'pipe'}));
  const result=await client.callTool({name:'capcut_open_app',arguments:{}});
  if(result.isError)throw new Error('CapCut could not be opened for automatic upload.');
  console.log('CapCut launch requested. Upload completion still requires local metadata.');
  // Record ownership only for the instance this job launched, never an existing app.
  if(/^[a-f0-9-]{36}$/i.test(jobId)) {
   for(let attempt=0;attempt<15;attempt++) {
    const {stdout}=await promisify(execFile)('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/capcut_upload_process.ps1')],{windowsHide:true});
    const {processInfo,lockedProjects}=JSON.parse(stdout);
    if(processInfo?.title==='CapCut' && lockedProjects===0) {
     await fs.writeFile(path.join(root,'work/capcut-upload-owner.json'),JSON.stringify({...processInfo,jobId}));break;
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
   }
  }
 } finally {await client.close();}
}
