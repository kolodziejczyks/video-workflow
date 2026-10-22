import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {removeBatchProject} from '../../../scripts/remove_batch_project.mjs';

const id='11111111-1111-4111-8111-111111111111';
async function fixture(){
  const workspace=await fs.mkdtemp(path.join(fileURLToPath(new URL('../../../work/',import.meta.url)),'removal-tests-'));
  const drafts=path.join(workspace,'drafts'),directory=path.join(workspace,'work','batches',id),name='Test - draft 11111111';
  await fs.mkdir(path.join(drafts,name),{recursive:true});await fs.mkdir(path.join(directory,'build'),{recursive:true});
  await fs.writeFile(path.join(drafts,name,'draft_content.json'),'{}');
  await fs.writeFile(path.join(directory,'original.mov'),'original recording');
  const entry={draft_id:'NATIVE-ID',draft_name:name,draft_fold_path:path.join(drafts,name)};
  const index=path.join(drafts,'root_meta_info.json');
  await fs.writeFile(index,JSON.stringify({all_draft_store:[entry]}));
  await fs.writeFile(path.join(directory,'build','state.json'),JSON.stringify({name,registeredProject:{projectId:entry.draft_id}}));
  return {workspace,drafts,directory,name,entry,index};
}

test('native removal waits, backs up, verifies deletion and is idempotent; source media remains',async()=>{
  const f=await fixture();let calls=0,checks=0,waits=0;
  const options={id,projectName:f.name,...f,isClosed:async()=>++checks>1,pause:async()=>{waits++;},deleteProject:async(draftId,drafts)=>{
    calls++;assert.equal(draftId,f.entry.draft_id,'Deletion must address the exact draft ID, never the name');assert.equal(drafts,f.drafts);
    const target=path.resolve(drafts,f.name);assert.equal(path.dirname(target),path.resolve(f.drafts));
    await fs.rm(target,{recursive:true});await fs.writeFile(f.index,JSON.stringify({all_draft_store:[]}));
  }};
  const result=await removeBatchProject(options);
  assert.equal(waits,1);assert.equal(calls,1);assert.equal(result.status,'removed');
  assert.equal(await fs.readFile(path.join(result.backupDirectory,'project','draft_content.json'),'utf8'),'{}');
  assert.equal(await fs.readFile(path.join(f.directory,'original.mov'),'utf8'),'original recording');
  await removeBatchProject(options);assert.equal(calls,1);
});

test('out-of-root paths and the native template are rejected without deleting anything',async()=>{
  for(const protectedTemplate of [false,true]){
    const f=await fixture();const target=protectedTemplate?path.join(f.drafts,'1019'):path.join(f.workspace,'outside');
    await fs.mkdir(target,{recursive:true});
    await fs.writeFile(f.index,JSON.stringify({all_draft_store:[{...f.entry,draft_name:protectedTemplate?'1019':f.name,draft_fold_path:target}]}));
    await assert.rejects(removeBatchProject({id,projectName:f.name,...f,isClosed:async()=>true,deleteProject:async()=>assert.fail('Must not delete')}),/outside the expected/);
    await fs.access(target);
  }
});

test('a second draft sharing the same name is never deleted: removal addresses the ID and leaves the namesake',async()=>{
  const f=await fixture();
  const namesake=path.join(f.drafts,'namesake-folder');await fs.mkdir(namesake,{recursive:true});await fs.writeFile(path.join(namesake,'draft_content.json'),'{"other":true}');
  const other={draft_id:'OTHER-ID',draft_name:f.name,draft_fold_path:namesake};
  await fs.writeFile(f.index,JSON.stringify({all_draft_store:[other,f.entry]}));
  // Emulate upstream deletion semantics: the first entry matching ID or name is removed, by ID here.
  const deleteProject=async(nameOrId,drafts)=>{
    const index=JSON.parse(await fs.readFile(f.index,'utf8'));
    const item=index.all_draft_store.find(d=>d.draft_id===nameOrId || d.draft_name===nameOrId);
    assert.equal(item.draft_id,f.entry.draft_id);
    await fs.rm(item.draft_fold_path,{recursive:true});
    await fs.writeFile(f.index,JSON.stringify({all_draft_store:index.all_draft_store.filter(d=>d.draft_id!==nameOrId && d.draft_name!==nameOrId)}));
  };
  const result=await removeBatchProject({id,projectName:f.name,...f,isClosed:async()=>true,deleteProject});
  assert.equal(result.status,'removed');
  assert.equal(await fs.readFile(path.join(namesake,'draft_content.json'),'utf8'),'{"other":true}','The namesake draft folder must survive');
  await assert.rejects(fs.access(path.join(f.drafts,f.name)));
  // A missing draft ID or an ID shared by two entries refuses rather than guessing.
  const g=await fixture();
  await fs.writeFile(g.index,JSON.stringify({all_draft_store:[g.entry,{...g.entry,draft_fold_path:path.join(g.drafts,'twin')}]}));
  await assert.rejects(removeBatchProject({id,projectName:g.name,...g,isClosed:async()=>true,deleteProject:async()=>assert.fail('Must not delete')}),/Ambiguous/);
});

test('already missing native project completes without touching another draft',async()=>{
  const f=await fixture();await fs.writeFile(f.index,JSON.stringify({all_draft_store:[]}));
  const target=path.resolve(f.drafts,f.name);assert.equal(path.dirname(target),path.resolve(f.drafts));await fs.rm(target,{recursive:true});
  const result=await removeBatchProject({id,projectName:f.name,...f,isClosed:async()=>true,deleteProject:async()=>assert.fail('No project to delete')});
  assert.equal(result.status,'removed');assert.equal(result.backupDirectory,null);
});
