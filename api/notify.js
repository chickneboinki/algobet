/** HelpBet notify — load concatenated plain JS parts np0..np2 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const cache = join('/tmp', 'hb_notify_plain.mjs');
function loadCode() {
  if (existsSync(cache)) { try { return readFileSync(cache, 'utf8'); } catch {} }
  let code = '';
  for (let i = 0; i < 8; i++) {
    const p = join(dir, `np${i}.js`);
    if (!existsSync(p)) break;
    code += readFileSync(p, 'utf8');
  }
  if (!code) throw new Error('HelpBet notify np*.js parts missing');
  try { writeFileSync(cache, code); } catch {}
  return code;
}
const code = loadCode();
try { writeFileSync(cache, code); } catch {}
const mod = await import(pathToFileURL(cache).href + '?v=9');
export default mod.default;
export const config = mod.config || { api: { bodyParser: false } };
