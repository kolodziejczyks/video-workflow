import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.mjs';
test('HTML fallback and login pages produce a useful connection error, not a JSON parser exception', async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('<!doctype html><html>Preview shell</html>',{headers:{'Content-Type':'text/html'}});
    await assert.rejects(api('/api/overview'),/Check the API connection or sign in again/);
    globalThis.fetch=async()=>Response.json({jobs:[]});
    assert.deepEqual(await api('/api/overview'),{jobs:[]});
    globalThis.fetch=async()=>Response.json({error:'Worker offline'},{status:409});
    await assert.rejects(api('/api/jobs'),/Worker offline/);
  } finally { globalThis.fetch=original; }
});
