/**
 * Poll feeds, normalize, cache to disk.
 * Retry with exponential backoff on HTTP errors.
 */
const fs = require('fs/promises');
const path = require('path');
const { fetchPrizePicks } = require('./prizepicks');
const { fetchDraftKings } = require('./draftkings');
const { fetchFanDuel } = require('./fanduel');

const CACHE = path.join(__dirname, 'cache');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, { tries = 3, baseMs = 800 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(baseMs * Math.pow(2, i));
    }
  }
  throw last;
}

async function writeCache(name, data) {
  await fs.mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, `${name}.json`);
  await fs.writeFile(
    file,
    JSON.stringify({ fetchedAt: new Date().toISOString(), count: data.length, data }, null, 2)
  );
  return file;
}

async function runAll() {
  const out = {};
  const jobs = [
    ['prizepicks', () => fetchPrizePicks({ singleStat: true })],
    ['draftkings', () => fetchDraftKings('nba')],
    ['fanduel', () => fetchFanDuel()],
  ];
  for (const [name, fn] of jobs) {
    try {
      const data = await withRetry(fn);
      out[name] = data;
      const file = await writeCache(name, data);
      console.log(`${name}: ${data.length} rows → ${file}`);
    } catch (e) {
      console.error(`${name} failed:`, e.message);
      out[name] = { error: e.message };
    }
  }
  return out;
}

if (require.main === module) {
  runAll().then(() => process.exit(0));
}

module.exports = { runAll, withRetry, writeCache };
