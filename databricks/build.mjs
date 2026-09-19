import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const require = createRequire(import.meta.url);
function typescriptFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? typescriptFiles(join(path, entry.name)) : entry.name.endsWith('.ts') ? [join(path, entry.name)] : []);
}
export function compileTrack() {
  const output = mkdtempSync(join(tmpdir(), 'beacon-track-'));
  const files = ['src/lib/decision-client', 'src/integrations/databricks'].flatMap(path => typescriptFiles(join(root, path)));
  const result = spawnSync(join(root, 'node_modules/.bin/tsc'), [
    '--module', 'commonjs', '--target', 'ES2022', '--types', 'node', '--strict',
    '--esModuleInterop', '--skipLibCheck', '--rootDir', join(root, 'src'), '--outDir', output, ...files,
  ], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Databricks track TypeScript compilation failed.');
  return { output, load: path => require(join(output, path)), tests: files.filter(f => f.endsWith('.test.ts')).map(f => join(output, f.slice(join(root, 'src').length + 1).replace(/\.ts$/, '.js'))) };
}
