import test from 'node:test';
import assert from 'node:assert/strict';
import {reconnect} from '../../../worker/reconnect.mjs';

test('idle polling survives server and network failures with bounded backoff', async () => {
  const errors = [Object.assign(new Error('server'), {status:500}), new TypeError('fetch failed'), Object.assign(new Error('server'), {status:503}), Object.assign(new Error('server'), {status:502}), Object.assign(new Error('server'), {status:500})];
  const waits = [];
  const result = await reconnect(async () => {if(errors.length) throw errors.shift(); return {job:null};}, {pause:async ms=>waits.push(ms),report:()=>{}});
  assert.deepEqual(result,{job:null});
  assert.deepEqual(waits,[5000,10000,20000,30000,30000]);
});

test('authentication and lease failures are not retried', async () => {
  for (const status of [401,403,409]) {
    let calls=0;
    await assert.rejects(reconnect(async()=>{calls++;throw Object.assign(new Error('rejected'),{status});},{pause:async()=>assert.fail('must not retry'),report:()=>{}}));
    assert.equal(calls,1);
  }
});
