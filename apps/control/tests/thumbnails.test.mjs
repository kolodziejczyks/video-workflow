import test from 'node:test';
import assert from 'node:assert/strict';
import {thumbnailRoutes,thumbnailKey,thumbnailManifestKey,validateThumbnails} from '../server/thumbnails.mjs';
import worker from '../server/index.mjs';
import {uploadThumbnails} from '../../../worker/thumbnails.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const id='11111111-1111-4111-8111-111111111111';
const frame={id:'a'.repeat(16),source:'0001',sourceName:'A recording.mov',time:1.23,width:1080,height:1920};
const jpeg=new Uint8Array([255,216,1,2,255,217]);
function fixture(){
  const job={status:'running',phase:'transcribe',lease_token:'live',lease_until:Date.now()+90000};
  const objects=new Map();
  const env={DB:{prepare(){return {bind(){return this;},async first(){return job;}};}},REVIEW_AUDIO:{
    async head(key){return objects.get(key)||null;},
    async get(key){const value=objects.get(key);return value?{...value,body:value.bytes,text:async()=>new TextDecoder().decode(value.bytes)}:null;},
    async put(key,bytes,options){objects.set(key,{bytes:typeof bytes==='string'?new TextEncoder().encode(bytes):bytes,size:typeof bytes==='string'?new TextEncoder().encode(bytes).length:bytes.length,customMetadata:options.customMetadata});}
  }};
  const route=async(action='',method='GET',input,machine=false,headers={})=>{
    const url=new URL(`https://control.example/api/${machine?'worker/':''}jobs/${id}/thumbnails${action}`);
    const request=new Request(url,{method,headers:{'X-Worker-Lease':'live',...(input instanceof Uint8Array?{'Content-Type':'image/jpeg','Content-Length':String(input.length)}:{}),...headers},...(input===undefined?{}:{body:input instanceof Uint8Array?input:JSON.stringify(input)})});
    try{return await thumbnailRoutes(request,env,url,machine,(value,status=200)=>Response.json(value,{status}),r=>r.json());}
    catch(e){return Response.json({error:e.message},{status:400});}
  };
  return {env,job,objects,route};
}

test('thumbnail upload is lease protected and manifest only publishes complete image pairs',async()=>{
  const {route,job,objects}=fixture();
  assert.equal((await route(`/${frame.id}`,'PUT',jpeg,true,{'X-Worker-Lease':'stale'})).status,409);
  assert.equal((await route('','POST',{frames:[frame]},true)).status,400);
  assert.equal((await route(`/${frame.id}`,'PUT',jpeg,true)).status,200);
  assert.equal((await route('','POST',{frames:[frame]},true)).status,400);
  assert.equal((await route(`/${frame.id}?preview=1`,'PUT',jpeg,true)).status,200);
  assert.equal((await route('','POST',{frames:[frame]},true)).status,200);
  const originalExpiry=objects.get(thumbnailManifestKey(id)).customMetadata.expiresAt;
  assert.equal((await route('','POST',{frames:[]},true)).status,200);
  assert.equal(objects.get(thumbnailManifestKey(id)).customMetadata.expiresAt,originalExpiry);
  const gallery=await (await route()).json();
  assert.deepEqual(gallery.frames,[frame]);
  job.status='ready'; // Existing jobs can receive prepared galleries, without generation restart.
  assert.equal((await route(`/${frame.id}`,'PUT',jpeg,true)).status,200);
  job.phase='delete';assert.equal((await route()).status,404);
});

test('private preview and full-size downloads expire, unknown frames and invalid payloads fail closed',async()=>{
  const {route,objects}=fixture();
  assert.equal((await route(`/${frame.id}`,'PUT',new Uint8Array([1,2,3,4]),true)).status,400);
  assert.equal((await route(`/${frame.id}`,'PUT',jpeg,true,{'Content-Length':'100'})).status,400);
  for(const suffix of ['', '?preview=1'])await route(`/${frame.id}${suffix}`,'PUT',jpeg,true);
  await route('','POST',{frames:[frame]},true);
  assert.equal((await route(`/${'b'.repeat(16)}`)).status,404);
  const download=await route(`/${frame.id}?download=1`);
  assert.match(download.headers.get('Content-Disposition'),/^attachment; filename="thumbnail-0001-1230ms.jpg"$/);
  assert.equal(download.headers.get('Cache-Control'),'private, no-store');
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()),jpeg);
  assert.equal((await route(`/${frame.id}?preview=1`,'HEAD')).headers.get('Content-Type'),'image/jpeg');
  objects.get(thumbnailKey(id,frame.id)).customMetadata.expiresAt='1';
  assert.equal((await route(`/${frame.id}`)).status,410);
  objects.get(thumbnailManifestKey(id)).customMetadata.expiresAt='1';
  assert.equal((await route()).status,410);
  for(const input of [{frames:Array(7).fill(frame)},{frames:[frame,frame]},{frames:[{...frame,source:'../secret'}]},{frames:[{...frame,time:-1}]}])assert.throws(()=>validateThumbnails(input));
});

test('thumbnail routes require signed user access and machine secrets at the app boundary',async()=>{
  const {env}=fixture();env.WORKER_TOKEN='secret';
  for(const route of [`/api/jobs/${id}/thumbnails`,`/api/jobs/${id}/thumbnails/${frame.id}?download=1`,`/api/worker/jobs/${id}/thumbnails`]){
    assert.equal((await worker.fetch(new Request(`https://control.example${route}`),env)).status,401);
  }
});

test('uploader sends preview and original before manifest; missing or unsafe files never publish a gallery',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cutroom-thumbnails-'));
  try{
    const sent=[];const send=async(...args)=>{sent.push(args);};
    assert.equal(await uploadThumbnails(directory,id,send),false);
    await fs.mkdir(path.join(directory,'thumbnails'));
    const manifest=path.join(directory,'thumbnails/manifest.json');
    await fs.writeFile(manifest,JSON.stringify({frames:[frame]}));
    await fs.writeFile(path.join(directory,`thumbnails/${frame.id}.jpg`),jpeg);
    await assert.rejects(uploadThumbnails(directory,id,send));
    assert.equal(sent.some(([url])=>url.endsWith('/thumbnails')),false);
    await fs.writeFile(path.join(directory,`thumbnails/${frame.id}-preview.jpg`),jpeg);
    sent.length=0;assert.equal(await uploadThumbnails(directory,id,send),true);
    assert.equal(sent.length,3);assert.equal(sent[1][0].endsWith('?preview=1'),true);assert.equal(sent[2][0].endsWith('/thumbnails'),true);
    await fs.writeFile(manifest,JSON.stringify({frames:[{...frame,id:'../../secret'}]}));
    await assert.rejects(uploadThumbnails(directory,id,send),/identity/);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
