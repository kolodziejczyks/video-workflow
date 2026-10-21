import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Read-only comparison. Never emits caption text, media paths, or cloud IDs.
// A difference is an observation, not proof of remote availability or causality.
const [beforeDirectory, afterDirectory] = process.argv.slice(2);
if (!beforeDirectory || !afterDirectory) {
  throw new Error('Usage: node scripts/inspect_capcut_initialization.mjs <generated-directory> <initialized-directory>');
}
const readJson = async file => JSON.parse((await fs.readFile(file, 'utf8'))
  .replace(/(:\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

async function inspect(directory) {
  const content = await readJson(path.join(directory, 'draft_content.json'));
  const meta = await readJson(path.join(directory, 'draft_meta_info.json'));
  const project = await readJson(path.join(directory, 'Timelines/project.json'));
  const files = {};
  async function scan(relative = '') {
    for (const entry of await fs.readdir(path.join(directory, relative), {withFileTypes: true})) {
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Refusing to follow a project symlink');
      if (entry.isDirectory()) await scan(child);
      else {
        const data = await fs.readFile(path.join(directory, child));
        const name = child.split(path.sep).map(part => part === project.main_timeline_id ? '<timeline>' : part).join('/');
        files[name] = {bytes: data.length, sha256: hash(data)};
      }
    }
  }
  await scan();
  const materials = (meta.draft_materials || []).flatMap(group => group.value || []);
  const videos = content.materials?.videos || [];
  const sourcePaths = [...new Set(videos.map(video => video.path).filter(Boolean))];
  let existingSources = 0, sourceBytes = 0;
  for (const file of sourcePaths) {
    try { const stat = await fs.stat(file); if (stat.isFile()) {existingSources++; sourceBytes += stat.size;} }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return {
    files,
    duration: content.duration,
    tracks: content.tracks.map(track => ({type: track.type, segments: track.segments.length})),
    materials: Object.fromEntries(Object.entries(content.materials).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
    sourceCoverage: {uniqueSources: sourcePaths.length, existingSources, sourceBytes,
      videos: videos.length, metadataPathMatches: videos.filter(video => materials.some(material => material.file_Path === video.path)).length},
    recordedTimelineMaterialBytes: meta.draft_timeline_materials_size_,
    snapshots: Object.fromEntries(['template-2.tmp', 'Timelines/<timeline>/draft_content.json', 'Timelines/<timeline>/template-2.tmp'].map(file => [file, !!files[file] && files[file].sha256 === files['draft_content.json'].sha256]))
  };
}

const before = await inspect(path.resolve(beforeDirectory));
const after = await inspect(path.resolve(afterDirectory));
const summarize = ({files, ...summary}) => summary;
console.log(JSON.stringify({
  limitation: 'Generated and initialized files are correlated observations; this does not test upload or mobile availability. UUID registration, editor normalization and cloud upload can all contribute differences.',
  before: summarize(before), after: summarize(after),
  files: {
    added: Object.keys(after.files).filter(file => !before.files[file]),
    removed: Object.keys(before.files).filter(file => !after.files[file]),
    changed: Object.keys(before.files).filter(file => after.files[file] && before.files[file].sha256 !== after.files[file].sha256)
      .map(file => ({file, beforeBytes: before.files[file].bytes, afterBytes: after.files[file].bytes}))
  }
}, null, 2));
