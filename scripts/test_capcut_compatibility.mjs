import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Client } from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../work/aiperson-capcut-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaParent = path.join(root, 'work/tools/ffmpeg-essentials');
const mediaBuild = (await fs.readdir(mediaParent)).find(n => n.startsWith('ffmpeg-'));
const mediaBin = path.join(mediaParent, mediaBuild, 'bin');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(root, 'work/compatibility', stamp);
await fs.mkdir(out, { recursive: true });
const nativeRoot = 'C:/Users/bezaw/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft';
const register = process.argv.includes('--register-test');
const drafts = register ? nativeRoot : path.join(out, 'drafts');
await fs.mkdir(drafts, { recursive: true });
const project = register ? `MCP Compatibility 96 ${stamp}` : 'Compatibility96';
const hash = async p => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const original = path.join(nativeRoot, '1019/draft_content.json');
const originalHash = await hash(original);
if (register) {
  const { stdout } = await promisify(execFile)('C:/Windows/System32/tasklist.exe', ['/FI', 'IMAGENAME eq CapCut.exe', '/NH']);
  if (/CapCut\.exe/i.test(stdout)) throw new Error('Close CapCut before registering the disposable test project.');
  // Preserve the project index before adding this new disposable project.
  await fs.copyFile(path.join(nativeRoot, 'root_meta_info.json'), path.join(out, 'root_meta_info.before.json'));
}
const report = { project, drafts, register, calls: [], assertions: [], originalHashBefore: originalHash };
const transport = new StdioClientTransport({ command: process.execPath,
  args: [path.join(root, 'work/aiperson-capcut-mcp/dist/src/index.js')],
  env: { ...process.env, CAPCUT_DRAFTS_PATH: drafts, PATH: mediaBin+path.delimiter+process.env.PATH }, stderr: 'pipe' });
const client = new Client({ name: 'capcut-96-compatibility', version: '1.0.0' });
async function call(name, args) {
  const response = await client.callTool({ name, arguments: args });
  report.calls.push({ name, arguments: args, response });
  console.log(`${name}: ${response.isError ? 'ERROR' : 'OK'}`);
  if (response.isError) throw new Error(JSON.stringify(response));
  const text = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  try { return JSON.parse(text.slice(text.indexOf('{'))); } catch { return text; }
}
function check(name, passed) {
  report.assertions.push({ name, passed: Boolean(passed) });
  if (!passed) throw new Error('Assertion failed: '+name);
}
try {
  await client.connect(transport);
  const tools = await client.listTools();
  report.toolCount = tools.tools.length;
  await call('capcut_create_project', { name: project, ratio: '9:16', fps: 30 });
  const probe = await call('capcut_get_media_info', { file_path: path.join(root, 'samples/IMG_1449.MOV') });
  report.mediaProbe = probe;
  const first = await call('capcut_add_video_clip', { project_name_or_id: project,
    file_path: path.join(root, 'samples/IMG_1449.MOV'), duration_seconds: 4.6, start_time_seconds: 0 });
  await call('capcut_add_video_clip', { project_name_or_id: project,
    file_path: path.join(root, 'samples/IMG_1455.MOV'), source_start_seconds: 0.1, duration_seconds: 5.8, start_time_seconds: 4.6 });
  await call('capcut_set_clip_transform', { project_name_or_id: project, segment_id: first.segmentId, scale: 1.05, x: 0, y: 0 });
  await call('capcut_add_subtitles', { project_name_or_id: project,
    srt_content: '1\n00:00:00,000 --> 00:00:02,650\nLubicie, gdy ktoś wykorzystuje wasze zdjęcia z Instagrama?\n\n2\n00:00:02,850 --> 00:00:04,500\nNie? To lepiej usiądźcie.\n' });
  if (!register) {
    await call('capcut_split_clip', { project_name_or_id: project, segment_id: first.segmentId, split_time_seconds: 2.8 });
    const beforeAudio = await call('capcut_generate_preview', { project_name_or_id: project,
      width: 360, height: 640, output_path: path.join(out, 'video-only-proxy.mp4') });
    report.videoOnlyProxy = beforeAudio;
    const audio = await call('capcut_add_audio_clip', { project_name_or_id: project,
      file_path: path.join(root, 'work/transcripts/IMG_1449.wav'), duration_seconds: 4.6, start_time_seconds: 0, volume: 0.5 });
    await call('capcut_add_audio_fade', { project_name_or_id: project, segment_id: audio.segmentId,
      fade_in_seconds: 0.1, fade_out_seconds: 0.1 });
    await call('capcut_generate_preview', { project_name_or_id: project,
      width: 360, height: 640, output_path: path.join(out, 'separate-audio-proxy.mp4') });
  }
  const details = await call('capcut_get_project', { project_name_or_id: project });
  const draft = details.draftContent;
  const native = JSON.parse(await fs.readFile(original, 'utf8'));
  report.schema = { nativeVersion: native.new_version, generatedVersion: draft.new_version,
    nativeApp: native.platform.app_version, generatedApp: draft.platform.app_version,
    missingTopLevelKeys: Object.keys(native).filter(k => !(k in draft)),
    missingMaterialBuckets: Object.keys(native.materials).filter(k => !(k in draft.materials)) };
  const segments = draft.tracks.flatMap(t => t.segments);
  const materials = Object.values(draft.materials).filter(Array.isArray).flat();
  check('every segment resolves its material', segments.every(s => materials.some(m => m.id === s.material_id)));
  check('Polish caption survives roundtrip', draft.materials.texts.some(m => JSON.parse(m.content).text.includes('zdjęcia')));
  const video = draft.tracks.find(t => t.type === 'video').segments;
  check('source in point retained', video.some(s => s.source_timerange.start === 100000));
  check('timeline duration is 10.4 seconds', draft.duration === 10400000);
  check('no negative source ranges', segments.every(s => !s.source_timerange || s.source_timerange.start >= 0));
  report.projectPath = path.join(drafts, project);
  await fs.copyFile(path.join(drafts, project, 'draft_content.json'), path.join(out, 'generated-draft.json'));
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
} finally {
  await client.close();
  report.originalHashAfter = await hash(original);
  report.originalUnchanged = report.originalHashBefore === report.originalHashAfter;
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Report: '+path.join(out, 'report.json'));
  if (register) console.log('New disposable CapCut project: '+project);
}
