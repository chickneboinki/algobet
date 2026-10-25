/**
 * Poll live vs upcoming on different intervals, cache to disk, retry/backoff.
 *
 * Usage:
 *   node runner.js --once
 *   node runner.js --poll
 */
const fs = require('fs/promises');
const path = require('path');
const { fetchPrizePicks } = require('./prizepicks');
const { fetchDraftKings } = require('./draftkings');
const { fetchFanDuel } = require('./fanduel');

const CACHE = path.join(__dirname, 'cache');
const LIVE_MS = Number(process.env.LIVE_POLL_MS || 60_000);
const UPCOMING_MS = Number(process.env.UPCOMING_POLL_MS || 5 * 60_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, { tries = 3, baseMs = 700 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const wait = baseMs * Math.pow(2, i);
      console.warn(`retry ${i + 1}/${tries} in ${wait}ms: ${e.message}`);
      await sleep(wait);
    }
  }
  throw last;
}

async function writeCache(name, data) {
  await fs.mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, `${name}.json`);
  const payload = {
    fetchedAt: new Date().toISOString(),
    count: Array.isArray(data) ? data.length : 0,
    data,
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2));
  return file;
}

async function runAll() {
  const out = {};
  const jobs = [
    ['prizepicks', () => fetchPrizePicks({ singleStat: true })],
    ['prizepicks_nba', () => fetchPrizePicks({ singleStat: true, league: 'NBA' })],
    ['draftkings_nba', () => fetchDraftKings('nba')],
    ['draftkings_nfl', () => fetchDraftKings('nfl')],
    ['fanduel', () => fetchFanDuel({ pageId: 'nba' })],
  ];
  for (const [name, fn] of jobs) {
    try {
      const data = await withRetry(fn);
      out[name] = { ok: true, count: data.length };
      const file = await writeCache(name, data);
      console.log(`OK  ${name}: ${data.length} → ${file}`);
    } catch (e) {
      out[name] = { ok: false, error: e.message };
      console.error(`FAIL ${name}: ${e.message}`);
      await writeCache(name, []);
    }
  }
  const merged = [];
  for (const name of Object.keys(out)) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(CACHE, `${name}.json`), 'utf8'));
      if (Array.isArray(raw.data)) merged.push(...raw.data);
    } catch {}
  }
  await writeCache('unified', merged);
  console.log(`unified: ${merged.length} rows`);
  return out;
}

async function pollLoop() {
  console.log(`polling live every ${LIVE_MS}ms, full every ${UPCOMING_MS}ms`);
  let lastFull = 0;
  for (;;) {
    const now = Date.now();
    if (now - lastFull >= UPCOMING_MS) {
      await runAll();
      lastFull = now;
    } else {
      try {
        const data = await withRetry(() => fetchPrizePicks({ singleStat: true }));
        await writeCache('prizepicks', data);
        console.log(`live prizepicks: ${data.length}`);
      } catch (e) {
        console.error('live fail', e.message);
      }
    }
    await sleep(LIVE_MS);
  }
}

const args = process.argv.slice(2);
if (args.includes('--poll')) {
  pollLoop();
} else {
  runAll().then(() => process.exit(0));
}

module.exports = { runAll, withRetry, writeCache };
