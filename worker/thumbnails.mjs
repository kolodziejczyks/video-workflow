import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Independent uploads never carry native-generation completion semantics.
export async function uploadThumbnails(directory, jobId, send) {
  let manifest;
  try {manifest=JSON.parse(await fs.readFile(path.join(directory,'thumbnails','manifest.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
  if(!Array.isArray(manifest.frames) || manifest.frames.length>6)throw new Error('Invalid local thumbnail manifest.');
  const signature=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const stamp=path.join(directory,'thumbnails','uploaded.json');
  try{const saved=JSON.parse(await fs.readFile(stamp,'utf8'));if(saved.signature===signature && saved.jobId===jobId)return true;}catch(error){if(error.code!=='ENOENT' && !(error instanceof SyntaxError))throw error;}
  for(const frame of manifest.frames){
    if(!/^[a-f0-9]{16}$/.test(frame.id))throw new Error('Invalid local thumbnail identity.');
    for(const preview of [false,true]){
      const bytes=await fs.readFile(path.join(directory,'thumbnails',`${frame.id}${preview?'-preview':''}.jpg`));
      await send(`/api/worker/jobs/${jobId}/thumbnails/${frame.id}${preview?'?preview=1':''}`,bytes,{method:'PUT',image:true});
    }
  }
  await send(`/api/worker/jobs/${jobId}/thumbnails`,{frames:manifest.frames});
  await fs.writeFile(stamp,JSON.stringify({signature,jobId,uploadedAt:Date.now()}));
  return true;
}
