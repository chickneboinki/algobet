import {
  enc, dec, parseGid, categorySelect, playerSelect, playerBetsPayload, bestPickPayload, topPlaysPayload,
} from './_props_ui.js';
import {
  GUILD, BASE, LEAGUE_KEYS, botApi, loadCfg, saveCfg, isAdmin, text, followUp, editOriginal, wipeChannel, sb,
} from './_bot_util.js';

async function resolveGame(gid) {
  const { sport, gameId } = parseGid(gid);
  try {
    const r = await fetch(`${BASE()}/api/games?sport=${encodeURIComponent(sport || 'ALL')}`);
    const d = await r.json().catch(() => ({}));
    const games = Array.isArray(d.games) ? d.games : [];
    const g = games.find((x) => String(x.id) === String(gameId)) || games.find((x) => String(x.id).includes(String(gameId)));
    if (g) return { sport: String(g.sport || sport).toUpperCase(), home: g.home_team, away: g.away_team, id: g.id };
  } catch {}
  return { sport, home: '', away: '', id: gameId };
}

async function loadProps(game) {
  const q = new URLSearchParams({ sport: game.sport || '', home: game.home || '', away: game.away || '' });
  const r = await fetch(`${BASE()}/api/props?${q}`);
  return r.json().catch(() => ({ props: [], top_plays: [] }));
}

async function readBody(req) {
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Reply after a type-5 defer: prefer edit @original, fall back to follow-up. */
async function finish(it, payload) {
  const body = typeof payload === 'string' ? { content: String(payload).slice(0, 1900) } : payload;
  try {
    await editOriginal(it, body);
    return;
  } catch (e1) {
    try {
      await followUp(it, body);
    } catch (e2) {
      console.error('finish failed', String(e1?.message || e1), String(e2?.message || e2));
    }
  }
}

function ack(res, content) {
  return res.status(200).json({
    type: 4,
    data: { content: String(content).slice(0, 1900), flags: 64 },
  });
}

function defer(res) {
  // type 5 = deferred channel message; flags 64 = ephemeral
  return res.status(200).json({ type: 5, data: { flags: 64 } });
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Signature-Ed25519, X-Signature-Timestamp');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const route = String(req.query?.route || '');
  let it = {};
  if (req.method === 'POST') {
    try { it = await readBody(req); } catch { it = {}; }
  }

  const isDiscord =
    route === 'interactions' ||
    String(req.url || '').includes('discord-interactions') ||
    (it && typeof it.type === 'number' && it.type >= 1 && it.type <= 5);

  // --- Discord interactions ---
  if (isDiscord && it && typeof it.type === 'number') {
    // PING
    if (it.type === 1) return res.status(200).json({ type: 1 });

    const guildId = it.guild_id || GUILD();

    // --- SLASH COMMANDS (type 2) ---
    if (it.type === 2) {
      const name = it.data?.name;
      const opt = (n) => (it.data?.options || []).find((x) => x.name === n)?.value;

      // Fast commands: answer immediately (no defer) so Discord never sits on "thinking"
      if (name === 'test') {
        return ack(res, `✅ HelpBet online · guild \`${guildId || 'none'}\`);
      }

      if (name === 'config') {
        if (!isAdmin(it)) return ack(res, 'Admin only.');
        try {
          const cfg = await loadCfg(guildId);
          for (const L of LEAGUE_KEYS) {
            const v = opt(`ch_${L}`) || opt(L.toLowerCase());
            if (v) cfg[`ch_${L}`] = v;
          }
          for (const k of ['tracker', 'stats', 'alerts', 'roles_panel']) {
            if (opt(k)) cfg[k] = opt(k);
          }
          await saveCfg(guildId, cfg);
          const lines = LEAGUE_KEYS.map((L) => `**${L}:** ${cfg[`ch_${L}`] ? `<#${cfg[`ch_${L}`]}>` : '_not set_'}`);
          lines.push(`**Tracker:** ${cfg.tracker ? `<#${cfg.tracker}>` : '_not set_'}`);
          lines.push(`**Alerts:** ${cfg.alerts ? `<#${cfg.alerts}>` : '_not set_'}`);
          return res.status(200).json({
            type: 4,
            data: {
              flags: 64,
              embeds: [{ title: 'HelpBet /config', description: lines.join('\n'), color: 0x38bdf8 }],
            },
          });
        } catch (e) {
          return ack(res, `Config error: ${String(e.message || e).slice(0, 120)}`);
        }
      }

      if (name === 'setroles') {
        if (!isAdmin(it)) return ack(res, 'Admin only.');
        try {
          const cfg = await loadCfg(guildId);
          for (const L of LEAGUE_KEYS) {
            const v = opt(`role_${L}`) || opt(L.toLowerCase());
            if (v) cfg[`role_${L}`] = v;
          }
          if (opt('role_ALL') || opt('all')) cfg.role_ALL = opt('role_ALL') || opt('all');
          if (opt('alert_role')) cfg.alert_role = opt('alert_role');
          await saveCfg(guildId, cfg);
          return ack(res, 'Roles saved.');
        } catch (e) {
          return ack(res, `setroles error: ${String(e.message || e).slice(0, 120)}`);
        }
      }

      if (name === 'login') {
        const username = opt('username');
        const password = opt('password');
        if (!username || !password) return ack(res, 'Need username + password.');
        try {
          const r = await fetch(`${BASE()}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) return ack(res, data.error || 'Login failed');
          try {
            await sb('user_settings', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=minimal',
              body: { username, notify_config: { linked_guild_id: guildId, linked_at: new Date().toISOString() } },
            });
          } catch {}
          return ack(res, `Linked **${username}** to this server.`);
        } catch (e) {
          return ack(res, `Login error: ${String(e.message || e).slice(0, 100)}`);
        }
      }

      // Slow commands: defer first, then edit original (clears "thinking")
      if (name === 'wipeallchannel') {
        if (!isAdmin(it)) return ack(res, 'Admin only.');
        defer(res);
        try {
          const cfg = await loadCfg(guildId);
          const channels = new Set();
          for (const L of LEAGUE_KEYS) if (cfg[`ch_${L}`]) channels.add(String(cfg[`ch_${L}`]));
          for (const k of ['tracker', 'stats', 'alerts']) if (cfg[k]) channels.add(String(cfg[k]));
          const one = opt('channel');
          if (one) {
            channels.clear();
            channels.add(String(one));
          }
          if (it.channel_id) channels.add(String(it.channel_id));
          if (!channels.size) {
            await finish(it, 'No channels found. Set them with /config or run this in a channel.');
            return;
          }
          await finish(it, `Wiping **${channels.size}** channel(s)…`);
          const results = [];
          for (const ch of channels) {
            try {
              results.push(`<#${ch}>: **${await wipeChannel(ch)}** msgs`);
            } catch (e) {
              results.push(`<#${ch}>: ${String(e.message || e).slice(0, 50)}`);
            }
          }
          await finish(it, `**Wipe done**\n${results.join('\n')}`);
        } catch (e) {
          await finish(it, `Wipe error: ${String(e.message || e).slice(0, 150)}`);
        }
        return;
      }

      if (name === 'send') {
        if (!isAdmin(it)) return ack(res, 'Admin only.');
        defer(res);
        try {
          const daysChoice = String(opt('days') || 'today_and_tomorrow');
          const now = new Date();
          const ct = (off) =>
            new Date(now.getTime() + off * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
          let dates = [ct(0)];
          if (daysChoice === 'today_and_tomorrow') dates = [ct(0), ct(1)];
          else if (daysChoice === 'next_3') dates = [ct(0), ct(1), ct(2)];
          const r = await fetch(`${BASE()}/api/send-days`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dates, force: true }),
          });
          const data = await r.json().catch(() => ({}));
          await finish(it, data.message || (r.ok ? 'Sent.' : `Error: ${data.error || r.status}`));
        } catch (e) {
          await finish(it, `Send failed: ${String(e.message || e).slice(0, 120)}`);
        }
        return;
      }

      return ack(res, `Unknown command: **/${name || '?'}**`);
    }

    // --- COMPONENTS (type 3) ---
    if (it.type === 3) {
      const cid = String(it.data?.custom_id || '');
      const parts = cid.split('|');

      if (cid.startsWith('role|')) {
        const roleId = (await loadCfg(guildId))[parts[1]];
        if (!roleId) return ack(res, 'Role not set. /setroles');
        const memberId = it.member?.user?.id || it.user?.id;
        try {
          if ((it.member?.roles || []).includes(roleId)) {
            await botApi('DELETE', `/guilds/${guildId}/members/${memberId}/roles/${roleId}`);
            return ack(res, `Removed <@&${roleId}>`);
          }
          await botApi('PUT', `/guilds/${guildId}/members/${memberId}/roles/${roleId}`);
          return ack(res, `Added <@&${roleId}>`);
        } catch (e) {
          return ack(res, `Role error: ${String(e.message || e).slice(0, 80)}`);
        }
      }

      if (cid.startsWith('pp|')) {
        // Defer update (type 6) — keeps the message, we then edit it
        res.status(200).json({ type: 6 });
        try {
          const act = parts[1];
          const gid = parts[2] || '';
          const game = await resolveGame(gid);
          const data = await loadProps(game);
          const props = Array.isArray(data.props) ? data.props : [];
          let payload;
          if (act === 'load') payload = categorySelect(gid, props);
          else if (act === 'cat') payload = playerSelect(gid, props, (it.data?.values && it.data.values[0]) || 'Other');
          else if (act === 'allpl') payload = playerSelect(gid, props, 'ALL');
          else if (act === 'pl') payload = playerBetsPayload(gid, props, dec(it.data?.values?.[0] || parts[3] || ''));
          else if (act === 'plshow') payload = playerBetsPayload(gid, props, dec(parts[3] || ''));
          else if (act === 'best') payload = bestPickPayload(gid, props, dec(parts[3] || ''));
          else if (act === 'top') payload = topPlaysPayload(gid, data);
          else payload = { content: 'Unknown props action.' };
          await editOriginal(it, payload);
        } catch (e) {
          try {
            await editOriginal(it, { content: `Props error: ${String(e.message || e).slice(0, 150)}` });
          } catch {}
        }
        return;
      }

      return ack(res, 'OK');
    }

    return ack(res, 'OK');
  }

  // --- Non-Discord POST: proxy to send-days ---
  if (req.method === 'POST') {
    try {
      const body = it && Object.keys(it).length ? it : await readBody(req);
      const r = await fetch(`${BASE()}/api/send-days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, force: true }),
      });
      const data = await r.json().catch(() => ({}));
      return res.status(r.ok ? 200 : 500).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  return res.status(200).json({ ok: true, service: 'notify', fixed: true });
}
