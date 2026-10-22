import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {rebuild} from '../../../scripts/capcut_native_template.mjs';

test('native rebuild replaces the empty upload snapshot with the generated timeline',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cutroom-upload-snapshot-'));
 const template=path.join(root,'template'),source=path.join(root,'source');
 const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value));};
 try {
  const empty={id:'empty-timeline',duration:0,tracks:[],materials:{videos:[]},platform:{app_version:'9.6.0'},new_version:'189.0.0'};
  await write(path.join(template,'draft_content.json'),empty);
  await write(path.join(template,'template-2.tmp'),empty);
  await write(path.join(template,'draft_meta_info.json'),{draft_id:'empty-project'});
  await write(path.join(template,'Timelines/project.json'),{id:'empty-container',main_timeline_id:'empty-timeline'});
  await write(path.join(template,'Timelines/empty-timeline/draft_content.json'),empty);
  await write(path.join(template,'Timelines/empty-timeline/template-2.tmp'),empty);
  await write(path.join(source,'draft_content.json'),{duration:1000000,tracks:[{type:'video',segments:[{material_id:'video'}]}],materials:{videos:[{id:'video',path:'fixture.mov'}]}});
  await write(path.join(source,'draft_meta_info.json'),{draft_materials:[]});
  const drafts=path.join(root,'drafts'),rootIndex=path.join(drafts,'root_meta_info.json');
  await write(rootIndex,{all_draft_store:[{draft_id:'EXISTING',draft_name:'Existing draft'}],draft_ids:1});
  const before=await fs.readFile(rootIndex,'utf8');
  // CapCut running at the final check: the folder must be removed and the index untouched.
  let checks=0;
  await assert.rejects(rebuild({draftsDir:drafts,templateDirectory:template,sourceDirectory:source,name:'Upload fixture',backupDirectory:path.join(root,'backup'),isClosed:async()=>++checks<2}),/CapCut started/);
  await assert.rejects(fs.access(path.join(drafts,'Upload fixture')),'Unregistered folder must not remain');
  assert.equal(await fs.readFile(rootIndex,'utf8'),before,'Index must not change when registration aborts');
  const result=await rebuild({draftsDir:drafts,templateDirectory:template,sourceDirectory:source,name:'Upload fixture',backupDirectory:path.join(root,'backup'),isClosed:async()=>true});
  const content=await fs.readFile(path.join(result.destination,'draft_content.json'),'utf8');
  assert.equal(await fs.readFile(path.join(result.destination,'template-2.tmp'),'utf8'),content,'Upload snapshot still contains the empty template');
  assert.equal(await fs.readFile(path.join(result.destination,'Timelines',result.timelineId,'draft_content.json'),'utf8'),content);
  const nestedSnapshot=JSON.parse(await fs.readFile(path.join(result.destination,'Timelines',result.timelineId,'template-2.tmp'),'utf8'));
  assert.equal(nestedSnapshot.tracks[0]?.segments.length,1,'Nested upload snapshot still contains the empty template');
  assert.deepEqual(nestedSnapshot,JSON.parse(content));
  const index=JSON.parse(await fs.readFile(rootIndex,'utf8'));
  assert.deepEqual(index.all_draft_store.map(d=>d.draft_name),['Upload fixture','Existing draft']);
  // Each attempt keeps its own index backup that matches the index it replaced.
  const attempts=await fs.readdir(path.join(root,'backup'));
  assert.equal(attempts.length,2,'Retry must not overwrite the previous attempt backup');
  assert.equal(await fs.readFile(path.join(result.backupDirectory,'root_meta_info.before.json'),'utf8'),before);
  await assert.rejects(rebuild({draftsDir:drafts,templateDirectory:template,sourceDirectory:source,name:'Upload fixture',backupDirectory:path.join(root,'backup'),isClosed:async()=>true}),/Destination exists/);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
