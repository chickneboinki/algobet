/** Discord bot helpers — underscore so Vercel does not count as a function. */
export const GUILD = () => process.env.DISCORD_GUILD_ID || '';
export const BASE = () => process.env.APP_URL || 'https://helpbet.vercel.app';
export const LEAGUE_KEYS = ['NFL', 'NBA', 'NCAAF', 'NCAAB', 'MLB', 'NHL'];
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function botApi(method, path, body) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try { wait = Math.min(8, Number(JSON.parse(text).retry_after) || 1.5); } catch {}
      await sleep(wait * 1000 + 80);
      continue;
    }
    if (r.status >= 500 && i < 3) {
      await sleep(400 * (i + 1));
      continue;
    }
    throw new Error(`Discord ${r.status}: ${text.slice(0, 160)}`);
  }
  throw new Error('Discord rate limited');
}

export function sbHeaders(prefer) {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: prefer || 'return=representation',
  };
}
export function sbUrl() {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
}
export async function sb(path, opts = {}) {
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: sbHeaders(opts.prefer),
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) return null;
  if (opts.prefer && opts.prefer.includes('minimal')) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
export async function loadCfg(guildId) {
  if (!guildId) return {};
  try {
    const rows = await sb(`discord_config?guild_id=eq.${guildId}&select=config&limit=1`);
    return (rows && rows[0] && rows[0].config) || {};
  } catch {
    return {};
  }
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
  } catch {
    return false;
  }
}
export function text(content) {
  return { type: 4, data: { flags: 64, content } };
}
export async function followUp(it, payload) {
  return botApi(
    'POST',
    `/webhooks/${it.application_id}/${it.token}`,
    typeof payload === 'string' ? { content: payload } : payload
  );
}
export async function editOriginal(it, payload) {
  return botApi(
    'PATCH',
    `/webhooks/${it.application_id}/${it.token}/messages/@original`,
    typeof payload === 'string' ? { content: payload } : payload
  );
}

/**
 * Fast channel wipe — bulk-delete first (up to 100 msgs / request).
 * Only falls back to single-delete for leftovers Discord won't bulk.
 * Returns { deleted, errors, remaining }.
 */
export async function wipeChannel(channelId) {
  let deleted = 0;
  const errors = [];
  const MAX_AGE = 13.5 * 24 * 3600 * 1000;

  try {
    await botApi('GET', `/channels/${channelId}`);
  } catch (e) {
    return {
      deleted: 0,
      errors: [`Cannot access channel: ${String(e.message || e).slice(0, 100)}`],
      remaining: -1,
    };
  }

  // Fast path: keep bulk-deleting until nothing young left (max ~10 batches = 1000 msgs)
  for (let pass = 0; pass < 10; pass++) {
    let msgs;
    try {
      msgs = await botApi('GET', `/channels/${channelId}/messages?limit=100`);
    } catch (e) {
      errors.push(`fetch: ${String(e.message || e).slice(0, 80)}`);
      break;
    }
    if (!Array.isArray(msgs) || !msgs.length) break;

    const youngIds = msgs
      .filter((m) => {
        if (m.pinned) return false;
        const age = Date.now() - new Date(m.timestamp).getTime();
        return age < MAX_AGE;
      })
      .map((m) => m.id);

    if (youngIds.length >= 2) {
      try {
        await botApi('POST', `/channels/${channelId}/messages/bulk-delete`, {
          messages: youngIds.slice(0, 100),
        });
        deleted += Math.min(youngIds.length, 100);
        await sleep(280);
        continue;
      } catch (e) {
        const msg = String(e.message || e);
        errors.push(`bulk: ${msg.slice(0, 80)}`);
        if (msg.includes('50013') || msg.includes('50001') || msg.includes('Missing')) {
          errors.push('Bot needs **Manage Messages** in this channel.');
          return { deleted, errors: errors.slice(0, 4), remaining: msgs.length };
        }
        // fall through to single-delete for this batch
      }
    }

    // Single-delete only what's left (old msgs or bulk failed). Cap to keep it fast.
    const toKill = msgs.filter((m) => !m.pinned).slice(0, 25);
    if (!toKill.length) break;
    let got = 0;
    for (const m of toKill) {
      try {
        await botApi('DELETE', `/channels/${channelId}/messages/${m.id}`);
        deleted += 1;
        got += 1;
        await sleep(200);
      } catch (e) {
        const msg = String(e.message || e);
        if (!msg.includes('10008')) errors.push(`del: ${msg.slice(0, 60)}`);
        if (msg.includes('50013') || msg.includes('50001') || msg.includes('Missing')) {
          errors.push('Bot needs **Manage Messages** in this channel.');
          return { deleted, errors: errors.slice(0, 4), remaining: -1 };
        }
      }
    }
    if (got === 0) break;
    await sleep(200);
  }

  let remaining = 0;
  try {
    const left = await botApi('GET', `/channels/${channelId}/messages?limit=3`);
    remaining = Array.isArray(left) ? left.length : 0;
  } catch {}

  return { deleted, errors: errors.slice(0, 3), remaining };
}

export async function clearChannelMessages(channelId) {
  const r = await wipeChannel(channelId);
  if (r.errors.length && r.deleted === 0) {
    throw new Error(r.errors[0] || 'Wipe failed');
  }
  return r.deleted;
}
