import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Windows background wrapper recovers a crashed worker lock but preserves a live owner', {skip:process.platform!=='win32'}, async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cutroom-recovery-'));
 const wrapper=fileURLToPath(new URL('../../../worker/start-background.ps1',import.meta.url));
 try {
  await fs.mkdir(path.join(root,'worker'),{recursive:true});
  await fs.mkdir(path.join(root,'work/batches'),{recursive:true});
  await fs.writeFile(path.join(root,'work/worker.env'),'');
  await fs.writeFile(path.join(root,'worker/run.mjs'),`import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
if(spawnSync('node',['--version'],{windowsHide:true}).status!==0) process.exit(8);
const lock='work/batches/worker.lock';
fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
if(!fs.existsSync('work/crashed')) {fs.writeFileSync('work/crashed','1');process.exit(7);}
fs.writeFileSync('work/recovered','1');fs.unlinkSync(lock);
`);
  const run=()=>spawnSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper,'-RootDirectory',root,'-NodePath',process.execPath],{encoding:'utf8',timeout:20000,windowsHide:true,env:{...process.env,PATH:path.join(process.env.SystemRoot,'System32')}});
  let result=run();assert.equal(result.status,0,result.stderr);
  assert.equal(await fs.readFile(path.join(root,'work/crashed'),'utf8'),'1');
  result=run();assert.equal(result.status,0,result.stderr);
  assert.equal(await fs.readFile(path.join(root,'work/recovered'),'utf8'),'1');
  assert.ok((await fs.readdir(path.join(root,'work/worker-logs'))).some(n=>n.startsWith('stale-lock-')));
  await fs.writeFile(path.join(root,'work/batches/worker.lock'),String(process.pid));
  result=run();assert.equal(result.status,0,result.stderr);
  assert.equal(await fs.readFile(path.join(root,'work/batches/worker.lock'),'utf8'),String(process.pid));
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
