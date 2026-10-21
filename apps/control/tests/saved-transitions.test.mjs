import test from 'node:test';
import assert from 'node:assert/strict';
import {planSavedTransitions,prepareBatchTransitions,SAVED_TRANSITION_ID} from '../../../scripts/saved_transitions.mjs';
const template={id:'saved',resource_id:SAVED_TRANSITION_ID,effect_id:SAVED_TRANSITION_ID,name:'W lewo',duration:466667,path:'real-cache'};
function fixture(durations=[3,3,1,3,3,3],tails=[.5,.5,.5,.1,.5,.5]){
 let offset=0;
 const clips=durations.map((duration,i)=>({source:`${i}.mov`,in:1,out:1+duration,speech_out:1+duration-tails[i]}));
 const segments=clips.map((c,i)=>{const s={material_id:`v${i}`,source_timerange:{start:1e6,duration:durations[i]*1e6},target_timerange:{start:offset,duration:durations[i]*1e6},extra_material_refs:['speed']};offset+=durations[i]*1e6;return s;});
 return {plan:{clips},draft:{duration:offset,tracks:[{type:'video',segments},{type:'text',segments:[{target_timerange:{start:123,duration:456},material_id:'text'}]}],materials:{videos:clips.map((c,i)=>({id:`v${i}`,path:`C:/media/${c.source}`})),texts:[{id:'text',content:'approved'}],transitions:[]}}};
}
function timing(d){const c=structuredClone(d);delete c.materials.transitions;for(const t of c.tracks)if(t.type==='video')for(const s of t.segments)delete s.extra_material_refs;return c;}
test('saved transitions skip short neighbors and insufficient speech tails without changing timing',()=>{
 const {draft,plan}=fixture(),before=timing(draft);
 const result=planSavedTransitions(draft,template,plan);
 assert.equal(result.added,2);assert.equal(result.skipped,3);
 assert.deepEqual(draft.tracks[0].segments.map(s=>s.extra_material_refs.length),[2,1,1,1,2,1]);
 assert.deepEqual(timing(draft),before);
 assert.ok(draft.materials.transitions.every(t=>t.resource_id===SAVED_TRANSITION_ID && t.effect_id===SAVED_TRANSITION_ID));
 assert.equal(planSavedTransitions(draft,template,plan).retained,2);
 assert.equal(draft.materials.transitions.length,2);
 // Retrying after a tighter plan removes an unsafe existing effect.
 plan.clips[0].speech_out=plan.clips[0].out;
 assert.equal(planSavedTransitions(draft,template,plan).removed,1);
});
test('single clips and unpadded speech remain clean',()=>{
 for(const [durations,tails] of [[[3],[.5]],[[3,3],[0,0]]]){
  const {draft,plan}=fixture(durations,tails);
  assert.equal(planSavedTransitions(draft,template,plan).added,0);
 }
});
test('rejects mismatched safety plans and fabricated resources',()=>{
 for(const mutate of [f=>f.plan.clips.reverse(),f=>f.plan.clips[0].in=.8,f=>f.plan.clips[0].speech_out=NaN,f=>f.draft.tracks[0].segments[1].target_timerange.start+=10,f=>f.draft.tracks[0].segments[0].target_timerange.duration=2e6]){
  const f=fixture();mutate(f);
  assert.throws(()=>planSavedTransitions(f.draft,template,f.plan),/does not match/);
 }
 const f=fixture();assert.throws(()=>planSavedTransitions(f.draft,{...template,resource_id:'random'},f.plan),/saved W lewo/);
});
test('batch registration uses the MCP-edited staged draft and propagates failures',async()=>{
 const state={sourceDirectory:'caption-source',stagedProject:{destination:'staged-native'}};
 const calls=[];
 const prepared=await prepareBatchTransitions({state,backupDirectory:'backup',call:async(name,args)=>{calls.push({name,args});return {added:2};}});
 assert.deepEqual(calls,[{name:'capcut_apply_saved_transition',args:{directory:'staged-native',backup_directory:'backup'}}]);
 assert.equal(prepared.sourceDirectory,'staged-native');assert.equal(prepared.result.added,2);
 await assert.rejects(prepareBatchTransitions({state,call:async()=>{throw new Error('Close CapCut');}}),/Close CapCut/);
});
