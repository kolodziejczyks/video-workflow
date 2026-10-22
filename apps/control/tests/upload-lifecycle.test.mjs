import test from 'node:test';
import assert from 'node:assert/strict';
import {canCloseUpload, ownedInstance} from '../../../worker/upload-lifecycle.mjs';
test('launch ownership prefers the spawned PID or its child and never adopts an unrelated running app',()=>{
 const home={pid:500,parentPid:400,startedAt:new Date(10000).toISOString(),title:'CapCut'};
 assert.equal(ownedInstance({launchedPid:500,processInfo:home,lockedProjects:0}),'launched-pid');
 assert.equal(ownedInstance({launchedPid:400,processInfo:home,lockedProjects:0}),'child-of-launched-pid');
 assert.equal(ownedInstance({launchedPid:999,processInfo:home,lockedProjects:0}),null,'Another PID is not ours');
 assert.equal(ownedInstance({launchedPid:null,launchedAt:null,processInfo:home,lockedProjects:0}),null,'Nothing to correlate');
 assert.equal(ownedInstance({launchedPid:999,launchedAt:9000,processInfo:home,lockedProjects:0,now:20000}),'launch-time-window');
 assert.equal(ownedInstance({launchedPid:999,launchedAt:30000,processInfo:home,lockedProjects:0,now:40000}),null,'Started long before the launch request');
 for(const change of [{title:'My edit'},{pid:500,lockedProjects:1}]) assert.equal(ownedInstance({launchedPid:500,processInfo:{...home,...change},lockedProjects:change.lockedProjects ?? 0}),null);
 assert.equal(ownedInstance({launchedPid:500,processInfo:null,lockedProjects:0}),null);
});
test('upload cleanup requires owned instance, completed upload, settling time and no editor',()=>{
 const input={ownership:{pid:123,startedAt:'same'},processInfo:{pid:123,startedAt:'same',title:'CapCut'},observation:{status:'recorded_complete',completedAt:new Date(1000).toISOString()},lockedProjects:0,now:31000};
 assert.equal(canCloseUpload(input),true);
 for(const change of [{ownership:null},{processInfo:{...input.processInfo,pid:124}},{processInfo:{...input.processInfo,startedAt:'new'}},{processInfo:{...input.processInfo,title:'My edit'}},{lockedProjects:1},{observation:{status:'unverified'}},{now:2000}])assert.equal(canCloseUpload({...input,...change}),false);
 assert.equal(canCloseUpload({...input,initialization:{status:'pending'}}),false,'A pre-initialization completion must not close CapCut');
 assert.equal(canCloseUpload({...input,initialization:{status:'returned_home',initializedModified:'2000000'}}),false,'Old completion must not satisfy a new editor save');
 assert.equal(canCloseUpload({...input,initialization:{status:'returned_home',initializedModified:'999999'}}),true);
});
