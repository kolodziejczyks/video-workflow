import test from 'node:test';
import assert from 'node:assert/strict';
import {canCloseUpload} from '../../../worker/upload-lifecycle.mjs';
test('upload cleanup requires owned instance, completed upload, settling time and no editor',()=>{
 const input={ownership:{pid:123,startedAt:'same'},processInfo:{pid:123,startedAt:'same',title:'CapCut'},observation:{status:'recorded_complete',completedAt:new Date(1000).toISOString()},lockedProjects:0,now:31000};
 assert.equal(canCloseUpload(input),true);
 for(const change of [{ownership:null},{processInfo:{...input.processInfo,pid:124}},{processInfo:{...input.processInfo,startedAt:'new'}},{processInfo:{...input.processInfo,title:'My edit'}},{lockedProjects:1},{observation:{status:'unverified'}},{now:2000}])assert.equal(canCloseUpload({...input,...change}),false);
 assert.equal(canCloseUpload({...input,initialization:{status:'pending'}}),false,'A pre-initialization completion must not close CapCut');
 assert.equal(canCloseUpload({...input,initialization:{status:'returned_home',initializedModified:'2000000'}}),false,'Old completion must not satisfy a new editor save');
 assert.equal(canCloseUpload({...input,initialization:{status:'returned_home',initializedModified:'999999'}}),true);
});
