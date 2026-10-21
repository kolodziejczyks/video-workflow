import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {requestInitialization, pendingInitializations, recordReturnedHome, beginOpening} from '../../../worker/desktop-initialization.mjs';

test('initialization queue preserves exact identity and rejects zero-size, stale or wrong editor attestations', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cutroom-initialization-'));
 const jobId='db7c46c3-a1c2-44d3-8a56-bfed0ae0d9df',projectId='23AC2888-13A3-4071-A079-1F2513DB3053';
 const draftRoot=path.join(root,'drafts'),destination=path.join(draftRoot,'Fixture');
 const options={draftRoot,now:1000};
 const metadata={draft_id:projectId,tm_draft_modified:1000000,draft_timeline_materials_size_:0};
 const writeMeta=()=>fs.writeFile(path.join(destination,'draft_meta_info.json'),JSON.stringify(metadata));
 try {
  await fs.mkdir(destination,{recursive:true});
  const build=path.join(root,'work/batches',jobId,'build');await fs.mkdir(build,{recursive:true});
  await fs.writeFile(path.join(build,'state.json'),JSON.stringify({registeredProject:{name:'Fixture',projectId,destination}}));await writeMeta();
  const request=await requestInitialization(root,jobId,options);
  assert.equal((await pendingInitializations(root,options))[0].projectId,projectId);
  assert.deepEqual(await requestInitialization(root,jobId,{...options,now:2000}),request,'Repeated launch must not reset the baseline');
  await assert.rejects(recordReturnedHome(root,jobId,projectId,options),/newer draft with media/);
  metadata.draft_timeline_materials_size_=123;await writeMeta();
  await assert.rejects(recordReturnedHome(root,jobId,projectId,options),/newer draft with media/);
  metadata.tm_draft_modified=2000000;await writeMeta();
  assert.equal((await beginOpening(root,jobId,options)).status,'opening');
  assert.equal((await pendingInitializations(root,options))[0].status,'opening','Interrupted attempts stay visible');
  await assert.rejects(beginOpening(root,jobId,options),/do not retry/);
  await assert.rejects(recordReturnedHome(root,jobId,'wrong',options),/identity/);
  assert.equal((await recordReturnedHome(root,jobId,projectId,options)).status,'returned_home');
  assert.equal((await pendingInitializations(root,options)).length,0);
  metadata.draft_id='replaced';await writeMeta();
  await assert.rejects(requestInitialization(root,jobId,options),/identity changed/);
  await assert.rejects(requestInitialization(root,'../elsewhere',options),/Invalid/);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
