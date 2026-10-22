// Local MCP extension: rebuild a generated timeline inside an actual 9.6 scaffold.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {planSavedTransitions,SAVED_TRANSITION_ID} from './saved_transitions.mjs';
// CapCut's index and metadata carry 19-digit cloud IDs that JSON.parse would round. Keep them
// as tagged strings in memory and emit them as bare digits again on write.
const BIG = '__CUTROOM_BIG__';
export const parseBig = text => JSON.parse(text.replace(/(:\s*)(-?\d{17,})(?=\s*[,}\]])/g, `$1"${BIG}$2"`));
export const stringifyBig = value => JSON.stringify(value).replace(new RegExp(`"${BIG}(-?\\d+)"`, 'g'), '$1');
const load = async p => parseBig(await fs.readFile(p, 'utf8'));
const uid = () => crypto.randomUUID().toUpperCase();
export async function applySavedTransition({directory,backupDirectory,sourceDirectory=process.env.CAPCUT_TRANSITION_SOURCE}) {
  const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH'],{windowsHide:true});
  if(/CapCut\.exe/i.test(stdout))throw new Error('Close CapCut before editing transitions');
  const config=await load(path.join(directory,'Timelines/project.json'));
  const timelinePath=path.join(directory,'Timelines',config.main_timeline_id,'draft_content.json');
  const draft=await load(timelinePath);
  const tracks=draft.tracks.filter(t=>t.type==='video' && t.segments.length);
  if(tracks.length!==1)throw new Error('Expected one main video track');
  const clips=[...tracks[0].segments].sort((a,b)=>a.target_timerange.start-b.target_timerange.start);
  const transitions=draft.materials.transitions||[];
  const ids=new Set(clips.flatMap(s=>s.extra_material_refs||[]));
  let templates=transitions.filter(t=>ids.has(t.id) && t.resource_id===SAVED_TRANSITION_ID);
  if(!templates.length && sourceDirectory) {
    const source=await load(path.join(sourceDirectory,'draft_content.json'));
    const sourceIds=new Set(source.tracks.filter(t=>t.type==='video').flatMap(t=>t.segments.flatMap(s=>s.extra_material_refs||[])));
    templates=(source.materials.transitions||[]).filter(t=>sourceIds.has(t.id) && t.resource_id===SAVED_TRANSITION_ID);
  }
  if(!templates.length || new Set(templates.map(t=>t.resource_id)).size!==1)throw new Error('Expected one saved transition type');
  const template=templates[0];await fs.access(template.path);
  if(!/^\d+$/.test(template.resource_id))throw new Error('Saved resource ID is not a native catalog ID');
  const plan=process.env.CAPCUT_TRANSITION_PLAN ? await load(process.env.CAPCUT_TRANSITION_PLAN) : null;
  const result=planSavedTransitions(draft,template,plan);
  await fs.mkdir(backupDirectory,{recursive:true});
  await fs.cp(directory,path.join(backupDirectory,'project-before-transitions'),{recursive:true,errorOnExist:true,force:false});
  await write(path.join(directory,'draft_content.json'),draft);await write(timelinePath,draft);
  await write(path.join(directory,'template-2.tmp'),draft);
  await write(path.join(path.dirname(timelinePath),'template-2.tmp'),draft);
  return {...result,backupDirectory};
}
export async function useSavedFont({directory,fontPath,layoutPath,backupDirectory}) {
  const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH']);
  if(/CapCut\.exe/i.test(stdout)) throw new Error('Close CapCut before applying the saved font');
  await fs.access(fontPath);
  const contentPath=path.join(directory,'draft_content.json');
  const draft=await load(contentPath);
  const sample=draft.materials.texts.find(m=>m.font_path?.replaceAll('\\','/')===fontPath.replaceAll('\\','/'));
  if(!sample)throw new Error('No caption uses this saved font');
  const savedFont=JSON.parse(sample.content).styles.find(s=>s.font?.path)?.font;
  if(!savedFont)throw new Error('Saved font descriptor is missing');
  const layout=await load(layoutPath);
  const key=(text,start,duration)=>JSON.stringify([text,Math.round(start),Math.round(duration)]);
  const positions=new Map(layout.entries.map(e=>[key(e.text,e.start*1e6,e.duration*1e6),e]));
  await fs.mkdir(backupDirectory,{recursive:true});
  await fs.cp(directory,path.join(backupDirectory,'project-before-font-change'),{recursive:true,errorOnExist:true,force:false});
  for(const mat of draft.materials.texts){
    const content=JSON.parse(mat.content);
    for(const style of content.styles)style.font=structuredClone(savedFont);
    mat.content=JSON.stringify(content);
    mat.font_path=fontPath.replaceAll('\\','/');mat.font_name='Montra';
    for(const field of ['font_id','font_resource_id','font_category_id','font_category_name','font_source_platform'])
      if(field in sample)mat[field]=sample[field];
  }
  let positioned=0;
  for(const [slot,track] of draft.tracks.filter(t=>t.type==='text').entries())for(const seg of track.segments){
    const mat=draft.materials.texts.find(m=>m.id===seg.material_id);
    const text=JSON.parse(mat.content).text;
    const nearest=layout.entries.filter(e=>e.slot===slot && e.text===text && e.highlight===(mat.background_alpha>0))
      .map(e=>({entry:e,error:Math.abs(e.start*1e6-seg.target_timerange.start)+Math.abs(e.duration*1e6-seg.target_timerange.duration)}))
      .sort((a,b)=>a.error-b.error)[0];
    const position=positions.get(key(text,seg.target_timerange.start,seg.target_timerange.duration)) ||
      (nearest?.error<250000?nearest.entry:null);
    if(position){seg.clip.transform.x=position.x;seg.clip.transform.y=position.y;positioned++;}
  }
  if(positioned!==draft.materials.texts.length)throw new Error('Some native text states could not be matched; no files were changed');
  const config=await load(path.join(directory,'Timelines/project.json'));
  const timelinePath=path.join(directory,'Timelines',config.main_timeline_id,'draft_content.json');
  draft.update_time=Date.now()*1000;
  await write(contentPath,draft);await write(timelinePath,draft);
  await write(path.join(directory,'template-2.tmp'),draft);
  await write(path.join(path.dirname(timelinePath),'template-2.tmp'),draft);
  return {font:'Montra',fontResourceId:sample.font_resource_id,textMaterials:draft.materials.texts.length,
    reflowedSegments:positioned,timelineCopiesMatch:(await fs.readFile(contentPath)).equals(await fs.readFile(timelinePath)),backupDirectory};
}
export async function styleReferenceText({directory,fontPath,highlightedIds}) {
  const contentPath=path.join(directory,'draft_content.json');
  const draft=await load(contentPath);
  const highlighted=new Set(highlightedIds);
  await fs.access(fontPath);
  let saved;
  if(process.env.CAPCUT_STYLE_SOURCE){
    const baseline=await load(path.join(process.env.CAPCUT_STYLE_SOURCE,'draft_content.json'));
    saved=baseline.materials.texts.find(m=>m.font_path?.replaceAll('\\','/')===fontPath.replaceAll('\\','/'));
    if(!saved || saved.font_name!=='Montra')throw new Error('Approved Montra baseline is missing');
  }
  for(const mat of draft.materials.texts) {
    const content=JSON.parse(mat.content);
    for(const style of content.styles) {
      const baselineStyle=saved && JSON.parse(saved.content).styles.find(s=>s.font?.path);
      style.font=baselineStyle?structuredClone(baselineStyle.font):{id:'',path:fontPath.replaceAll('\\','/')};
      style.bold=baselineStyle?.bold ?? true;
    }
    mat.content=JSON.stringify(content);
    mat.font_path=fontPath.replaceAll('\\','/');mat.font_name=saved?'Montra':'Montserrat-Black';
    if(saved)for(const field of ['font_id','font_resource_id','font_category_id','font_category_name','font_source_platform'])
      if(field in saved)mat[field]=saved[field];
    mat.has_shadow=true; mat.shadow_color='#000000';mat.shadow_alpha=0.65;
    mat.shadow_distance=3;mat.shadow_smoothing=0.4;mat.shadow_angle=-45;
    mat.text_alignment=1;mat.fixed_width=-1;mat.fixed_height=-1;
    mat.background_color='#8000EE';mat.background_alpha=highlighted.has(mat.id)?1:0;
    mat.background_style=highlighted.has(mat.id)?1:0;mat.background_round_radius=0.15;
    mat.background_width=0.08;mat.background_height=0.08;
    mat.background_horizontal_offset=0;mat.background_vertical_offset=0;
    if(highlighted.has(mat.id))mat.check_flag|=16;
  }
  for(const [i,track] of draft.tracks.entries())
    for(const seg of track.segments) {seg.track_render_index=i;seg.render_index=10000+i;}
  await write(contentPath,draft);
  return {textMaterials:draft.materials.texts.length,highlightedMaterials:highlighted.size};
}
async function write(p, value) {
  const temp = `${p}.${process.pid}.repair.tmp`;
  await fs.writeFile(temp, stringifyBig(value));
  await fs.rename(temp, p);
}
export async function capcutClosed() {
  if (process.platform !== 'win32') return true;
  const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH'],{windowsHide:true});
  return !/CapCut\.exe/i.test(stdout);
}
export async function rebuild({ draftsDir, templateDirectory, sourceDirectory, name, backupDirectory, isClosed = capcutClosed }) {
  if (!name || /[\\/:*?"<>|]/.test(name) || name==='.' || name==='..') throw new Error('Invalid project name');
  const template = path.resolve(templateDirectory);
  const source = path.resolve(sourceDirectory);
  const destination = path.join(path.resolve(draftsDir), name);
  const native = await load(path.join(template, 'draft_content.json'));
  if (native.tracks.some(t => t.segments?.length)) throw new Error('Use an empty native template');
  const generated = await load(path.join(source, 'draft_content.json'));
  const sourceMeta = await load(path.join(source, 'draft_meta_info.json'));
  const templateMeta = await load(path.join(template, 'draft_meta_info.json'));
  const projectConfig = await load(path.join(template, 'Timelines/project.json'));
  try { await fs.access(destination); throw new Error('Destination exists'); } catch(e) { if (e.code!=='ENOENT') throw e; }
  // Every attempt gets its own backup folder so a retry never overwrites the previous index copy.
  backupDirectory = path.join(backupDirectory, new Date().toISOString().replace(/[:.]/g,'-'));
  await fs.mkdir(backupDirectory, {recursive:true});
  const rootIndex = path.join(draftsDir, 'root_meta_info.json');
  let index;
  try {
    index=await load(rootIndex);
    const indexBackup=path.join(backupDirectory,'root_meta_info.before.json');
    await fs.copyFile(rootIndex,indexBackup,fs.constants.COPYFILE_EXCL);
    if(!(await fs.readFile(rootIndex)).equals(await fs.readFile(indexBackup))) throw new Error('Index backup does not match the live index');
  }
  catch(e) { if(e.code!=='ENOENT') throw e; index={all_draft_store:[],draft_ids:0,root_path:draftsDir}; }
  await fs.cp(source,path.join(backupDirectory,'failed-project'),{recursive:true,errorOnExist:true,force:false});
  const projectId = uid(), timelineId = uid(), containerId = uid();
  const replacements = new Map([[templateMeta.draft_id,projectId],[projectConfig.main_timeline_id,timelineId],[projectConfig.id,containerId]]);
  function remap(value) {
    if (typeof value==='string') {
      if (replacements.has(value)) return replacements.get(value);
      return value.replaceAll(template.replaceAll('\\','/'),destination.replaceAll('\\','/')).replaceAll(template,destination);
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));
    return value;
  }
  if (!await isClosed()) throw new Error('CapCut is running; close it before registering a project');
  await fs.cp(template,destination,{recursive:true,errorOnExist:true,force:false,filter:p=>path.basename(p)!=='.locked'});
  // Nothing below touches the index until the folder is fully verified; any failure removes the unregistered folder.
  let content, meta;
  try {
  async function remapJson(dir) {
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      const p=path.join(dir,entry.name);
      if(entry.isDirectory()) await remapJson(p);
      else if(entry.name.endsWith('.json') || entry.name.endsWith('.json.bak')) {
        let value; try {value=await load(p);} catch {continue;}
        await write(p,remap(value));
      }
    }
  }
  await remapJson(destination);
  const oldTimeline=path.join(destination,'Timelines',projectConfig.main_timeline_id);
  await fs.rename(oldTimeline,path.join(destination,'Timelines',timelineId));
  content=remap(native);
  content.id=timelineId; content.name=name; content.duration=generated.duration;
  content.canvas_config=generated.canvas_config; content.fps=generated.fps;
  content.tracks=generated.tracks;
  content.materials={...native.materials,...generated.materials};
  content.keyframes=generated.keyframes;
  content.keyframe_graph_list=generated.keyframe_graph_list;
  content.update_time=Date.now()*1000;
  await write(path.join(destination,'draft_content.json'),content);
  await write(path.join(destination,'Timelines',timelineId,'draft_content.json'),content);
  // CapCut's app-saved cloud project carries the same content here. Leaving
  // the scaffold's empty snapshot produces a stale packaging input even when
  // the visible timeline is valid.
  await write(path.join(destination,'template-2.tmp'),content);
  await write(path.join(destination,'Timelines',timelineId,'template-2.tmp'),content);
  meta=remap(templateMeta);
  meta.draft_id=projectId; meta.draft_name=name;
  meta.draft_root_path=path.resolve(draftsDir); meta.draft_fold_path=destination.replaceAll('\\','/');
  meta.draft_materials=sourceMeta.draft_materials;
  meta.tm_duration=content.duration; meta.tm_draft_create=meta.tm_draft_modified=Date.now()*1000;
  await write(path.join(destination,'draft_meta_info.json'),meta);
  const top=await fs.readFile(path.join(destination,'draft_content.json'));
  const timeline=await fs.readFile(path.join(destination,'Timelines',timelineId,'draft_content.json'));
  if(!top.equals(timeline)) throw new Error('Top-level and timeline drafts differ');
  if(!top.equals(await fs.readFile(path.join(destination,'template-2.tmp')))) throw new Error('Upload snapshot differs from timeline');
  if(!top.equals(await fs.readFile(path.join(destination,'Timelines',timelineId,'template-2.tmp')))) throw new Error('Nested upload snapshot differs from timeline');
  const entry={...meta,draft_json_file:path.join(destination,'draft_content.json'),draft_root_path:draftsDir.replaceAll('\\','/'),draft_cover:path.join(destination,'draft_cover.jpg')};
  delete entry.draft_materials;
  // Re-read the index and re-check CapCut immediately before the only write that makes the project visible.
  if (!await isClosed()) throw new Error('CapCut started during the build; the unregistered folder was removed. Close it and retry');
  try { index=await load(rootIndex); } catch(e) { if(e.code!=='ENOENT') throw e; }
  if (index.all_draft_store.some(d=>d.draft_name===name || d.draft_id===projectId)) throw new Error('A project with this name was registered meanwhile');
  index.all_draft_store.unshift(entry); index.draft_ids=(index.draft_ids||0)+1;
  await write(rootIndex,index);
  } catch(error) {
    await fs.rm(destination,{recursive:true,force:true}).catch(()=>{});
    throw error;
  }
  return {name,destination,projectId,timelineId,durationSeconds:content.duration/1e6,
    clips:content.tracks.flatMap(t=>t.segments).length,newVersion:content.new_version,
    appVersion:content.platform.app_version,timelineCopiesMatch:true,backupDirectory};
}
