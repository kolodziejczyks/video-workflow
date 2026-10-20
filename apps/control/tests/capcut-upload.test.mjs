import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectUploadRecord} from '../../../worker/capcut-upload.mjs';
const sample = '{"draft_id":"project-1","tm_draft_create":1792521629081000,"tm_draft_modified":1792521629081000,"tm_draft_cloud_completed":"1792522508000","tm_draft_cloud_entry_id":7698825549635912199,"tm_draft_cloud_space_id":7246391828080116738}';
test('matches local upload evidence by exact project and preserves large cloud IDs',()=>{
 const result=inspectUploadRecord(sample,{projectId:'project-1',spaceId:'7246391828080116738'});
 assert.equal(result.status,'recorded_complete');
 assert.equal(result.cloudEntryId,'7698825549635912199');
 assert.equal(result.remoteAvailability,'unverified');
});
test('never confirms stale, mismatched, unbound or incomplete metadata',()=>{
 const options={projectId:'project-1'};
 for(const text of [sample.replace('1792521629081000','1792523508000000'),sample.replace('project-1','other'),sample.replace('7698825549635912199','-1'),'{', '{}',sample.replace('1792522508000','')]) assert.equal(inspectUploadRecord(text,options).status,'unverified');
 assert.equal(inspectUploadRecord(sample,{...options,spaceId:'123'}).status,'unverified');
});
