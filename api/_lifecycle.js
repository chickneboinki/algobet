import { fetchScoreboard } from './settle.js';
/** Lifecycle: live alerts + COMPLETE embeds + tracker/stats. Underscore so Vercel does not count as a function. */
export async function settlePostedPicks({ sb, loadCfg, GUILD, botApi, sendChannel, liveAlertEmbed, teamsMatchLoose }) {
  let pending;
  try {
    pending = await sb(`discord_posts?status=in.(pending,live)&select=*&order=created_at.asc&limit=150`);
  } catch { return { checked: 0, settled: 0, live_alerts: 0 }; }
  if (!pending?.length) return { checked: 0, settled: 0, live_alerts: 0 };

  const sports = [...new Set(pending.map((r) => String(r.sport || 'NFL').toUpperCase()))];
  const board = [];
  for (const s of sports) {
    try { board.push(...(await fetchScoreboard(s))); } catch {}
  }

  const guildIds = [...new Set(pending.map((r) => r.guild_id).filter(Boolean))];
  const cfgByGuild = {};
  for (const gid of guildIds) {
    try { cfgByGuild[gid] = await loadCfg(gid); } catch { cfgByGuild[gid] = {}; }
  }
  const defaultGuild = GUILD();
  if (defaultGuild && !cfgByGuild[defaultGuild]) {
    try { cfgByGuild[defaultGuild] = await loadCfg(defaultGuild); } catch { cfgByGuild[defaultGuild] = {}; }
  }

  let settled = 0, liveAlerts = 0, trackerPosts = 0, statsPosts = 0;

  for (const row of pending) {
    const match = board.find((f) =>
      String(f.sport).toUpperCase() === String(row.sport).toUpperCase() &&
      teamsMatchLoose(f.home_team, row.home_team) && teamsMatchLoose(f.away_team, row.away_team)
    );
    if (!match) continue;

    const cfg = cfgByGuild[row.guild_id] || cfgByGuild[defaultGuild] || {};
    const side = String(row.snapshot?.recommended_side || '').toLowerCase();
    const sportU = String(row.sport || '').toUpperCase();

    if (match.state === 'live' && row.status === 'pending') {
      if (row.channel_id && row.message_id) {
        try {
          await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
            embeds: [{
              title: `${sportU} · LIVE`,
              description: `**${row.away_team} vs ${row.home_team}**\n**Score:** ${match.away_score} — ${match.home_score}\n**Status:** ${match.detail || 'In progress'}\n**Lean:** **${(side || '?').toUpperCase()}**`,
              color: 0xef4444,
              footer: { text: 'LIVE' },
            }],
          });
        } catch {}
      }
      if (cfg.alerts) {
        try {
          const roleId = cfg.alert_role || cfg[`role_${sportU}`] || cfg.role_ALL;
          await sendChannel(cfg.alerts, {
            content: roleId ? `<@&${roleId}>` : undefined,
            embeds: [liveAlertEmbed(row, match)],
            allowed_mentions: roleId ? { roles: [roleId] } : { parse: [] },
          });
          liveAlerts += 1;
        } catch {}
      }
      try {
        await sb(`discord_posts?id=eq.${row.id}`, {
          method: 'PATCH',
          body: { status: 'live' },
          prefer: 'return=minimal',
        });
      } catch {}
      continue;
    }

    if (match.state === 'live' && row.status === 'live' && row.channel_id && row.message_id) {
      try {
        await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
          embeds: [{
            title: `${sportU} · LIVE`,
            description: `**${row.away_team} vs ${row.home_team}**\n**Score:** ${match.away_score} — ${match.home_score}\n**Status:** ${match.detail || 'In progress'}\n**Lean:** **${(side || '?').toUpperCase()}**`,
            color: 0xef4444,
            footer: { text: 'LIVE' },
          }],
        });
      } catch {}
      continue;
    }

    if (match.state !== 'final') continue;

    let hit = null;
    if (side === 'home' || side === 'away') {
      if (match.home_score === match.away_score) hit = 'push';
      else {
        const homeWon = match.home_score > match.away_score;
        hit = (side === 'home' && homeWon) || (side === 'away' && !homeWon) ? 'hit' : 'miss';
      }
    }
    const resultText =
      `**FINAL:** ${match.away_team} ${match.away_score} — ${match.home_score} ${match.home_team}` +
      (hit
        ? `\n**Bet result:** ${hit === 'hit' ? '✅ HIT' : hit === 'push' ? '➖ PUSH' : '❌ MISS'} (lean was **${side.toUpperCase()}**)`
        : '');

    if (row.channel_id && row.message_id) {
      try {
        await botApi('PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, {
          embeds: [{
            title: `${sportU} · COMPLETE`,
            description: `**${row.away_team} vs ${row.home_team}**\n${resultText}`,
            color: hit === 'hit' ? 0x22c55e : hit === 'miss' ? 0xef4444 : 0x6b7280,
            footer: { text: 'FINAL' },
          }],
          components: [],
        });
      } catch {}
    }

    if (cfg.tracker) {
      try {
        await sendChannel(cfg.tracker, {
          embeds: [{
            title: `${sportU} · Result`,
            description: `**${row.away_team} vs ${row.home_team}**\n${resultText}`,
            color: hit === 'hit' ? 0x22c55e : hit === 'miss' ? 0xef4444 : 0x6b7280,
          }],
        });
        trackerPosts += 1;
      } catch {}
    }

    if (cfg.stats) {
      try {
        const conf = row.snapshot?.confidence != null ? Math.round(Number(row.snapshot.confidence) * 100) : null;
        const algo = row.snapshot?.algorithm_name || 'HelpBet';
        await sendChannel(cfg.stats, {
          embeds: [{
            title: `${sportU} · Stat breakdown`,
            description: [
              `**${row.away_team} vs ${row.home_team}**`,
              `**Final:** ${match.away_score} — ${match.home_score}`,
              `**Lean:** **${(side || '?').toUpperCase()}**${conf != null ? ` · ${conf}%` : ''}`,
              `**Model:** ${algo}`,
              hit ? `**Outcome:** ${hit === 'hit' ? 'HIT ✅' : hit === 'push' ? 'PUSH' : 'MISS ❌'}` : null,
            ].filter(Boolean).join('\n'),
            color: 0x38bdf8,
          }],
        });
        statsPosts += 1;
      } catch {}
    }

    try {
      await sb(`discord_posts?id=eq.${row.id}`, {
        method: 'PATCH',
        body: { status: 'final', result: { home_score: match.home_score, away_score: match.away_score, hit } },
        prefer: 'return=minimal',
      });
    } catch {}
    settled += 1;
  }

  return { checked: pending.length, settled, live_alerts: liveAlerts, tracker: trackerPosts, stats: statsPosts };
}
