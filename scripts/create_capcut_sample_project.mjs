// Create a native draft through MCP; never opens or controls the desktop app.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeRoot = 'C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(root, 'work/sample-projects', stamp);
await fs.mkdir(out, { recursive: true });
const files = (await fs.readdir(path.join(root, 'samples')))
  .filter(n => /\.(mov|mp4|mkv)$/i.test(n))
  .sort((a,b) => Number(!a.startsWith('IMG_')) - Number(!b.startsWith('IMG_')) || a.localeCompare(b));
if (!files.length) throw new Error('No sample videos found');
const { stdout } = await promisify(execFile)('C:/Windows/System32/tasklist.exe', ['/FI', 'IMAGENAME eq CapCut.exe', '/NH']);
const running = /CapCut\.exe/i.test(stdout);
if (process.argv.includes('--register') && running) {
  throw new Error('CapCut is still running in the background. Close it before registration; existing staged projects are ready.');
}
const registered = process.argv.includes('--register') && !running;
const drafts = registered ? nativeRoot : path.join(out, 'drafts');
await fs.mkdir(drafts, { recursive: true });
if (registered) await fs.copyFile(path.join(nativeRoot, 'root_meta_info.json'), path.join(out, 'root_meta_info.before.json'));
const project = 'Polish Samples '+stamp;
const builds = path.join(root, 'work/tools/ffmpeg-essentials');
const build = (await fs.readdir(builds)).find(n => n.startsWith('ffmpeg-'));
const mediaBin = path.join(builds, build, 'bin');
const transport = new StdioClientTransport({ command: process.execPath,
  args: [path.join(root, 'work/aiperson-capcut-mcp/dist/src/index.js')],
  env: { ...process.env, CAPCUT_DRAFTS_PATH: drafts, PATH: mediaBin+path.delimiter+process.env.PATH }, stderr: 'pipe' });
const client = new Client({ name: 'polish-samples-project', version: '1.0.0' });
const report = { project, registered, capcutRunning: running, files, clips: [], projectPath: path.join(drafts, project) };
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(JSON.stringify(result));
  const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  return JSON.parse(text.slice(text.indexOf('{')));
}
try {
  await client.connect(transport);
  await call('capcut_create_project', { name: project, ratio: '9:16', fps: 30 });
  for (const file of files) {
    const result = await call('capcut_add_video_clip', { project_name_or_id: project,
      file_path: path.join(root, 'samples', file), start_time_seconds: 'auto_append' });
    report.clips.push({ file, ...result });
    console.log(`Added ${report.clips.length}/${files.length}: ${file}`);
  }
  const details = await call('capcut_get_project', { project_name_or_id: project });
  const draft = details.draftContent;
  const segments = draft.tracks.filter(t => t.type === 'video').flatMap(t => t.segments);
  if (segments.length !== files.length) throw new Error('Clip count mismatch');
  for (let i=1; i<segments.length; i++) {
    if (segments[i].target_timerange.start !== segments[i-1].target_timerange.start+segments[i-1].target_timerange.duration)
      throw new Error('Timeline gap or overlap');
  }
  report.durationSeconds = draft.duration/1e6;
  report.verifiedClipCount = segments.length;
  await fs.writeFile(path.join(out, 'draft-content.json'), JSON.stringify(draft, null, 2));
} catch (e) { report.error = String(e); process.exitCode = 1; }
finally {
  await client.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ project, registered, projectPath: report.projectPath,
    clipCount: report.verifiedClipCount, seconds: report.durationSeconds, capcutRunning: running, report: path.join(out, 'report.json') }));
}
