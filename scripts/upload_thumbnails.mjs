// Publish prepared images for one existing job, without claiming work or touching CapCut.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {uploadThumbnails} from '../worker/thumbnails.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=process.argv[2];
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id || ''))throw new Error('Supply one existing job UUID.');
const directory=path.join(root,'work/batches',id);
const job=JSON.parse(await fs.readFile(path.join(directory,'job.json'),'utf8'));
if(job.id!==id)throw new Error('Job identity mismatch.');
const config=JSON.parse(await fs.readFile(path.join(root,'worker/config.local.json'),'utf8'));
const base=new URL(config.controlUrl);
if(base.protocol!=='https:' || !process.env.VIDEO_WORKER_TOKEN)throw new Error('Use the existing worker environment and HTTPS configuration.');
const published=await uploadThumbnails(directory,id,async(route,input,options={})=>{
  const response=await fetch(new URL(route,base),{method:options.method || 'POST',headers:{
    Authorization:`Bearer ${process.env.VIDEO_WORKER_TOKEN}`,
    'CF-Access-Client-Id':process.env.CF_ACCESS_CLIENT_ID || '',
    'CF-Access-Client-Secret':process.env.CF_ACCESS_CLIENT_SECRET || '',
    'Content-Type':options.image?'image/jpeg':'application/json',
    ...(options.image?{'Content-Length':String(input.length)}:{})
  },body:options.image?input:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Thumbnail upload failed (${response.status}); no job lifecycle was changed.`);
  return response.json();
});
console.log(published?'Thumbnail gallery published.':'No prepared thumbnail gallery.');
