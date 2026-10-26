import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let _mod;
async function load() {
  if (_mod) return _mod;
  const dir = dirname(fileURLToPath(import.meta.url));
  let b64;
  try {
    b64 = readFileSync(join(dir, 'notify-body.b64'), 'utf8').trim();
  } catch {
    b64 = readFileSync(join(process.cwd(), 'api', 'notify-body.b64'), 'utf8').trim();
  }
  const code = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
  _mod = await import(dataUrl);
  return _mod;
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const mod = await load();
  return mod.default(req, res);
}
