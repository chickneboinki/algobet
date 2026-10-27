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
      await sleep(wait * 1000 + 100);
      continue;
    }
    if (r.status >= 500 && i < 3) {
      await sleep(600 * (i + 1));
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
 * Delete as many messages as possible in a channel.
 * Returns { deleted, errors, remaining }.
 * Bot needs Manage Messages (+ View Channel) in that channel.
 */
export async function wipeChannel(channelId) {
  let deleted = 0;
  const errors = [];
  let remaining = 0;

  // Verify bot can read the channel first
  try {
    await botApi('GET', `/channels/${channelId}`);
  } catch (e) {
    return {
      deleted: 0,
      errors: [`Cannot access channel: ${String(e.message || e).slice(0, 100)}`],
      remaining: -1,
    };
  }

  for (let pass = 0; pass < 6; pass++) {
    let msgs;
    try {
      msgs = await botApi('GET', `/channels/${channelId}/messages?limit=100`);
    } catch (e) {
      errors.push(`fetch: ${String(e.message || e).slice(0, 80)}`);
      break;
    }
    if (!Array.isArray(msgs) || !msgs.length) {
      remaining = 0;
      break;
    }
    remaining = msgs.length;

    // Bulk-delete only works for messages < 14 days old (Discord rule)
    const young = msgs.filter((m) => {
      const age = Date.now() - new Date(m.timestamp).getTime();
      return age < 13.5 * 24 * 3600 * 1000 && !m.pinned;
    });
    const youngIds = young.map((m) => m.id);

    if (youngIds.length >= 2) {
      try {
        await botApi('POST', `/channels/${channelId}/messages/bulk-delete`, {
          messages: youngIds.slice(0, 100),
        });
        deleted += youngIds.length;
        await sleep(500);
        continue;
      } catch (e) {
        errors.push(`bulk: ${String(e.message || e).slice(0, 80)}`);
        // fall through to single deletes
      }
    }

    // Single-delete everything we can (works for older messages too)
    let passDeleted = 0;
    for (const m of msgs) {
      if (m.pinned) continue;
      try {
        await botApi('DELETE', `/channels/${channelId}/messages/${m.id}`);
        deleted += 1;
        passDeleted += 1;
        await sleep(320);
      } catch (e) {
        const msg = String(e.message || e);
        // 10008 = unknown message (already gone); skip
        if (!msg.includes('10008')) {
          errors.push(`del ${m.id}: ${msg.slice(0, 60)}`);
        }
        // Permission errors will keep failing — stop early
        if (msg.includes('50013') || msg.includes('50001') || msg.includes('Missing')) {
          errors.push('Bot needs **Manage Messages** permission in this channel.');
          return { deleted, errors: errors.slice(0, 5), remaining };
        }
      }
    }
    if (passDeleted === 0) break;
    await sleep(400);
  }

  // Final count of what's left
  try {
    const left = await botApi('GET', `/channels/${channelId}/messages?limit=5`);
    remaining = Array.isArray(left) ? left.length : remaining;
  } catch {}

  return { deleted, errors: errors.slice(0, 5), remaining };
}

/** Simple wrapper used by /resetchannel — returns deleted count or throws. */
export async function clearChannelMessages(channelId) {
  const r = await wipeChannel(channelId);
  if (r.errors.length && r.deleted === 0) {
    throw new Error(r.errors[0] || 'Wipe failed');
  }
  return r.deleted;
}
