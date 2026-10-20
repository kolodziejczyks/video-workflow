import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectUploadRecord} from '../worker/capcut-upload.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=process.argv[2];
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||''))throw new Error('Pass the Cutroom job UUID.');
const state=JSON.parse(await fs.readFile(path.join(root,'work/batches',id,'build/state.json'),'utf8'));
const project=state.registeredProject;
if(!project?.destination || !project.projectId)throw new Error('No registered native project for this job.');
let result;
try {result=inspectUploadRecord(await fs.readFile(path.join(project.destination,'draft_meta_info.json'),'utf8'),{projectId:project.projectId});}
catch(error){if(error.code!=='ENOENT')throw error;result={status:'unverified',reason:'Registered local project metadata is absent; no upload conclusion can be drawn.'};}
console.log(JSON.stringify({jobId:id,projectName:project.name,...result},null,2));
