import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setupToken, UberAuthSetupError } from './uber-sandbox-auth.mjs';

const exec = promisify(execFile);
const credentials = { UBER_CLIENT_ID: 'fixture-client', UBER_CLIENT_SECRET: 'fixture-secret' };
const token = { access_token: 'fixture-token-abc', token_type: 'Bearer', scope: 'guests.trips', expires_in: 2592000 };
const code = expected => error => error instanceof UberAuthSetupError && error.code === expected;
async function directory(t) { const path = await mkdtemp(join(tmpdir(), 'beacon-uber-auth-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
const options = output => ({ argv: ['--request-token', '--output', output], env: credentials, fetchImpl: async () => Response.json(token), now: () => 1800000000000 });

test('token setup requires explicit network opt-in, client ID and secret before HTTP', async t => {
  const output = join(await directory(t), 'token.json'); let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json(token); };
  await assert.rejects(setupToken({ ...options(output), argv: ['--output', output], fetchImpl }), code('OPT_IN_REQUIRED'));
  await assert.rejects(setupToken({ ...options(output), env: { UBER_CLIENT_SECRET: 'fixture-secret' }, fetchImpl }), code('MISSING_CREDENTIALS'));
  assert.equal(calls, 0);
});

test('token setup requests only guests.trips using fixed auth endpoint and writes a private output', async t => {
  const output = join(await directory(t), 'token.json');
  const result = await setupToken({ ...options(output), fetchImpl: async (url, init) => {
    assert.equal(url, 'https://auth.uber.com/oauth/v2/token');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('content-type'), 'application/x-www-form-urlencoded');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), { grant_type: 'client_credentials', scope: 'guests.trips', client_id: 'fixture-client', client_secret: 'fixture-secret' });
    return Response.json(token);
  } });
  assert.deepEqual(result, { saved: true, scope: 'guests.trips', expiresAt: '2027-02-14T08:00:00.000Z' });
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.access_token, 'fixture-token-abc'); assert.equal(saved.scope, 'guests.trips');
  assert.ok(!JSON.stringify(result).includes('fixture-token')); assert.ok(!JSON.stringify(saved).includes('fixture-secret'));
});

test('token setup rejects invalid scope with enablement guidance and no private upstream details', async t => {
  const output = join(await directory(t), 'token.json');
  await assert.rejects(setupToken({ ...options(output), fetchImpl: async () => Response.json({ error: 'invalid_scope', error_description: 'fixture-secret fixture-token' }, { status: 400 }) }), error => code('INVALID_SCOPE')(error) && /Uber.*enable/.test(error.message) && !/fixture-secret|fixture-token/.test(error.message));
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('token setup rejects missing scope, broad scope, invalid token type, token characters and expiry', async t => {
  const output = join(await directory(t), 'token.json');
  for (const invalid of [{ ...token, scope: undefined }, { ...token, scope: 'guests.trips request' }, { ...token, token_type: 'Basic' }, { ...token, access_token: 'bad\nsecret' }, { ...token, expires_in: 0 }]) {
    await assert.rejects(setupToken({ ...options(output), fetchImpl: async () => Response.json(invalid) }), code('INVALID_TOKEN_RESPONSE'));
  }
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('token setup sanitizes redirects, network failures and stalled response-body timeouts', async t => {
  const output = join(await directory(t), 'token.json');
  for (const [fetchImpl, expected] of [
    [async () => new Response(null, { status: 302 }), 'REDIRECT_REJECTED'],
    [async () => { throw Error('fixture-secret'); }, 'NETWORK_ERROR'],
    [async () => new Response(new ReadableStream({ start() {} })), 'TIMEOUT'],
  ]) await assert.rejects(setupToken({ ...options(output), fetchImpl, timeoutMs: 10 }), error => code(expected)(error) && !error.message.includes('fixture-secret'));
});

test('token setup refuses overwrite and symlinks before requesting a token', async t => {
  const dir = await directory(t); const output = join(dir, 'token.json'); const link = join(dir, 'link.json');
  await writeFile(output, 'existing', { mode: 0o600 }); await symlink(output, link);
  let calls = 0; const fetchImpl = async () => { calls++; return Response.json(token); };
  for (const path of [output, link]) await assert.rejects(setupToken({ ...options(path), fetchImpl }), code('OUTPUT_EXISTS'));
  assert.equal(calls, 0); assert.equal(await readFile(output, 'utf8'), 'existing');
});

test('token setup only allows untracked ignored output within a repository', async t => {
  const dir = await directory(t); await exec('git', ['init', '--quiet', dir]);
  await writeFile(join(dir, '.gitignore'), 'token.json\n');
  const output = join(dir, 'token.json');
  await assert.rejects(setupToken(options(join(dir, 'not-ignored.json'))), code('OUTPUT_NOT_IGNORED'));
  assert.equal((await setupToken(options(output))).saved, true);
  await exec('git', ['-C', dir, 'add', '--force', 'token.json']);
  await rm(output);
  await assert.rejects(setupToken(options(output)), code('OUTPUT_TRACKED'));
});

test('token setup refuses shared writable output directories and command-line credentials', async t => {
  const dir = await directory(t); const shared = join(dir, 'shared'); await mkdir(shared, { mode: 0o755 });
  await assert.rejects(setupToken(options(join(shared, 'token.json'))), code('OUTPUT_DIRECTORY_NOT_PRIVATE'));
  await assert.rejects(setupToken({ ...options(join(dir, 'token.json')), argv: ['--request-token', '--client-secret', 'fixture-secret'] }), code('INVALID_ARGUMENTS'));
});

test('token setup bounds response size and never overwrites an output created during the request', async t => {
  const dir = await directory(t); const output = join(dir, 'token.json');
  await assert.rejects(setupToken({ ...options(output), fetchImpl: async () => new Response('x'.repeat(65537)) }), code('INVALID_TOKEN_RESPONSE'));
  await assert.rejects(setupToken({ ...options(output), fetchImpl: async () => { await writeFile(output, 'existing', { mode: 0o600 }); return Response.json(token); } }), code('OUTPUT_WRITE_FAILED'));
  assert.equal(await readFile(output, 'utf8'), 'existing');
});

test('token setup CLI help and missing opt-in do not expose environment secrets', async () => {
  const script = new URL('./uber-sandbox-auth.mjs', import.meta.url).pathname;
  const { stdout, stderr } = await exec(process.execPath, [script, '--help'], { env: { ...process.env, ...credentials } });
  assert.match(stdout, /Usage:/); assert.equal(stderr, ''); assert.ok(!stdout.includes('fixture-secret'));
  await assert.rejects(exec(process.execPath, [script, '--output', '/unused/token.json'], { env: { ...process.env, ...credentials } }), error => error.code === 1 && /opt-in/.test(error.stderr) && !error.stderr.includes('fixture-secret'));
});
