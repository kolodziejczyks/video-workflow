import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory='C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft/Polish Caption Style 2026-10-19T20-23-27-855Z';
const out=path.join(root,'work/transitions',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});
const client=new Client({name:'saved-transition',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'work/aiperson-capcut-mcp/dist/src/index.js')],
 env:{...process.env,CAPCUT_NATIVE_HELPER:pathToFileURL(path.join(root,'scripts/capcut_native_template.mjs')).href},stderr:'pipe'});
try{
 await client.connect(transport);
 const result=await client.callTool({name:'capcut_apply_saved_transition',arguments:{directory,backup_directory:out}});
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
 if(result.isError)throw new Error(JSON.stringify(result));
 console.log(result.content[0].text);
}finally{await client.close();}
