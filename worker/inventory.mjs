import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const extensions = new Set(['.mov', '.mp4', '.mkv', '.m4v']);
export async function scanInbox(inbox) {
  const root = await fs.realpath(inbox), batches = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const directory = await fs.realpath(path.join(root, entry.name));
    if (path.dirname(directory).toLowerCase() !== root.toLowerCase()) continue;
    const files = [];
    for (const file of await fs.readdir(directory, { withFileTypes: true })) {
      if (!file.isFile() || !extensions.has(path.extname(file.name).toLowerCase())) continue;
      const source = path.join(directory, file.name), stat = await fs.stat(source);
      if (!stat.size) continue;
      files.push({ name: file.name, source, size: stat.size, mtime: stat.mtimeMs });
    }
    files.sort((a,b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    if (!files.length) continue;
    const fingerprint = JSON.stringify(files.map(({ name,size,mtime }) => ({ name,size,mtime })));
    const id = crypto.createHash('sha256').update(entry.name + '\0' + fingerprint).digest('hex');
    batches.push({ id, name: entry.name, files: files.length, bytes: files.reduce((n,f) => n+f.size,0), sources: files });
  }
  return batches;
}
export function stableBatches(previous, current, now, minimumAge = 30000) {
  const seen = new Map(), ready = [];
  for (const batch of current) {
    const since = previous.get(batch.id) ?? now;
    seen.set(batch.id, since);
    if (now - since >= minimumAge && batch.sources.every(f => now - f.mtime >= minimumAge)) ready.push(batch);
  }
  return { seen, ready };
}
