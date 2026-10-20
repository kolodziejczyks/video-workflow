export function temporaryConnectionFailure(error) {
  return error?.status === 429 || error?.status >= 500 ||
    ['TimeoutError', 'AbortError'].includes(error?.name) ||
    error?.name === 'TypeError' && error?.message === 'fetch failed';
}

export async function reconnect(operation, {pause, report, stopped = () => false}) {
  let attempt = 0;
  while (!stopped()) {
    try { return await operation(); }
    catch (error) {
      if (!temporaryConnectionFailure(error)) throw error;
      const wait = Math.min(30000, 5000 * 2 ** Math.min(attempt++, 3));
      report(`Temporary control connection failure; retrying in ${wait / 1000}s.`);
      await pause(wait);
    }
  }
  return null;
}
