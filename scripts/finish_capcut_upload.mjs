import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {observeJobUpload} from '../worker/upload-observer.mjs';
import {canCloseUpload} from '../worker/upload-lifecycle.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=path.join(root,'work/batches');
const ownershipFile=path.join(root,'work/capcut-upload-owner.json');
const logFile=path.join(root,'work/worker-logs/upload-cleanup.log');
const run=promisify(execFile);
async function inspect(args=[]) {
 const {stdout}=await run('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/capcut_upload_process.ps1'),...args],{windowsHide:true,timeout:20000});
 return JSON.parse(stdout);
}
try {
 let ownership;
 try {ownership=JSON.parse(await fs.readFile(ownershipFile,'utf8'));}catch(e){if(e.code==='ENOENT')process.exit(0);throw e;}
 if(!/^[a-f0-9-]{36}$/i.test(ownership.jobId))throw new Error('Invalid upload owner job.');
 const state=JSON.parse(await fs.readFile(path.join(work,ownership.jobId,'build/state.json'),'utf8'));
 const observation=await observeJobUpload(work,{id:ownership.jobId,project_name:state.registeredProject?.name});
 const stateNow=await inspect();
 if(canCloseUpload({ownership,...stateNow,observation})) {
  const result=await inspect(['-Mode','close','-ExpectedPid',String(ownership.pid),'-ExpectedStartedAt',ownership.startedAt]);
  await fs.appendFile(logFile,`${new Date().toISOString()} ${ownership.jobId} ${JSON.stringify(result)}\n`);
  if(result.exited)await fs.unlink(ownershipFile);
 }
}catch(error){
 await fs.appendFile(logFile,`${new Date().toISOString()} Cleanup deferred: ${error.message}\n`);
 process.exitCode=1;
}
