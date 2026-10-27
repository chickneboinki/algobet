/** Discord bot helpers — underscore so Vercel does not count as a function. */
export const GUILD = () => process.env.DISCORD_GUILD_ID || '';
export const BASE = () => process.env.APP_URL || 'https://helpbet.vercel.app';
export const LEAGUE_KEYS = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
export async function botApi(method, path, body) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try { wait = Math.min(8, Number(JSON.parse(text).retry_after) || 1.5); } catch {}
      await sleep(wait * 1000 + 100);
      continue;
    }
    if (r.status >= 500 && i < 3) { await sleep(600 * (i + 1)); continue; }
    throw new Error(`Discord ${r.status}: ${text.slice(0, 160)}`);
  }
  throw new Error('Discord rate limited');
}
export function sbHeaders(prefer) {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' };
}
export function sbUrl() { return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; }
export async function sb(path, opts = {}) {
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    method: opts.method || 'GET', headers: sbHeaders(opts.prefer),
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) return null;
  if (opts.prefer?.includes('minimal')) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
export async function loadCfg(guildId) {
  if (!guildId) return {};
  try {
    const rows = await sb(`discord_config?guild_id=eq.${guildId}&select=config&limit=1`);
    return rows?.[0]?.config || {};
  } catch { return {}; }
}
export async function saveCfg(guildId, cfg) {
  await sb('discord_config', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { guild_id: guildId, config: cfg, updated_at: new Date().toISOString() },
  });
}
export function isAdmin(it) {
  try {
    const p = BigInt(it.member?.permissions || 0);
    return (p & 0x20n) !== 0n || (p & 0x8n) !== 0n;
  } catch { return false; }
}
export function text(content) { return { type: 4, data: { flags: 64, content } }; }
export async function followUp(it, payload) {
  return botApi('POST', `/webhooks/${it.application_id}/${it.token}`, typeof payload === 'string' ? { content: payload } : payload);
}
export async function editOriginal(it, payload) {
  return botApi('PATCH', `/webhooks/${it.application_id}/${it.token}/messages/@original`, typeof payload === 'string' ? { content: payload } : payload);
}
export async function wipeChannel(channelId) {
  let deleted = 0;
  for (let pass = 0; pass < 3; pass++) {
    let msgs;
    try { msgs = await botApi('GET', `/channels/${channelId}/messages?limit=100`); } catch { break; }
    if (!Array.isArray(msgs) || !msgs.length) break;
    const bulk = msgs.filter((m) => {
      const age = Date.now() - new Date(m.timestamp).getTime();
      return age < 13.5 * 24 * 3600 * 1000 && !m.pinned;
    }).map((m) => m.id);
    if (bulk.length >= 2) {
      try {
        await botApi('POST', `/channels/${channelId}/messages/bulk-delete`, { messages: bulk.slice(0, 100) });
        deleted += bulk.length;
        await sleep(400);
        continue;
      } catch {}
    }
    for (const m of msgs) {
      try { await botApi('DELETE', `/channels/${channelId}/messages/${m.id}`); deleted += 1; await sleep(280); } catch {}
    }
  }
  return deleted;
}
