export async function api(path, options) {
  const response = await fetch(path, options);
  const type = response.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new Error('The service returned an unexpected response. Check the API connection or sign in again.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The service returned an unreadable response. Please try again.'); }
  if (!response.ok) throw new Error(data?.error || 'Could not reach the service.');
  return data;
}
