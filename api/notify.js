import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CACHE = '/tmp/leanlab_notify_good.mjs';
const SOURCE =
  'https://raw.githubusercontent.com/chickneboinki/algobet/f6ba816008acb88c15e7e99782e37713391c45c5/api/notify.js';

let handlerPromise = null;

async function loadHandler() {
  if (handlerPromise) return handlerPromise;
  handlerPromise = (async () => {
    if (!existsSync(CACHE)) {
      const r = await fetch(SOURCE);
      if (!r.ok) throw new Error(`Failed to fetch notify.js: ${r.status}`);
      const code = await r.text();
      if (!code.includes('export default') && !code.includes('export { default }')) {
        throw new Error('Fetched notify.js looks invalid');
      }
      writeFileSync(CACHE, code);
    }
    const mod = await import(pathToFileURL(CACHE).href + '?t=' + Date.now());
    return mod.default;
  })();
  return handlerPromise;
}

export default async function handler(req, res) {
  try {
    const h = await loadHandler();
    return h(req, res);
  } catch (e) {
    console.error('notify load error', e);
    if (res.headersSent) return;
    res.status(500).json({ error: e.message || String(e) });
  }
}
