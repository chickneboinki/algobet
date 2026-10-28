      const base2 = { game_id: g.id, sport, home_team: g.home_team, away_team: g.away_team, start_time: g.start_time || g.commence_time, odds, books: g.books, links: g.links };
      const ranked = runAllTools(normalizeForTools(base2)).filter((x) => x.confidence >= 0.45).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      for (const r of ranked.slice(0, 3)) picks.push({ ...base2, ...r, sport });
    }
  } catch (e) { console.error('rank', e.message); }
  return picks;
}

function categorySelect(gid) {
  return {
    embeds: [{ title: 'Player props', description: 'Choose a category or open the full board.', color: 0x38bdf8 }],
    components: [
      { type: 1, components: [
        { type: 2, style: 1, label: 'Points / Goals', custom_id: `pp|cat|${gid}|pts` },
        { type: 2, style: 1, label: 'Assists / Passing', custom_id: `pp|cat|${gid}|ast` },
        { type: 2, style: 1, label: 'Rebounds / Receptions', custom_id: `pp|cat|${gid}|reb` },
        { type: 2, style: 1, label: 'All stats', custom_id: `pp|cat|${gid}|all` },
      ]},
      { type: 1, components: [
        { type: 2, style: 3, label: 'Best picks for this game', custom_id: `pp|top|${gid}` },
      ]},
    ],
  };
}

function playerSelect(gid, players, leanPlayers) {
  const options = players.slice(0, 25).map((name) => ({
    label: name.slice(0, 100),
    value: encId(name),
    description: leanPlayers.has(name) ? 'Strong lean available' : undefined,
  }));
  const rows = [];
  if (options.length) {
    rows.push({ type: 1, components: [{ type: 3, custom_id: `pp|sel|${gid}`, placeholder: 'Pick a player — stats, props & best bet', options }] });
  }
  rows.push({ type: 1, components: [{ type: 2, style: 1, label: 'Best picks for this game (all stats)', custom_id: `pp|top|${gid}` }] });
  return { embeds: [{ title: 'Choose a player', description: 'Select a player to see their props and the best lean.', color: 0x38bdf8 }], components: rows };
}

function playerPropsEmbed(player, props, gid) {
  const rows = props.filter((p) => p.player === player);
  const lines = rows.slice(0, 12).map((p) => `**${p.stat || p.market}** · ${p.line ?? '?'} · ${p.side || ''} ${p.odds != null ? `(${p.odds > 0 ? '+' : ''}${p.odds})` : ''}`);
  const best = bestPlayerLean(props, player);
  const components = [];
  if (best) components.push({ type: 1, components: [{ type: 2, style: 3, label: 'Best pick for this player', custom_id: `pp|best|${gid}|${encId(player)}` }] });
  return {
    embeds: [{ title: `${player} · Props`, description: lines.join('\n') || 'No props found.', color: 0x38bdf8 }],
    components,
  };
}

function topPlaysEmbed(topPlays) {
  if (!topPlays?.length) return { embeds: [{ title: 'Best picks', description: 'No strong leans for this game yet.', color: 0x38bdf8 }], components: [] };
  const lines = topPlays.slice(0, 10).map((p) => `**${p.player}** · ${p.stat || p.market} ${p.side || ''} ${p.line ?? ''} · ${p.confidence != null ? Math.round(p.confidence * 100) + '%' : ''}`);
  return { embeds: [{ title: 'Best picks for this game', description: lines.join('\n'), color: 0x22c55e }], components: [] };
}

function bestPickPayload(best) {
  if (!best) return { embeds: [{ title: 'Best pick', description: 'No strong lean for this player.', color: 0x6b7280 }], components: [] };
  return {
    embeds: [{ title: `Best pick · ${best.player}`, description: `**${best.stat || best.market}** ${best.side || ''} ${best.line ?? ''}\nConfidence ${best.confidence != null ? Math.round(best.confidence * 100) + '%' : '—'}`, color: 0x22c55e }],
    components: [],
  };
}

async function handleInteraction(req, res, raw) {
  let it;
  try { it = JSON.parse(raw || '{}'); } catch { return res.status(400).send('bad json'); }
  if (it.type === 1) return res.status(200).json({ type: 1 }); // PING

  const guildId = it.guild_id || GUILD();
  const opt = (name) => {
    const o = (it.data?.options || []).find((x) => x.name === name);
    return o?.value;
  };

  // Button / select interactions for player props
  if (it.type === 3 || it.type === 2) {
    const cid = String(it.data?.custom_id || '');
    if (cid.startsWith('pp|')) {
      const parts = cid.split('|');
      const act = parts[1];
      const mid = parts[2];
      const load = async (gid) => {
        try {
          const data = await fetchPropsForGame(gid);
          return data || null;
        } catch { return null; }
      };
      const busy = eph({ embeds: [{ title: 'Loading…', description: 'Fetching props, try again in a second.', color: 0x6b7280 }] });

      if (act === 'open') {
        return res.status(200).json(eph(categorySelect(mid)));
      }
      if (act === 'cat') {
        const cat = parts[3] || 'all';
        const propsData = await load(mid);
        if (!propsData) return res.status(200).json(eph({ embeds: [{ title: 'Game not found (it may have started/finished).', color: 0x6b7280 }] }));
        const players = [...new Set((propsData.props || []).map((x) => x.player).filter(Boolean))];
        const leanPlayers = new Set((propsData.top_plays || []).map((x) => x.player));
        return res.status(200).json(eph(playerSelect(mid, players, leanPlayers)));
      }
      if (act === 'sel') {
        const player = decId(it.data?.values?.[0] || '');
        const propsData = await load(mid);
        if (!propsData) return res.status(200).json(eph({ embeds: [{ title: 'Game not found.', color: 0x6b7280 }] }));
        if (!player) return res.status(200).json(eph(topPlaysEmbed(propsData.top_plays || [])));
        return res.status(200).json(eph(playerPropsEmbed(player, propsData.props || [], mid)));
      }
      if (act === 'top') {
        const propsData = await load(mid);
        if (!propsData) return res.status(200).json(eph({ embeds: [{ title: 'Game not found.', color: 0x6b7280 }] }));
        return res.status(200).json(eph(topPlaysEmbed(propsData.top_plays || [])));
      }
      if (act === 'best') {
        const player = decId(parts[3] || '');
        const propsData = await load(mid);
        if (!propsData) return res.status(200).json(eph({ embeds: [{ title: 'Game not found.', color: 0x6b7280 }] }));
        const best = bestPlayerLean(propsData.props || [], player);
        return res.status(200).json(eph(bestPickPayload(best)));
      }
    }
    if (cid.startsWith('role|')) {
      const key = cid.split('|')[1];
      const cfg = await loadCfg(guildId);
      const roleId = cfg[key];
      if (!roleId) return res.status(200).json(text('Role not configured. Use /setroles first.'));
      const memberId = it.member?.user?.id || it.user?.id;
      const has = (it.member?.roles || []).includes(roleId);
      try {
