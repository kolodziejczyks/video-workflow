import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWindows, homeReady, findDraftCard, toScreen} from '../../../worker/home-screen.mjs';

const home={handle:1,pid:4524,class:'Qt622QWindowIcon',role:'HomePageX_QMLTYPE_190',title:'CapCut',left:0,top:0,width:2560,height:1504,minimized:false,foreground:true};
const editor={handle:2,pid:4524,class:'Qt622QWindowIcon',role:'MainWindow_QMLTYPE_7',title:'AI · Google - draft e6e8d6f8',left:0,top:0,width:2560,height:1504,minimized:false,foreground:true};
const dialog={handle:3,pid:4524,class:'Qt622QWindow',role:'',title:'Save project?',left:900,top:600,width:400,height:200,minimized:false,foreground:true};

test('home readiness requires one idle home window, no editor, no dialog and no open project',()=>{
  assert.equal(homeReady({windows:[home],lockedProjects:0,idleMs:10000}).ok,true);
  for(const [input,reason] of [
    [{windows:[],lockedProjects:0,idleMs:10000},/not visible/],
    [{windows:[home,editor],lockedProjects:0,idleMs:10000},/Another CapCut window/],
    [{windows:[home,dialog],lockedProjects:0,idleMs:10000},/Another CapCut window/],
    [{windows:[{...home,minimized:true}],lockedProjects:0,idleMs:10000},/minimized/],
    [{windows:[home],lockedProjects:1,idleMs:10000},/open in the editor/],
    [{windows:[home],lockedProjects:0,idleMs:500},/actively using/],
  ]) { const r=homeReady(input); assert.equal(r.ok,false); assert.match(r.reason,reason); }
  const view=classifyWindows([home,editor,dialog]);
  assert.equal(view.home,home);assert.equal(view.editor,editor);assert.deepEqual(view.others,[dialog]);
});

test('the exact card is found by its unique job suffix and the click lands on the cover above the name',()=>{
  const lines=[
    {text:'Projects',x:100,y:200,w:120,h:30},
    {text:'AI • Google • internecie - draft b4896425',x:300,y:900,w:420,h:24},
    {text:'0.0B 2026-10-21',x:300,y:930,w:150,h:20},
    {text:'Al · Google · internecie - draft e6e8d6f8',x:800,y:900,w:420,h:24},
    {text:'0.0B 2026-10-22',x:800,y:930,w:150,h:20},
  ];
  const job={projectName:'AI · Google · internecie - draft e6e8d6f8',jobId:'e6e8d6f8-5086-4eab-a53d-6051dfce3e3d'};
  const card=findDraftCard(lines,job);
  assert.equal(card.found,true);
  assert.equal(card.line.text,lines[3].text);
  assert.deepEqual(card.target,{x:1010,y:816});
  assert.deepEqual(toScreen({left:10,top:20},card.target),{x:1020,y:836});
  assert.match(findDraftCard(lines,{...job,jobId:'149a86ea-0000-4000-8000-000000000000'}).reason,/No card text/);
  assert.match(findDraftCard([...lines,{text:'copy - draft e6e8d6f8',x:1300,y:900,w:300,h:24}],job).reason,/Ambiguous/);
  assert.match(findDraftCard([{text:'draft e6e8d6f8',x:5,y:10,w:200,h:24}],job).reason,/above the window/);
});
