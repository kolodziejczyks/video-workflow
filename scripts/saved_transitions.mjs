import path from 'node:path';
import crypto from 'node:crypto';
export const SAVED_TRANSITION_ID = '6724227717195108867';

// Changes only transition materials/references; media and caption timing stay intact.
export function planSavedTransitions(draft, template, plan) {
  if(template.resource_id!==SAVED_TRANSITION_ID || !Number.isFinite(template.duration) || template.duration<=0)
    throw new Error('Expected the saved W lewo native transition');
  const tracks=draft.tracks.filter(t=>t.type==='video' && t.segments.length);
  if(tracks.length!==1)throw new Error('Expected one main video track');
  const clips=[...tracks[0].segments].sort((a,b)=>a.target_timerange.start-b.target_timerange.start);
  if(plan){
    if(!Array.isArray(plan.clips) || plan.clips.length!==clips.length)throw new Error('Transition safety plan does not match the draft');
    let offset=0;
    for(const [i,seg] of clips.entries()){
      const c=plan.clips[i], material=draft.materials.videos.find(m=>m.id===seg.material_id);
      const basename=p=>path.posix.basename(p.replaceAll('\\','/'));
      if(![c.in,c.out,c.speech_out].every(Number.isFinite) || c.in<0 || c.out<=c.in || c.speech_out<c.in || c.speech_out>c.out ||
        !material?.path || basename(material.path)!==c.source ||
        Math.abs(seg.source_timerange.start-c.in*1e6)>2 ||
        Math.abs(seg.source_timerange.duration-(c.out-c.in)*1e6)>2 ||
        Math.abs(seg.target_timerange.duration-(c.out-c.in)*1e6)>2 || Math.abs(seg.target_timerange.start-offset)>2)
        throw new Error('Transition safety plan does not match the draft');
      offset+=seg.target_timerange.duration;
    }
  }
  const transitions=draft.materials.transitions||[];
  let added=0,retained=0,shortened=0,removed=0,skipped=0;
  const removedIds=new Set();
  for(let i=0;i<clips.length-1;i++){
    const seg=clips[i],next=clips[i+1];
    const existing=transitions.filter(t=>(seg.extra_material_refs||[]).includes(t.id));
    if(Math.min(seg.target_timerange.duration,next.target_timerange.duration)<2000000 ||
       (plan && (plan.clips[i].out-plan.clips[i].speech_out)*1e6+1<template.duration)){
      for(const effect of existing)removedIds.add(effect.id);
      seg.extra_material_refs=(seg.extra_material_refs||[]).filter(id=>!removedIds.has(id));
      removed+=existing.length;skipped++;continue;
    }
    if(existing.length){
      if(existing.some(t=>t.resource_id!==SAVED_TRANSITION_ID))throw new Error('Unexpected existing transition');
      retained++;continue;
    }
    const copy=structuredClone(template);copy.id=crypto.randomUUID().toUpperCase();
    copy.duration=Math.min(template.duration,Math.floor(Math.min(seg.target_timerange.duration,next.target_timerange.duration)/2));
    if(copy.duration<template.duration)shortened++;
    transitions.push(copy);seg.extra_material_refs=[...(seg.extra_material_refs||[]),copy.id];added++;
  }
  draft.materials.transitions=transitions.filter(t=>!removedIds.has(t.id));
  return {name:template.name,resourceId:template.resource_id,durationSeconds:template.duration/1e6,
    retained,added,shortened,removed,skipped,cutCount:clips.length-1};
}

export async function prepareBatchTransitions({call,state,backupDirectory}) {
  if(!state.stagedProject?.destination)throw new Error('Missing staged native project');
  const result=await call('capcut_apply_saved_transition',{
    directory:state.stagedProject.destination,backup_directory:backupDirectory});
  return {sourceDirectory:state.stagedProject.destination,result};
}
