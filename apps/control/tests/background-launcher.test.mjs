import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('windowless task launcher waits for cleanup, preserves paths and returns failures', {skip:process.platform!=='win32'}, async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cutroom launcher '));
 try {
  await fs.mkdir(path.join(root,'worker'));
  await fs.mkdir(path.join(root,'scripts'));
  await fs.copyFile(new URL('../../../worker/launch-background.vbs',import.meta.url),path.join(root,'worker/launch-background.vbs'));
  await fs.writeFile(path.join(root,'scripts/finish_capcut_upload.mjs'),`import fs from 'node:fs'; fs.writeFileSync('result.json',JSON.stringify({cwd:process.cwd()})); process.exit(7);`);
  const result=spawnSync(path.join(process.env.SystemRoot,'System32/wscript.exe'),['//B','//NoLogo',path.join(root,'worker/launch-background.vbs'),'cleanup',process.execPath],{windowsHide:true,timeout:15000});
  assert.equal(result.status,7);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'result.json'),'utf8')).cwd,root);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
