export function temporaryConnectionFailure(error) {
  return error?.status === 429 || error?.status >= 500 ||
    ['TimeoutError', 'AbortError'].includes(error?.name) ||
    error?.name === 'TypeError' && error?.message === 'fetch failed';
}

export const LEASE_MS = 90000;
// After a failed heartbeat during an active job, stop the processor only when the lease is really at risk:
// an explicit rejection, or renewals failing long enough that another worker could soon claim the job.
export function shouldStopProcessing(error, {lastRenewal, now = Date.now(), leaseMs = LEASE_MS}) {
  if ([401, 403, 409].includes(error?.status)) return 'The control service rejected the lease or credentials';
  if (now - lastRenewal >= leaseMs - 30000) return 'Lease renewal has failed for too long';
  return null;
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
