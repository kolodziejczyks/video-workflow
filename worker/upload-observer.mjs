import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectUploadRecord} from './capcut-upload.mjs';

export async function observeJobUpload(work, job) {
  let result={status:'unverified'};
  try {
    const state=JSON.parse(await fs.readFile(path.join(work,job.id,'build/state.json'),'utf8'));
    const registered=state.registeredProject;
    if (registered?.projectId && registered.name===job.project_name) {
      const text=await fs.readFile(path.join(registered.destination,'draft_meta_info.json'),'utf8');
      result=inspectUploadRecord(text,{projectId:registered.projectId});
    }
  } catch(error) {
    if (!['ENOENT','EACCES','EPERM'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
  }
  return {jobId:job.id,status:result.status,...(result.completedAt?{completedAt:result.completedAt}:{})};
}
