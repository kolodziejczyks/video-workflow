import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {Client} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const actual='C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft';
const publishing=process.argv[2]==='--publish';
const out=publishing?path.resolve(process.argv[3]):path.join(root,'work/reference-style/build-'+new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});
const state=publishing?JSON.parse(await fs.readFile(path.join(out,'state.json'),'utf8')):{
  name:'Polish Caption Style '+new Date().toISOString().replace(/[:.]/g,'-'),out,sourceDirectory:path.join(out,'drafts','CaptionSource')};
const drafts=publishing?actual:path.join(out,'drafts');
await fs.mkdir(drafts,{recursive:true});
const mediaRoot=path.join(root,'work/tools/ffmpeg-essentials');
const mediaBin=path.join(mediaRoot,(await fs.readdir(mediaRoot)).find(n=>n.startsWith('ffmpeg-')),'bin');
const client=new Client({name:'reference-style-builder',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'work/aiperson-capcut-mcp/dist/src/index.js')],
 env:{...process.env,CAPCUT_DRAFTS_PATH:drafts,CAPCUT_NATIVE_HELPER:pathToFileURL(path.join(root,'scripts/capcut_native_template.mjs')).href,
 PATH:mediaBin+path.delimiter+process.env.PATH},stderr:'pipe'});
async function call(name,args){const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r));
 const t=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');return JSON.parse(t.slice(t.indexOf('{')));}
try {
 await client.connect(transport);
 if(!publishing){
   const plan=JSON.parse(await fs.readFile(path.join(root,'work/reference-style/caption-plan.json'),'utf8'));
   await call('capcut_create_project',{name:'CaptionSource',ratio:'9:16',fps:30});
   let offset=0;
   for(const clip of plan.editPlan.clips){
     await call('capcut_add_video_clip',{project_name_or_id:'CaptionSource',file_path:path.join(root,'samples',clip.source),
       start_time_seconds:offset,duration_seconds:clip.out-clip.in,source_start_seconds:clip.in});
     offset+=clip.out-clip.in;
   }
   const highlights=[];
   for(const [i,entry] of plan.entries.entries()){
     const result=await call('capcut_add_text',{project_name_or_id:'CaptionSource',text:entry.text,track_index:entry.slot,
       start_time_seconds:entry.start,duration_seconds:entry.duration,font_size:plan.fontSize,
       border_width:0.025,x:entry.x,y:entry.y});
     if(entry.highlight)highlights.push(result.materialId);
     if(i%40===0)console.log(`Editable caption states: ${i+1}/${plan.entries.length}`);
   }
   state.style=await call('capcut_style_reference_text',{directory:state.sourceDirectory,font_path:plan.fontPath,highlighted_ids:highlights});
   state.durationSeconds=offset;
 }
 const result=await call('capcut_rebuild_from_native_template',{template_directory:path.join(actual,'1019'),
   source_directory:state.sourceDirectory,name:state.name,backup_directory:path.join(out,publishing?'publish-backup':'native-backup')});
 state[publishing?'registeredProject':'stagedProject']=result;
 await fs.writeFile(path.join(out,'state.json'),JSON.stringify(state,null,2));
 console.log(JSON.stringify(state));
}finally{await client.close();}
