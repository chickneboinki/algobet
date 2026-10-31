/** LeanLab notify — plain concat p0+p1.txt */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const cache = join('/tmp', 'll_notify.mjs');
function loadCode() {
  if (existsSync(cache)) { try { return readFileSync(cache, 'utf8'); } catch {} }
  const code = readFileSync(join(dir, 'p0.txt'), 'utf8') + readFileSync(join(dir, 'p1.txt'), 'utf8');
  try { writeFileSync(cache, code); } catch {}
  return code;
}
const code = loadCode();
try { writeFileSync(cache, code); } catch {}
const mod = await import(pathToFileURL(cache).href + '?v=13');
export default mod.default;
export const config = mod.config || { api: { bodyParser: false } };
