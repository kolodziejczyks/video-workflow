import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestTitle, chooseRetake, retakeResolved } from '../shared/review_metadata.mjs';
import { batchProjectName } from '../../../scripts/batch_project_name.mjs';

const review = () => ({lines:[
  {id:'0',text:'Bardzo dobra zmiana.',excluded:false,accepted:true},
  {id:'1',text:'Bardzo dobra decyzja i firmy AI powinny ponosić odpowiedzialność.',excluded:false,accepted:true}
],retakes:[{id:'retake-0-1',lineIds:['0','1'],keepLineIds:null}]});

test('choosing the fuller retake preserves all its continuation and keep-both is explicit',()=>{
  const original=review(), chosen=chooseRetake(original,'retake-0-1',['1']);
  assert.equal(chosen.lines[0].excluded,true);
  assert.equal(chosen.lines[1].text,original.lines[1].text);
  assert.equal(chosen.lines[1].excluded,false);
  assert(retakeResolved(chosen.retakes[0],chosen.lines));
  assert.equal(original.lines[0].excluded,false);
  const both=chooseRetake(chosen,'retake-0-1',['0','1']);
  assert(both.lines.every(l=>!l.excluded));
  assert(retakeResolved(both.retakes[0],both.lines));
});

test('overlapping comparisons can all be confirmed without resetting unchanged choices',()=>{
  const document=review();document.lines.push({id:'2',text:'Another take',excluded:false});
  document.retakes.push({id:'retake-1-2',lineIds:['1','2'],keepLineIds:null});
  const a=chooseRetake(document,'retake-0-1',['0','1']);
  const b=chooseRetake(a,'retake-1-2',['1','2']);
  assert(b.retakes.every(g=>retakeResolved(g,b.lines)));
});

test('title suggestions use included content and approved custom title names the native draft',()=>{
  const title=suggestTitle([{text:'Google publikuje podsumowania AI. Google rozwija AI.',excluded:false},{text:'Banany banany banany',excluded:true}]);
  assert.match(title,/Google/);assert.match(title,/AI/);assert.doesNotMatch(title,/Banany/);
  assert(title.length<=80);
  assert.equal(batchProjectName({projectTitle:'Google i odpowiedzialność za AI',batchName:'1',id:'e8af0f24-d68d-4f3d-b961-66e51ededa05'}),'Google i odpowiedzialność za AI - draft e8af0f24');
});
