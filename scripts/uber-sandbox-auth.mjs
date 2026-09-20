import { open, lstat, stat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, dirname, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const messages = {
  OPT_IN_REQUIRED: 'No network request made. Explicit --request-token opt-in is required.',
  INVALID_ARGUMENTS: 'Use --request-token --output /absolute/private/token.json. Credentials belong in the private environment, not command arguments.',
  MISSING_CREDENTIALS: 'Both UBER_CLIENT_ID and UBER_CLIENT_SECRET are required in the private environment. A client secret alone is insufficient.',
  INVALID_SCOPE: 'The Uber application needs guests.trips scope enabled. Ask Uber or the application owner to enable Guest Rides access; a client secret does not grant this scope.',
  INVALID_CLIENT: 'Uber rejected the application credentials. Verify the client ID and secret securely with the application owner.',
  AUTH_REJECTED: 'Uber rejected token setup. Verify application access with the owner; no upstream details were printed.',
  INVALID_TOKEN_RESPONSE: 'Uber returned an unusable token response; nothing was saved.',
  TIMEOUT: 'Token setup timed out. No retry was made; token issuance may have occurred upstream.',
  NETWORK_ERROR: 'Token setup could not complete. No retry was made; no upstream details were printed.',
  REDIRECT_REJECTED: 'Uber token endpoint returned a redirect; it was not followed.',
  INVALID_TIMEOUT: 'Timeout must be between 1 and 30000 milliseconds.',
  OUTPUT_EXISTS: 'Output already exists or is a symbolic link. Choose a new private filename; existing files are never overwritten.',
  OUTPUT_DIRECTORY_NOT_PRIVATE: 'Output directory must already exist, be owned by this user, and have 0700 permissions.',
  OUTPUT_TRACKED: 'Output path is tracked by Git. Choose a private path outside Git or an untracked ignored path.',
  OUTPUT_NOT_IGNORED: 'Output path is inside Git and is not ignored. Choose a private path outside Git or an untracked ignored path.',
  GIT_CHECK_FAILED: 'Unable to verify Git protection for output. No token request was made.',
  OUTPUT_WRITE_FAILED: 'Unable to save token privately. No token or upstream details were printed. Check the output path before another request.',
};
export class UberAuthSetupError extends Error {
  constructor(code) { super(messages[code] ?? 'Uber token setup failed. No private details were printed.'); this.name = 'UberAuthSetupError'; this.code = code; }
}
const fail = code => { throw new UberAuthSetupError(code); };

async function privateOutput(output) {
  if (typeof output !== 'string' || !isAbsolute(output)) fail('INVALID_ARGUMENTS');
  let parent;
  try {
    parent = await realpath(dirname(output));
    const info = await stat(parent);
    if (!info.isDirectory() || info.mode & 0o077 || typeof process.getuid !== 'function' || info.uid !== process.getuid()) fail('OUTPUT_DIRECTORY_NOT_PRIVATE');
  } catch (error) { if (error instanceof UberAuthSetupError) throw error; fail('OUTPUT_DIRECTORY_NOT_PRIVATE'); }
  const target = join(parent, basename(output));
  try { await lstat(target); fail('OUTPUT_EXISTS'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Deliberately exclude inherited GIT_DIR/WORK_TREE and user Git configuration.
  const git = args => exec('git', ['-C', parent, ...args], { timeout: 3000, maxBuffer: 16_384, env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });
  try { await git(['rev-parse', '--show-toplevel']); }
  catch (error) {
    if (error.code === 128 && String(error.stderr).includes('not a git repository')) return target;
    fail('GIT_CHECK_FAILED');
  }
  try {
    const tracked = await git(['ls-files', '--error-unmatch', '--', target]).then(() => true, error => { if (error.code === 1) return false; throw error; });
    if (tracked) fail('OUTPUT_TRACKED');
    const ignored = await git(['check-ignore', '--quiet', '--', target]).then(() => true, error => { if (error.code === 1) return false; throw error; });
    if (!ignored) fail('OUTPUT_NOT_IGNORED');
  } catch (error) { if (error instanceof UberAuthSetupError) throw error; fail('GIT_CHECK_FAILED'); }
  return target;
}

async function requestToken({ env, fetchImpl, timeoutMs, now }) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new UberAuthSetupError('TIMEOUT')); }, timeoutMs); });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetchImpl('https://auth.uber.com/oauth/v2/token', {
        method: 'POST', redirect: 'error', signal: controller.signal, cache: 'no-store',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'guests.trips', client_id: env.UBER_CLIENT_ID, client_secret: env.UBER_CLIENT_SECRET }).toString(),
      });
      if (response.status >= 300 && response.status < 400) fail('REDIRECT_REJECTED');
      const reader = response.body?.getReader();
      if (!reader) fail('INVALID_TOKEN_RESPONSE');
      const decoder = new TextDecoder(); let body = ''; let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 65_536) fail('INVALID_TOKEN_RESPONSE');
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } finally { void reader.cancel().catch(() => undefined); }
      let data;
      try { data = JSON.parse(body); } catch { fail('INVALID_TOKEN_RESPONSE'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) fail('INVALID_TOKEN_RESPONSE');
      if (!response.ok) {
        if (data.error === 'invalid_scope') fail('INVALID_SCOPE');
        if (data.error === 'invalid_client') fail('INVALID_CLIENT');
        fail('AUTH_REJECTED');
      }
      if (typeof data.access_token !== 'string' || !/^[A-Za-z0-9._~+\/-]{1,8192}={0,2}$/.test(data.access_token) || data.token_type !== 'Bearer' || typeof data.scope !== 'string' || data.scope.trim() !== 'guests.trips' || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0 || data.expires_in > 31_536_000) fail('INVALID_TOKEN_RESPONSE');
      return { access_token: data.access_token, token_type: 'Bearer', scope: 'guests.trips', expires_at: new Date(now() + data.expires_in * 1000).toISOString() };
    })()]);
  } catch (error) { if (error instanceof UberAuthSetupError) throw error; fail('NETWORK_ERROR'); }
  finally { clearTimeout(timer); controller.abort(); }
}

/** Local operator entry point. No secrets in its return value or error messages. */
export async function setupToken({ argv = [], env = process.env, fetchImpl = fetch, timeoutMs = 8000, now = Date.now } = {}) {
  if (argv.some(arg => arg.startsWith('--') && !['--request-token', '--output'].includes(arg))) fail('INVALID_ARGUMENTS');
  if (!argv.includes('--request-token')) fail('OPT_IN_REQUIRED');
  if (argv.length !== 3 || argv[0] !== '--request-token' || argv[1] !== '--output') fail('INVALID_ARGUMENTS');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('INVALID_TIMEOUT');
  if (![env.UBER_CLIENT_ID, env.UBER_CLIENT_SECRET].every(value => typeof value === 'string' && /^[\x21-\x7e]{1,8192}$/.test(value))) fail('MISSING_CREDENTIALS');
  const output = await privateOutput(argv[2]);
  const result = await requestToken({ env, fetchImpl, timeoutMs, now });
  let handle;
  try {
    handle = await open(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.chmod(0o600);
    await handle.writeFile(`${JSON.stringify(result)}\n`, 'utf8');
    await handle.sync();
  } catch { fail('OUTPUT_WRITE_FAILED'); }
  finally { await handle?.close(); }
  return { saved: true, scope: 'guests.trips', expiresAt: result.expires_at };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 2 || process.argv.slice(2).includes('--help')) {
    console.log('Usage: node scripts/uber-sandbox-auth.mjs --request-token --output /absolute/private/token.json\nRequires private environment UBER_CLIENT_ID and UBER_CLIENT_SECRET. Without --request-token no network call occurs.');
  } else {
    try { await setupToken({ argv: process.argv.slice(2) }); console.log('Validated Guest Rides token saved to the requested private file. Token value is not printed.'); }
    catch (error) { console.error(error instanceof UberAuthSetupError ? error.message : 'Token setup failed. No private details were printed.'); process.exitCode = 1; }
  }
}
