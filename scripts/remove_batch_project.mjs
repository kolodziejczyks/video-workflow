import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nativeRoot='C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft';
async function optional(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function capcutClosed(){const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH']);return !/CapCut\.exe/i.test(stdout);}
// Delete by draft ID only: upstream matches names first and strips every index entry with that name.
async function deleteThroughMcp(draftId,drafts){
  const client=new Client({name:'cutroom-remove-project',version:'1.0.0'});
  try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'work/aiperson-capcut-mcp/dist/src/index.js')],env:{...process.env,CAPCUT_DRAFTS_PATH:drafts},stderr:'pipe'}));
    const result=await client.callTool({name:'capcut_delete_project',arguments:{project_name_or_id:draftId,confirm:true}});
    if(result.isError)throw new Error('CapCut MCP could not remove this draft. Check the local removal log.');
  }finally{await client.close();}
}

export async function removeBatchProject({id,projectName='',workspace=root,drafts=nativeRoot,isClosed=capcutClosed,deleteProject=deleteThroughMcp,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new Error('Invalid removal job ID.');
  const directory=path.join(workspace,'work','batches',id);
  await fs.mkdir(directory,{recursive:true});
  const output=path.join(directory,'deletion-result.json');
  const finished=await optional(output);
  if(finished?.jobId===id && finished.status==='removed')return finished;
  const progress=async(stage,message)=>{
    const file=path.join(directory,'progress.json');await fs.writeFile(file+'.tmp',JSON.stringify({stage,message,phase:'delete'}));await fs.rename(file+'.tmp',file);
  };
  while(!await isClosed()){
    await progress('waiting_for_capcut','Close CapCut when convenient to back up and remove this draft.');
    await pause(10000);
  }
  const state=await optional(path.join(directory,'build','state.json'));
  const result=await optional(path.join(directory,'result.json'));
  const nativeId=state?.registeredProject?.projectId;
  const expected=projectName || result?.projectName || state?.name || '';
  if(expected && (!nativeId && expected!==`Recording Batch ${id}` && !expected.endsWith(` - draft ${id.slice(0,8)}`)))throw new Error('Cannot prove this CapCut project belongs to the removal request.');
  const indexPath=path.join(drafts,'root_meta_info.json');
  const index=JSON.parse(await fs.readFile(indexPath,'utf8'));
  const matches=index.all_draft_store.filter(d=>nativeId ? d.draft_id?.toUpperCase()===nativeId.toUpperCase() : expected && d.draft_name===expected);
  if(matches.length>1)throw new Error('Ambiguous CapCut project; nothing removed.');
  let backupDirectory=null;
  if(matches.length){
    const entry=matches[0],target=path.resolve(entry.draft_fold_path || path.join(drafts,entry.draft_name));
    if(!/^[A-Za-z0-9-]+$/.test(entry.draft_id || ''))throw new Error('CapCut project has no usable draft ID; nothing removed.');
    if(index.all_draft_store.some(d=>d!==entry && (d.draft_id===entry.draft_id || path.resolve(d.draft_fold_path||'')===target)))throw new Error('Another CapCut entry shares this draft ID or folder; nothing removed.');
    const resolvedRoot=await fs.realpath(drafts),resolvedTarget=await fs.realpath(target);
    if(path.dirname(target)!==path.resolve(drafts) || path.dirname(resolvedTarget)!==resolvedRoot || (await fs.lstat(target)).isSymbolicLink() || ['1019','Polish Caption Style 2026-10-19T20-23-27-855Z'].includes(entry.draft_name))throw new Error('Removal target is outside the expected generated-project directory.');
    backupDirectory=path.join(workspace,'work','removed-projects',id,new Date().toISOString().replace(/[:.]/g,'-'));
    await fs.mkdir(backupDirectory,{recursive:true});
    await fs.copyFile(indexPath,path.join(backupDirectory,'root_meta_info.json'));
    await fs.cp(target,path.join(backupDirectory,'project'),{recursive:true,errorOnExist:true,force:false});
    await fs.writeFile(path.join(backupDirectory,'identity.json'),JSON.stringify({jobId:id,projectName:entry.draft_name,projectId:entry.draft_id}));
    if(!await isClosed())throw new Error('CapCut opened during backup. Close it and retry removal; no project was changed.');
    await progress('preparing','Backup saved. Removing the CapCut draft through MCP.');
    await deleteProject(entry.draft_id,drafts);
    const after=JSON.parse(await fs.readFile(indexPath,'utf8'));
    if(after.all_draft_store.some(d=>d.draft_id===entry.draft_id || path.resolve(d.draft_fold_path||'')===target))throw new Error('Project remains in the CapCut index.');
    try{await fs.access(target);throw new Error('Project directory still exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
  }else if(expected){
    // A missing index entry is only idempotent when its directory is also absent.
    if(path.basename(expected)!==expected)throw new Error('Invalid project name.');
    try{await fs.access(path.join(drafts,expected));throw new Error('An unregistered project folder remains; inspect it before removal.');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const removed={jobId:id,status:'removed',projectName:expected,backupDirectory};
  await fs.writeFile(output+'.tmp',JSON.stringify(removed));await fs.rename(output+'.tmp',output);
  return removed;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(await removeBatchProject({id:process.argv[2],projectName:process.argv[3]||''})));
}
