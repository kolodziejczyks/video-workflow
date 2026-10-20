import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {stdout}=await promisify(execFile)('C:/Windows/System32/tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/NH'],{windowsHide:true});
if(/CapCut\.exe/i.test(stdout))console.log('CapCut is already running; upload remains unverified.');
else {
 const client=new Client({name:'cutroom-upload-launcher',version:'1.0.0'});
 try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'work/aiperson-capcut-mcp/dist/src/index.js')],stderr:'pipe'}));
  const result=await client.callTool({name:'capcut_open_app',arguments:{}});
  if(result.isError)throw new Error('CapCut could not be opened for automatic upload.');
  console.log('CapCut launch requested. Upload completion still requires local metadata.');
 } finally {await client.close();}
}
