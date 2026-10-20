import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { reviewRoutes, AUDIO_RETENTION_MS, audioKey } from '../server/review.mjs';
import worker from '../server/index.mjs';
import { validateJob, validateBatches } from '../server/validation.mjs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const batch = { id: 'a'.repeat(64), name: 'First recording', files: 2, bytes: 100 };
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0001_jobs.sql', import.meta.url),'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/0002_transcript_review.sql', import.meta.url),'utf8'));
  db.exec(fs.readFileSync(new URL('../migrations/0003_upload_observations.sql', import.meta.url),'utf8'));
  return { async batch(statements) { db.exec('BEGIN'); try { const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results; } catch(e){db.exec('ROLLBACK');throw e;} }, prepare(sql) { let params=[]; return { bind(...values){params=values; return this;}, async first(){return db.prepare(sql).get(...params)||null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...params).changes)}};} }; } };
}
function setup() {
  const env={DB:database(),WORKER_TOKEN:'test-token'};
  const request=async(path,input,token='test-token')=>{
    const response=await worker.fetch(new Request(`https://control.example/api/worker/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(input)}),env);
    return {status:response.status,data:await response.json()};
  };
  const add=async(id,batchId=id)=>env.DB.prepare('INSERT INTO jobs(id,batch_id,batch_name,brief,target_seconds,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,batchId,'Batch','',45,Date.now(),Date.now()).run();
  return {env,request,add};
}
test('upload observations are authenticated, bounded and cannot alter job lifecycle',async()=>{
 const {request,env,add}=setup();
 const ready='11111111-1111-4111-8111-111111111111', processing='22222222-2222-4222-8222-222222222222';
 await add(ready);await add(processing);
 await env.DB.prepare("UPDATE jobs SET status='ready',project_name='Ready draft' WHERE id=?").bind(ready).run();
 const observation={jobId:ready,status:'recorded_complete',completedAt:new Date(Date.now()-1000).toISOString()};
 assert.equal((await request('uploads',{observations:[observation]},'wrong')).status,401);
 assert.equal((await request('uploads',{observations:[{...observation,status:'available_on_phone'}]})).status,400);
 assert.equal((await request('uploads',{observations:[{...observation,completedAt:'invalid'}]})).status,400);
 assert.equal((await request('uploads',{observations:Array(51).fill(observation)})).status,400);
 assert.equal((await request('uploads',{observations:[observation,{...observation,jobId:processing}]})).status,200);
 assert.equal((await env.DB.prepare('SELECT * FROM upload_observations WHERE job_id=?').bind(ready).first()).status,'recorded_complete');
 assert.equal(await env.DB.prepare('SELECT * FROM upload_observations WHERE job_id=?').bind(processing).first(),null);
 assert.equal((await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(ready).first()).status,'ready');
 const heartbeat=await request('heartbeat',{batches:[]});
 assert.deepEqual(heartbeat.data.uploadJobs,[{id:ready,project_name:'Ready draft'}]);
 await request('uploads',{observations:[{jobId:ready,status:'unverified'}]});
 assert.equal((await env.DB.prepare('SELECT * FROM upload_observations WHERE job_id=?').bind(ready).first()).completed_at,null);
 assert.equal((await request('uploads',{observations:[]})).status,200);
});

test('fails closed before Access is configured, including static assets',async()=>{
  const {env}=setup();
  for(const path of ['/','/api/overview','/assets/app.js']) assert.equal((await worker.fetch(new Request(`https://control.example${path}`),env)).status,401);
});
test('machine endpoints require their own secret',async()=>{
  const {request}=setup(); assert.equal((await request('claim',{},'wrong')).status,401);
});
test('heartbeat stores a bounded, validated inventory',async()=>{
  const {request,env}=setup();
  assert.equal((await request('heartbeat',{batches:[batch]})).status,200);
  assert.deepEqual(JSON.parse((await env.DB.prepare('SELECT * FROM worker_state').first()).batches_json),[batch]);
  assert.equal((await request('heartbeat',{batches:[{...batch,id:'../../etc'}]})).status,400);
});
test('only one live lease, stale tokens cannot update or complete reclaimed jobs',async()=>{
  const {request,add,env}=setup(); await add('111');await add('222');
  const first=(await request('claim',{})).data.job; assert.equal(first.id,'111');
  assert.equal((await request('claim',{})).data.job,null);
  assert.equal((await request('jobs/111',{leaseToken:'wrong',stage:'ready'})).status,409);
  await env.DB.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').bind('111').run();
  const reclaimed=(await request('claim',{})).data.job;assert.equal(reclaimed.id,'111');assert.notEqual(first.lease_token,reclaimed.lease_token);
  assert.equal((await request('jobs/111',{leaseToken:first.lease_token,stage:'ready'})).status,409);
  assert.equal((await request('jobs/111',{leaseToken:reclaimed.lease_token,stage:'ready',projectName:'Native draft'})).status,200);
  assert.equal((await request('claim',{})).data.job.id,'222');
});
test('duplicate active batches are rejected by the database, completed batches can run again',async()=>{
  const {add,env}=setup();await add('111','same');await assert.rejects(add('222','same'));
  await env.DB.prepare("UPDATE jobs SET status='ready' WHERE id='111'").run();await add('222','same');
});
test('validates duration, known batch, inventory and brief limits',()=>{
  const good={batchId:batch.id,brief:'  hello  ',targetSeconds:45};
  assert.equal(validateJob(good,[batch]).brief,'hello');
  for(const input of [{...good,batchId:'unknown'},{...good,targetSeconds:0},{...good,targetSeconds:45.1},{...good,brief:'x'.repeat(2001)}]) assert.throws(()=>validateJob(input,[batch]));
  assert.throws(()=>validateBatches([batch,batch]));
});
test('signed user identities enforce allowlist, origin and duplicate submission protection',async()=>{
  const {env,request}=setup();
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='test';jwk.alg='RS256';
  env.ACCESS_TEAM_DOMAIN='test-team.cloudflareaccess.com';env.ACCESS_AUD='test-aud';env.ALLOWED_EMAILS='first@example.com, second@example.com';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({keys:[jwk]});
  const token=async(email,audience='test-aud')=>new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://test-team.cloudflareaccess.com').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  try {
    const user=async(email,method='GET',origin,audience='test-aud')=>worker.fetch(new Request(`https://control.example/api/${method==='GET'?'overview':'jobs'}`,{method,headers:{'Cf-Access-Jwt-Assertion':await token(email,audience),...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({batchId:batch.id,brief:'',targetSeconds:45})}:{})}),env);
    assert.equal((await user('outsider@example.com')).status,401);
    assert.equal((await user('first@example.com','GET',undefined,'wrong-aud')).status,401);
    assert.equal((await user('second@example.com')).status,200);
    assert.equal((await user('first@example.com','POST','https://attacker.example')).status,403);
    assert.equal((await user('first@example.com','POST','https://control.example')).status,409);
    await request('heartbeat',{batches:[batch]});
    assert.equal((await user('first@example.com','POST','https://control.example')).status,201);
    const duplicate=await user('second@example.com','POST','https://control.example');
    assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).existing,true);
  } finally { globalThis.fetch=originalFetch; }
});

test('transcript approval releases the worker and blocks montage until every sentence is accepted', async()=>{
  const {env,request,add}=setup(); await add('111','same');
  await env.DB.prepare("UPDATE jobs SET phase='transcribe' WHERE id='111'").run();
  const job=(await request('claim',{})).data.job;
  const objects=new Map();
  env.REVIEW_AUDIO={
    async head(key){return objects.get(key)||null;},
    async put(key,bytes,options){objects.set(key,{size:bytes.byteLength,customMetadata:options.customMetadata,bytes});},
    async get(key,{range}){const o=objects.get(key);return o?{body:o.bytes.slice(range.offset,range.offset+range.length)}:null;}
  };
  const route=async(action,method,input,machine=false,headers={})=>{
    const url=new URL(`https://control.example/api/${machine?'worker/':''}jobs/111/${action}`);
    const req=new Request(url,{method,headers:{'X-Worker-Lease':job.lease_token,...headers},...(input===undefined?{}:{body:input instanceof Uint8Array?input:JSON.stringify(input)})});
    try{return await reviewRoutes(req,env,url,machine,(value,status=200)=>Response.json(value,{status}),r=>r.json());}
    catch(e){return Response.json({error:e.message},{status:400});}
  };
  const doc={sources:[{id:'0001',name:'Recording.mov'}],lines:[{id:'0',source:'0001',start:1,end:3,text:'Firmy jajowe.',uncertain:['jajowe']}]};
  assert.equal((await request('jobs/111',{leaseToken:job.lease_token,stage:'ready'})).status,409);
  assert.equal((await route('review','POST',doc,true)).status,400);
  assert.equal((await route('audio/0001','PUT',new Uint8Array([1,2,3,4]),true,{'Content-Type':'audio/mpeg','Content-Length':'4'})).status,200);
  assert.equal((await route('review','POST',doc,true)).status,200);
  assert.equal((await route('review','POST',doc,true)).status,200); // interrupted upload retry
  assert.equal((await request('jobs/111',{leaseToken:job.lease_token,stage:'awaiting_review'})).status,200);
  assert.equal((await request('claim',{})).data.job,null);
  await assert.rejects(add('222','same')); // awaiting-review batches cannot be duplicated
  assert.equal((await route('approve','POST',{revision:1})).status,400);
  assert.equal((await route('review','PUT',{revision:1,lines:[{id:'0',text:'Firmy AI.',accepted:true,excluded:false,start:900}]})).status,200);
  assert.equal((await route('review','PUT',{revision:1,lines:[{id:'0',text:'Stale edit',accepted:true,excluded:false}]})).status,409);
  const saved=await (await route('review','GET')).json();
  assert.equal(saved.lines[0].start,1); // client cannot move timing or choose another source
  assert.equal(saved.lines[0].text,'Firmy AI.');
  assert.equal((await route('audio/0001','GET',undefined,false,{Range:'bytes=1-2'})).status,206);
  assert.equal((await route('audio/0001','GET',undefined,false,{Range:'bytes=7-9'})).status,416);
  assert.equal((await route('audio/0002','GET')).status,404);
  assert.equal((await route('approve','POST',{revision:1})).status,409);
  assert.equal((await route('approve','POST',{revision:2})).status,200);
  assert.equal((await route('review','PUT',{revision:2,lines:saved.lines})).status,409);
  const montage=(await request('claim',{})).data.job;
  assert.equal(montage.phase,'montage');
  const expired=objects.get(audioKey('111','0001'));
  expired.customMetadata.expiresAt=String(Date.now()-1);
  assert.equal((await route('audio/0001','GET')).status,410);
  assert.equal(AUDIO_RETENTION_MS,30*86400000);
});

test('unauthenticated and machine identities cannot retrieve private review audio from user routes',async()=>{
  const {env}=setup();
  assert.equal((await worker.fetch(new Request('https://control.example/api/jobs/111/audio/0001',{headers:{Authorization:'Bearer test-token'}}),env)).status,401);
});

test('retake decisions and a custom project title must be saved before approval and remain frozen',async()=>{
  const {env,request,add}=setup();await add('333');
  await env.DB.prepare("UPDATE jobs SET status='awaiting_review',stage='awaiting_review',phase='transcribe' WHERE id='333'").run();
  const document={projectTitle:'AI',retakeReviewVersion:1,sources:[{id:'0001',name:'First'},{id:'0002',name:'Second'}],lines:[
    {id:'0',source:'0001',start:0,end:3,text:'To jest dobra zmiana.',uncertain:[],accepted:true,excluded:false},
    {id:'1',source:'0002',start:0,end:6,text:'To jest dobra decyzja i nowy argument.',uncertain:[],accepted:true,excluded:false}
  ],retakes:[{id:'retake-0-1',lineIds:['0','1'],similarity:.94,keepLineIds:null}]};
  await env.DB.prepare('INSERT INTO transcript_reviews(job_id,document,created_at) VALUES(?,?,?)').bind('333',JSON.stringify(document),Date.now()).run();
  const route=async(action,method,input)=>{
    const url=new URL(`https://control.example/api/jobs/333/${action}`);
    try{return await reviewRoutes(new Request(url,{method,body:JSON.stringify(input)}),env,url,false,(value,status=200)=>Response.json(value,{status}),r=>r.json());}
    catch(e){return Response.json({error:e.message},{status:400});}
  };
  const save={revision:1,projectTitle:'Google i odpowiedzialność za AI',lines:document.lines,retakes:[{id:'retake-0-1',keepLineIds:['0','1']}]};
  assert.equal((await route('approve','POST',{revision:1})).status,400);
  assert.equal((await route('review','PUT',{...save,projectTitle:'../../bad'})).status,400);
  assert.equal((await route('review','PUT',{...save,retakes:[{id:'unknown',keepLineIds:['0']}]})).status,400);
  assert.equal((await route('review','PUT',save)).status,200);
  assert.equal((await route('approve','POST',{revision:1})).status,409);
  assert.equal((await route('approve','POST',{revision:2})).status,200);
  const stored=JSON.parse((await env.DB.prepare('SELECT * FROM transcript_reviews WHERE job_id=?').bind('333').first()).document);
  assert.equal(stored.projectTitle,save.projectTitle);assert.deepEqual(stored.retakes[0].keepLineIds,['0','1']);
  assert.equal(stored.retakeReviewVersion,1);
  assert.equal((await request('claim',{})).data.job.phase,'montage');
  assert.equal((await route('review','PUT',{...save,revision:2,projectTitle:'Changed after approval'})).status,409);
});

test('removal requires confirmation, queues only for capable workers, retries safely and hides only completed removals',async()=>{
  const {env,request,add}=setup();await add('444');
  await env.DB.prepare("UPDATE jobs SET status='ready',project_name='Test draft' WHERE id='444'").run();
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='removal';jwk.alg='RS256';
  env.ACCESS_TEAM_DOMAIN='removal-team.cloudflareaccess.com';env.ACCESS_AUD='remove-aud';env.ALLOWED_EMAILS='owner@example.com';
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});
  const token=await new SignJWT({email:'owner@example.com'}).setProtectedHeader({alg:'RS256',kid:'removal'}).setIssuer('https://removal-team.cloudflareaccess.com').setAudience('remove-aud').setExpirationTime('5m').sign(privateKey);
  const user=async(id,confirm=true,origin='https://control.example')=>worker.fetch(new Request(`https://control.example/api/jobs/${id}`,{method:'DELETE',headers:{'Cf-Access-Jwt-Assertion':token,Origin:origin},body:JSON.stringify({confirm})}),env);
  try{
    assert.equal((await user('444',false)).status,400);
    assert.equal((await user('444',true,'https://attacker.example')).status,403);
    assert.equal((await user('999')).status,404);
    assert.equal((await user('444')).status,202);
    assert.equal((await request('claim',{})).data.job,null);
    const job=(await request('claim',{capabilities:['project-removal-v1']})).data.job;assert.equal(job.phase,'delete');
    assert.equal((await user('444')).status,202);
    assert.equal((await request('jobs/444',{leaseToken:job.lease_token,stage:'ready'})).status,409);
    assert.equal((await request('jobs/444',{leaseToken:job.lease_token,stage:'preparing'})).status,200);
    assert.equal((await env.DB.prepare("SELECT project_name FROM jobs WHERE id='444'").first()).project_name,'Test draft');
    assert.equal((await request('jobs/444',{leaseToken:job.lease_token,stage:'failed',message:'Close CapCut and retry'})).status,200);
    assert.equal((await env.DB.prepare("SELECT status FROM jobs WHERE id='444'").first()).status,'delete_failed');
    assert.equal((await user('444')).status,202);
    const retry=(await request('claim',{capabilities:['project-removal-v1']})).data.job;
    assert.equal((await request('jobs/444',{leaseToken:job.lease_token,stage:'removed'})).status,409);
    assert.equal((await request('jobs/444',{leaseToken:retry.lease_token,stage:'removed'})).status,200);
    const overview=await worker.fetch(new Request('https://control.example/api/overview',{headers:{'Cf-Access-Jwt-Assertion':token}}),env);
    assert.equal((await overview.json()).jobs.length,0);
    assert.equal((await user('444')).status,200);
    await add('555');const active=(await request('claim',{})).data.job;
    assert.equal((await user('555')).status,409);
    assert.equal((await request('jobs/555',{leaseToken:active.lease_token,stage:'removed'})).status,409);
  }finally{globalThis.fetch=oldFetch;}
});
