import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const actual='C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft';
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(root,'work/native-repair',stamp);
await fs.mkdir(out,{recursive:true});
const register=process.argv.includes('--register');
if(register) {
  const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH']);
  if(/CapCut\.exe/i.test(stdout)) throw new Error('CapCut is still running');
}
const drafts=register?actual:path.join(out,'drafts');
await fs.mkdir(drafts,{recursive:true});
const client=new Client({name:'native96-repair',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'work/aiperson-capcut-mcp/dist/src/index.js')],
  env:{...process.env,CAPCUT_DRAFTS_PATH:drafts,CAPCUT_NATIVE_HELPER:pathToFileURL(path.join(root,'scripts/capcut_native_template.mjs')).href},stderr:'pipe'});
try {
  await client.connect(transport);
  const result=await client.callTool({name:'capcut_rebuild_from_native_template',arguments:{
    template_directory:path.join(actual,'1019'),source_directory:path.join(actual,'Polish Samples 2026-10-19T20-12-27-560Z'),
    name:'Polish Samples 96 Repair '+stamp,backup_directory:path.join(out,'backup')}});
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
  if(result.isError) throw new Error(JSON.stringify(result));
  console.log(result.content[0].text);
} finally {await client.close();}
