/** Discord bot helpers — underscore so Vercel does not count as a function. */
export const GUILD = () => process.env.DISCORD_GUILD_ID || '';
export const BASE = () => process.env.APP_URL || 'https://helpbet.vercel.app';
export const LEAGUE_KEYS = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function botApi(method, path, body) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch('https://discord.com/api/v10' + path, {
      method,
      headers: {
        Authorization: 'Bot ' + process.env.DISCORD_BOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try { wait = Math.min(8, Number(JSON.parse(text).retry_after) || 1.5); } catch (e) {}
      await sleep(wait * 1000 + 80);
      continue;
    }
    if (r.status >= 500 && i < 3) { await sleep(400 * (i + 1)); continue; }
    throw new Error('Discord ' + r.status + ': ' + text.slice(0, 160));
  }
  throw new Error('Discord rate limited');
}

export function sbHeaders(prefer) {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Prefer: prefer || 'return=representation',
  };
}
export function sbUrl() { return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; }
export async function sb(path, opts) {
  opts = opts || {};
  const r = await fetch(sbUrl() + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: sbHeaders(opts.prefer),
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) return null;
  if (opts.prefer && opts.prefer.indexOf('minimal') >= 0) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
export async function loadCfg(guildId) {
  if (!guildId) return {};
  try {
    const rows = await sb('discord_config?guild_id=eq.' + guildId + '&select=config&limit=1');
    return (rows && rows[0] && rows[0].config) || {};
  } catch (e) { return {}; }
}
export async function saveCfg(guildId, cfg) {
  await sb('discord_config', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: { guild_id: guildId, config: cfg, updated_at: new Date().toISOString() },
  });
}
export function isAdmin(it) {
  try {
    const p = BigInt((it.member && it.member.permissions) || 0);
    return (p & 0x20n) !== 0n || (p & 0x8n) !== 0n;
  } catch (e) { return false; }
}
export function text(content) {
  return { type: 4, data: { flags: 64, content: content } };
}
export async function followUp(it, payload) {
  return botApi('POST', '/webhooks/' + it.application_id + '/' + it.token,
    typeof payload === 'string' ? { content: payload } : payload);
}
export async function editOriginal(it, payload) {
  return botApi('PATCH', '/webhooks/' + it.application_id + '/' + it.token + '/messages/@original',
    typeof payload === 'string' ? { content: payload } : payload);
}

/** Fast bulk-first wipe. Returns { deleted, errors, remaining }. */
export async function wipeChannel(channelId) {
  let deleted = 0;
  const errors = [];
  const MAX_AGE = 13.5 * 24 * 3600 * 1000;

  try {
    await botApi('GET', '/channels/' + channelId);
  } catch (e) {
    return { deleted: 0, errors: ['Cannot access channel: ' + String(e.message || e).slice(0, 100)], remaining: -1 };
  }

  for (let pass = 0; pass < 8; pass++) {
    let msgs;
    try {
      msgs = await botApi('GET', '/channels/' + channelId + '/messages?limit=100');
    } catch (e) {
      errors.push('fetch: ' + String(e.message || e).slice(0, 80));
      break;
    }
    if (!Array.isArray(msgs) || !msgs.length) break;

    const youngIds = msgs.filter(function(m) {
      if (m.pinned) return false;
      return (Date.now() - new Date(m.timestamp).getTime()) < MAX_AGE;
    }).map(function(m) { return m.id; });

    if (youngIds.length >= 2) {
      try {
        await botApi('POST', '/channels/' + channelId + '/messages/bulk-delete', {
          messages: youngIds.slice(0, 100),
        });
        deleted += Math.min(youngIds.length, 100);
        await sleep(250);
        continue;
      } catch (e) {
        const msg = String(e.message || e);
        errors.push('bulk: ' + msg.slice(0, 80));
        if (msg.indexOf('50013') >= 0 || msg.indexOf('50001') >= 0 || msg.indexOf('Missing') >= 0) {
          errors.push('Bot needs **Manage Messages** in this channel.');
          return { deleted: deleted, errors: errors.slice(0, 4), remaining: msgs.length };
        }
      }
    }

    // Cap single-deletes so we never hang for minutes
    const toKill = msgs.filter(function(m) { return !m.pinned; }).slice(0, 15);
    if (!toKill.length) break;
    let got = 0;
    for (let i = 0; i < toKill.length; i++) {
      try {
        await botApi('DELETE', '/channels/' + channelId + '/messages/' + toKill[i].id);
        deleted += 1;
        got += 1;
        await sleep(180);
      } catch (e) {
        const msg = String(e.message || e);
        if (msg.indexOf('10008') < 0) errors.push('del: ' + msg.slice(0, 60));
        if (msg.indexOf('50013') >= 0 || msg.indexOf('50001') >= 0 || msg.indexOf('Missing') >= 0) {
          errors.push('Bot needs **Manage Messages** in this channel.');
          return { deleted: deleted, errors: errors.slice(0, 4), remaining: -1 };
        }
      }
    }
    if (got === 0) break;
    await sleep(150);
  }

  let remaining = 0;
  try {
    const left = await botApi('GET', '/channels/' + channelId + '/messages?limit=3');
    remaining = Array.isArray(left) ? left.length : 0;
  } catch (e) {}

  return { deleted: deleted, errors: errors.slice(0, 3), remaining: remaining };
}
