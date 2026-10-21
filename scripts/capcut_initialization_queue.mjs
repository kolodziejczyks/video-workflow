import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pendingInitializations, recordReturnedHome, beginOpening} from '../worker/desktop-initialization.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [action, jobId, observedProjectId] = process.argv.slice(2);
if (action === 'pending') console.log(JSON.stringify(await pendingInitializations(root), null, 2));
else if (action === 'begin-opening') console.log(JSON.stringify(await beginOpening(root, jobId), null, 2));
else if (action === 'returned-home') console.log(JSON.stringify(await recordReturnedHome(root, jobId, observedProjectId), null, 2));
else throw new Error('Usage: capcut_initialization_queue.mjs pending | begin-opening <job-uuid> | returned-home <job-uuid> <observed-native-project-id>');
