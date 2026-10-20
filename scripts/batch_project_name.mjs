// Keep the source folder recognizable while separating repeated draft requests.
export function batchProjectName({ batchName, id }) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)) throw new Error('A valid job ID is required for the project name.');
  const folder = Array.from(String(batchName || '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ').trim()).slice(0, 80).join('').replace(/[. ]+$/, '') || 'Recording';
  return `${folder} - draft ${id.slice(0, 8)}`;
}
