import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../server/index.mjs';
import { validateJob, validateBatches } from '../server/validation.mjs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const batch = { id: 'a'.repeat(64), name: 'First recording', files: 2, bytes: 100 };
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0001_jobs.sql', import.meta.url),'utf8'));
  return { prepare(sql) { let params=[]; return { bind(...values){params=values; return this;}, async first(){return db.prepare(sql).get(...params)||null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...params).changes)}};} }; } };
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
