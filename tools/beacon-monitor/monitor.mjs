import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
/** Independent of model worker and device GPS. Use an always-on host for production. */
export async function monitorOnce(base, token, fetcher = fetch) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('MONITOR_CONFIG_INVALID');
  if (!token || token.length < 32) throw new Error('MONITOR_CONFIG_INVALID');
  const response = await fetcher(new URL('/api/trips/monitor', url), { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('MONITOR_UNAVAILABLE');
  return true;
}
async function main() {
  try { process.loadEnvFile(process.env.BEACON_MONITOR_ENV || join(homedir(), '.config/beacon-demo/monitor.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let stop = false, wake;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop = true; wake?.(); });
  while (!stop) {
    try { await monitorOnce(process.env.BEACON_BACKEND_URL, process.env.BEACON_MONITOR_TOKEN); console.log(JSON.stringify({ status: 'monitor_checked', at: new Date().toISOString() })); }
    catch { console.error(JSON.stringify({ status: 'monitor_unavailable', at: new Date().toISOString() })); }
    if (process.argv.includes('--once')) break;
    if (!stop) await new Promise(resolve => { const timer = setTimeout(resolve, 10000); wake = () => { clearTimeout(timer); resolve(); }; });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('MONITOR_CONFIG_INVALID'); process.exitCode = 1; });
