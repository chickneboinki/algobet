import { writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = '/tmp/leanlab_notify_good.mjs';
const SOURCE =
  'https://raw.githubusercontent.com/chickneboinki/algobet/f6ba816008acb88c15e7e99782e37713391c45c5/api/notify.js';
const API_DIR = dirname(fileURLToPath(import.meta.url));
const API_URL = pathToFileURL(API_DIR.endsWith('/') ? API_DIR : API_DIR + '/').href;

let handlerPromise = null;

function rewriteImports(code) {
  // Point relative imports at the real api/ directory on disk (Vercel /var/task/api)
  return code
    .replace(/from\s+['\"]\.\//g, `from '${API_URL}`)
    .replace(/from\s+['\"]\.\.\//g, `from '${API_URL}`);
}

async function loadHandler() {
  if (handlerPromise) return handlerPromise;
  handlerPromise = (async () => {
    if (!existsSync(CACHE)) {
      const r = await fetch(SOURCE);
      if (!r.ok) throw new Error(`Failed to fetch notify.js: ${r.status}`);
      let code = await r.text();
      if (!code.includes('export default') && !code.includes('handler')) {
        throw new Error('Fetched notify.js looks invalid');
      }
      code = rewriteImports(code);
      writeFileSync(CACHE, code);
    }
    const mod = await import(pathToFileURL(CACHE).href + '?v=2');
    return mod.default;
  })();
  return handlerPromise;
}

export default async function handler(req, res) {
  try {
    const h = await loadHandler();
    return await h(req, res);
  } catch (e) {
    console.error('notify load error', e);
    if (res.headersSent) return;
    return res.status(500).json({ error: e.message || String(e) });
  }
}
