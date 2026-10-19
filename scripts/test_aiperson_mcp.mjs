// Exercise the real stdio MCP protocol against isolated workspace projects.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(root, 'work', 'aiperson-mcp-test', new Date().toISOString().replace(/[:.]/g, '-'));
const drafts = path.join(testRoot, 'drafts');
await fs.mkdir(drafts, { recursive: true });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'work/aiperson-capcut-mcp/dist/src/index.js')],
  env: { ...process.env, CAPCUT_DRAFTS_PATH: drafts,
    PATH: path.dirname(process.execPath) + path.delimiter + 'C:/Users/bezaw/AppData/Local/CapCut/Apps/9.6.0.4097' + path.delimiter + process.env.PATH },
  stderr: 'pipe',
});
let stderr = '';
transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
const client = new Client({ name: 'video-workflow-local-test', version: '1.0.0' });
const report = { testRoot, upstreamCommit: '37e526dfbe427cb71abafe08b799519e42c4105a', calls: [] };
async function call(name, args) {
  const response = await client.callTool({ name, arguments: args });
  report.calls.push({ name, arguments: args, response });
  console.log(name + ': ' + (response.isError ? 'ERROR' : 'OK'));
  return response;
}
function resultJson(response) {
  if (response.isError) throw new Error(JSON.stringify(response));
  const text = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  return JSON.parse(text.slice(text.indexOf('{')));
}
try {
  await client.connect(transport);
  const tools = await client.listTools();
  report.tools = tools.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  console.log('MCP handshake OK; tools: ' + report.tools.length);
  const project = 'MCP_Isolated_Test';
  await call('capcut_create_project', { name: project, ratio: '9:16', fps: 30 });
  await call('capcut_list_projects', {});
  await call('capcut_get_media_info', { file_path: path.join(root, 'samples/IMG_1449.MOV') });
  const baseArgs = { project_name_or_id: project, file_path: path.join(root, 'work/inspection/IMG_1449.jpg'), duration_seconds: 3 };
  const first = resultJson(await call('capcut_add_video_clip', baseArgs));
  const second = resultJson(await call('capcut_add_video_clip', { ...baseArgs, file_path: path.join(root, 'work/inspection/IMG_1455.jpg') }));
  await call('capcut_add_text', { project_name_or_id: project, text: 'Zażółć gęślą jaźń — test polskich napisów', start_time_seconds: 0, duration_seconds: 2 });
  await call('capcut_add_subtitles', { project_name_or_id: project, srt_content: '1\n00:00:01,000 --> 00:00:02,500\nPolskie napisy: ąęłńóśźż\n' });
  await call('capcut_set_clip_transform', { project_name_or_id: project, segment_id: first.segmentId, scale: 1.1, x: 0, y: 0 });
  await call('capcut_add_transition', { project_name_or_id: project, segment_id: first.segmentId, transition_name: 'Dissolve', duration_seconds: 0.3 });
  await call('capcut_add_transition', { project_name_or_id: project, segment_id: second.segmentId, transition_name: 'Dissolve', duration_seconds: 0.3 });
  await call('capcut_add_audio_clip', { project_name_or_id: project, file_path: path.join(root, 'work/transcripts/IMG_1449.wav') });
  await call('capcut_generate_preview', { project_name_or_id: project, width: 360, height: 640, output_path: path.join(testRoot, 'preview.mp4') });
  const detail = resultJson(await call('capcut_get_project', { project_name_or_id: project }));
  report.savedDraft = detail;
  const material = detail.draftContent.materials.transitions;
  report.transitionComparison = material;
} catch (error) {
  report.fatalError = String(error);
  process.exitCode = 1;
} finally {
  await client.close();
  report.serverStderr = stderr;
  await fs.writeFile(path.join(testRoot, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Report: ' + path.join(testRoot, 'report.json'));
}
