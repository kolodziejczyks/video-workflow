import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanInbox, stableBatches } from '../../../worker/inventory.mjs';
test('inventory uses opaque IDs, ignores non-video files, and requires stability',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'video-inbox-'));
  try {
    await fs.mkdir(path.join(directory,'Batch'));
    await fs.writeFile(path.join(directory,'Batch','take.mov'),'original');
    await fs.writeFile(path.join(directory,'Batch','notes.txt'),'notes');
    let batches=await scanInbox(directory);assert.equal(batches.length,1);assert.equal(batches[0].files,1);assert.match(batches[0].id,/^[a-f0-9]{64}$/);
    const now=Date.now()+60000;
    const first=stableBatches(new Map(),batches,now);assert.equal(first.ready.length,0);
    assert.equal(stableBatches(first.seen,batches,now+31000).ready.length,1);
    const old=batches[0].id;
    await fs.writeFile(path.join(directory,'Batch','take.mov'),'different original');batches=await scanInbox(directory);
    assert.notEqual(batches[0].id,old);assert.equal(stableBatches(first.seen,batches,now+32000).ready.length,0);
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
