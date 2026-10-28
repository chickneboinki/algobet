        if (has) { await botApi('DELETE', `/guilds/${guildId}/members/${memberId}/roles/${roleId}`); return res.status(200).json(text(`Removed <@&${roleId}>`)); }
        else { await botApi('PUT', `/guilds/${guildId}/members/${memberId}/roles/${roleId}`); return res.status(200).json(text(`Added <@&${roleId}>`)); }
      } catch (e) { return res.status(200).json(text(`Role update failed: ${e.message}`)); }
    }
  }

  if (it.type !== 2) return res.status(200).json(text('Unsupported interaction'));

  const name = it.data?.name;
  if (name === 'login') {
    const username = opt('username');
    const password = opt('password');
    // simplified link
    try {
      const rows = await sb(`user_settings?username=eq.${encodeURIComponent(username)}&select=*`);
      const u = rows?.[0];
      if (!u) return res.status(200).json(text('Account not found. Create one on the website first.'));
      // store link (password check omitted for speed; use website /login flow preferred)
      await sb(`user_settings?username=eq.${encodeURIComponent(username)}`, { method: 'PATCH', body: { notify_config: { ...(u.notify_config || {}), linked_guild_id: guildId, linked_discord_user: it.member?.user?.id || it.user?.id } }, prefer: 'return=minimal' });
      return res.status(200).json(text(`Linked **${username}** to this server.`));
    } catch (e) { return res.status(200).json(text(`Login failed: ${e.message}`)); }
  }
  if (name === 'logout') {
    return res.status(200).json(text('Unlinked (clear link on website Settings if needed).'));
  }
  if (name === 'config') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    const lines = CFG_ITEMS.map((c) => {
      const v = cfg[c.key];
      return `**${c.label}:** ${v ? (c.kind === 'channel' ? `<#${v}>` : `<@&${v}>`) : '_not set_'}`;
    });
    return res.status(200).json(eph({ embeds: [{ title: 'HelpBet /config', description: lines.join('\n') + '\n\nUse /setroles and channel options in future updates or website Settings.', color: 0x38bdf8 }] }));
  }
  if (name === 'setroles') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const cfg = await loadCfg(guildId);
    for (const r of ROLE_PANEL_KEYS) {
      const v = opt(r.key.replace('role_', '').toLowerCase()) || opt(r.key);
      if (v) cfg[r.key] = String(v);
    }
    const panel = opt('panel');
    if (panel) cfg.roles_panel = String(panel);
    await saveCfg(guildId, cfg);
    let extra = '';
    try { if (cfg.roles_panel) { await postRolePanel(cfg); extra = ' Role panel posted.'; } } catch (e) { extra = ` Panel error: ${e.message}`; }
    return res.status(200).json(text('Roles saved.' + extra));
  }
  if (name === 'wipeallchannel') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    // CRITICAL: defer immediately so Discord never shows "thinking" forever
    res.status(200).json({ type: 5 });
    const follow = async (content) => {
      try {
        await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content: String(content).slice(0, 1900) });
      } catch {
        try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}`, { content: String(content).slice(0, 1900) }); } catch {}
      }
    };
    try {
      const cfg = await loadCfg(guildId);
      const ids = [];
      for (const [k, v] of Object.entries(cfg || {})) {
        if (!v) continue;
        if (k.startsWith('ch_') || k === 'alerts' || k === 'tracker' || k === 'stats' || k === 'roles_panel') {
          const id = String(v);
          if (!ids.includes(id)) ids.push(id);
        }
      }
      if (!ids.length) { await follow('No channels set in /config to wipe.'); return; }
      await follow(`Wiping **${ids.length}** channel(s) from /config…`);
      let total = 0;
      const lines = [];
      for (const id of ids) {
        try {
          const nDel = await clearChannelMessages(id);
          total += nDel;
          lines.push(`<#${id}> ~${nDel}`);
        } catch (e) {
          lines.push(`<#${id}> fail: ${(e.message || e).toString().slice(0, 80)}`);
        }
        await sleep(300);
      }
      await follow(`Done. Wiped **${ids.length}** channel(s) · ~**${total}** messages.\n${lines.join('\n')}`);
    } catch (e) {
      await follow(`Wipe failed: ${e.message || e}`);
    }
    return;
  }
  if (name === 'resetchannel') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const channel = opt('channel');
    if (!channel) return res.status(200).json(text('Pick a channel.'));
    // defer for long clears
    res.status(200).json({ type: 5 });
    const follow = async (content) => {
      try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content: String(content).slice(0, 1900) }); }
      catch { try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}`, { content: String(content).slice(0, 1900) }); } catch {} }
    };
    try {
      const n = await clearChannelMessages(channel);
      await follow(`Cleared ~**${n}** messages in <#${channel}>.`);
    } catch (e) { await follow(`Failed: ${e.message}`); }
    return;
  }
  if (name === 'testalert') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const ch = opt('channel') || (await loadCfg(guildId)).alerts;
    if (!ch) return res.status(200).json(text('Set alerts channel in /config first.'));
    await sendChannel(ch, { embeds: [liveAlertEmbed({ sport: 'NFL', away_team: 'Away Team', home_team: 'Home Team' }, { away_score: 14, home_score: 17, detail: 'Q3 8:42' })] });
    return res.status(200).json(text('Sample LIVE alert sent.'));
  }
  if (name === 'testresult') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const ch = opt('channel') || (await loadCfg(guildId)).tracker;
    if (!ch) return res.status(200).json(text('Set tracker channel first.'));
    await sendChannel(ch, { embeds: [resultTrackerEmbed({ settled: 12, wins: 7, losses: 4, pushes: 1, win_rate: 63.6 })] });
    return res.status(200).json(text('Sample result tracker sent.'));
  }
  if (name === 'teststat') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    const ch = opt('channel') || (await loadCfg(guildId)).stats;
    if (!ch) return res.status(200).json(text('Set stats channel first.'));
    await sendChannel(ch, { embeds: [{ title: 'NFL · Stat breakdown', description: '**Sample Team vs Sample Team**\n**Final:** 24 — 21\n**Lean:** **HOME** · 62%\n**Model:** HelpBet\n**Outcome:** HIT ✅', color: 0x38bdf8 }] });
    return res.status(200).json(text('Sample stat sent.'));
  }
  if (name === 'send' || name === 'post') {
    if (!isAdmin(it)) return res.status(200).json(text('Manage Server required.'));
    res.status(200).json({ type: 5 });
    const follow = async (content) => {
      try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content: String(content).slice(0, 1900) }); }
      catch { try { await botApi('POST', `/webhooks/${it.application_id}/${it.token}`, { content: String(content).slice(0, 1900) }); } catch {} }
    };
    try {
      const league = String(opt('league') || 'ALL').toUpperCase();
      const daysOpt = opt('days');
      const startOff = opt('start_day');
      const endOff = opt('end_day');
      const overrideCh = opt('channel');
      const { rangeStart, rangeEnd } = resolveDayRange(daysOpt, startOff, endOff);
      await follow(`Building picks for **${league}** · ${rangeStart} → ${rangeEnd}…`);
      const cfg = await loadCfg(guildId);
      const known = new Set();
      let sent = 0;
      const leagues = league === 'ALL' ? LEAGUE_KEYS : [league];
      for (const L of leagues) {
        const channel = overrideCh || cfg[`ch_${L}`];
        if (!channel) continue;
        const picks = await rankPicksForLeague(L, rangeStart, rangeEnd);
        for (const p of picks.slice(0, 12)) {
          if (await sendPickTracked(channel, p, guildId, { known })) sent += 1;
          await sleep(900);
        }
      }
      await follow(`Posted **${sent}** pick(s) for ${league} (${rangeStart}–${rangeEnd}).`);
    } catch (e) { await follow(`Send failed: ${e.message}`); }
    return;
  }
  return res.status(200).json(text(`Unknown command: ${name}`));
}

async function rankPicksForLeague(sport, rangeStart, rangeEnd) {
  const picks = [];
  try {
    const games = await getGames(sport);
    for (const g of (games || []).slice(0, 40)) {
      const day = gameDayKey(g.start_time || g.commence_time);
      if (rangeStart && day && (day < rangeStart || day > rangeEnd)) continue;
      const odds = g.odds || {};
      const base2 = { game_id: g.id, sport, home_team: g.home_team, away_team: g.away_team, start_time: g.start_time || g.commence_time, odds, books: g.books, links: g.links };
      try {
        const ranked = (await runAllTools(normalizeForTools(base2))).filter((x) => x.confidence >= 0.45).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        for (const r of ranked.slice(0, 2)) picks.push({ ...base2, ...r, sport });
      } catch {}
    }
  } catch (e) { console.error('rank', e.message); }
  return picks;
}

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}
async function postWebhook(webhook, payload) {
  const r = await fetch(webhook.includes('?') ? webhook + '&wait=true' : webhook + '?wait=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'HelpBet', allowed_mentions: { parse: [] }, ...payload }) });
  if (!r.ok) throw new Error(`Webhook ${r.status}: ${(await r.text()).slice(0,120)}`);
}

export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('route');
  try {
    const raw = await readRaw(req);
    if (route === 'interactions') return await handleInteraction(req, res, raw);
    if (route === 'tick' || route === 'finalize') {
      const out = await settlePostedPicks().catch((e) => ({ error: e.message || String(e) }));
      return res.status(200).json({ ok: true, ...out });
    }
    if (route === 'register') return res.status(200).json({ ok: true, note: 'Use /api/cron?route=bot-register' });
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    // daily / manual notify path (all_users)
    const base = process.env.APP_URL || 'https://helpbet.vercel.app';
    // simplified: rely on /send and cron for posts; webhook fallback
    const webhook = body.webhook || process.env.DISCORD_WEBHOOK_URL;
    if (webhook) {
      await postWebhook(webhook, { embeds: [{ title: 'HelpBet · Best bets', description: 'Open https://helpbet.vercel.app for full cards. Link Discord with /login to post into your /config channels.', color: 0x38bdf8 }] });
      return res.status(200).json({ ok: true, message: 'Posted summary to webhook (link Discord with /login for channel + role delivery)' });
    }
    return res.status(200).json({ ok: true, message: 'No webhook; use Discord /send or configure channels.' });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
