import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// Entry scripts run as fresh child processes from the worker and scheduled tasks, so a syntax
// error would surface only on the next real job. Parse every tracked module up front.
test('every worker and script module parses', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const files = [];
  for (const directory of ['scripts', 'worker']) {
    for (const name of await fs.readdir(path.join(root, directory))) if (name.endsWith('.mjs')) files.push(path.join(directory, name));
  }
  assert.ok(files.length > 10);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});
