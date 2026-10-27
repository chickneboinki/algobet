/** Shared Discord player-props UI (not a serverless function — underscore prefix). */
export function enc(s) { return Buffer.from(String(s || ''), 'utf8').toString('base64url').slice(0, 40); }
export function dec(s) { try { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); } catch { return ''; } }
export function parseGid(gid) {
  const s = String(gid || '');
  const i = s.indexOf(':');
  if (i < 0) return { sport: '', gameId: s };
  return { sport: s.slice(0, i).toUpperCase(), gameId: s.slice(i + 1) };
}
export function marketCategory(m) {
  const s = String(m || '').toLowerCase();
  if (/point|pts|score/.test(s)) return 'Points';
  if (/rebound|reb/.test(s)) return 'Rebounds';
  if (/assist|ast/.test(s)) return 'Assists';
  if (/three|3-pt|3pt|3pm/.test(s)) return 'Threes';
  if (/steal|stl/.test(s)) return 'Steals';
  if (/block|blk/.test(s)) return 'Blocks';
  if (/pass|passing/.test(s)) return 'Passing';
  if (/rush|rushing/.test(s)) return 'Rushing';
  if (/receiv|rec |reception/.test(s)) return 'Receiving';
  if (/yard|yds/.test(s)) return 'Yards';
  if (/strikeout|k's|pitcher|era|hits allowed/.test(s)) return 'Pitching';
  if (/hit|rbi|home run|hr|batter/.test(s)) return 'Batting';
  if (/goal|shot|save/.test(s)) return 'Hockey';
  return 'Other';
}
export function categorySelect(gid, props) {
  const cats = [...new Set(props.map((p) => marketCategory(p.market_label || p.market)))].sort();
  if (!cats.length) cats.push('Other');
  const options = cats.slice(0, 25).map((c) => ({
    label: c.slice(0, 100), value: c.slice(0, 100),
    description: `${props.filter((p) => marketCategory(p.market_label || p.market) === c).length} lines`,
  }));
  return {
    embeds: [{ title: 'Pick a stat category', description: `**${props.length}** prop lines.\nChoose a category, then a player.`, color: 0x38bdf8 }],
    components: [
      { type: 1, components: [{ type: 3, custom_id: `pp|cat|${gid}`.slice(0, 100), placeholder: 'Pick a service category...', options }] },
      { type: 1, components: [
        { type: 2, style: 1, label: 'All players', custom_id: `pp|allpl|${gid}`.slice(0, 100) },
        { type: 2, style: 3, label: 'Top leans (all)', custom_id: `pp|top|${gid}`.slice(0, 100) },
      ]},
    ],
  };
}
export function playerSelect(gid, props, category) {
  const filtered = category && category !== 'ALL'
    ? props.filter((p) => marketCategory(p.market_label || p.market) === category) : props;
  const names = [...new Set(filtered.map((p) => p.player).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!names.length) {
    return { embeds: [{ title: 'No players', description: `No props in **${category || 'this'}** yet.`, color: 0x6b7280 }], components: [] };
  }
  const options = names.slice(0, 25).map((n) => ({
    label: n.slice(0, 100), value: enc(n),
    description: `${filtered.filter((p) => p.player === n).length} bet(s)`,
  }));
  return {
    embeds: [{ title: category && category !== 'ALL' ? `Players · ${category}` : 'All players', description: 'Select a player to see their prop bets.', color: 0x38bdf8 }],
    components: [
      { type: 1, components: [{ type: 3, custom_id: `pp|pl|${gid}|${enc(category || 'ALL')}`.slice(0, 100), placeholder: 'Pick a player...', options }] },
      { type: 1, components: [{ type: 2, style: 2, label: '← Categories', custom_id: `pp|load|${gid}`.slice(0, 100) }] },
    ],
  };
}
export function playerBetsPayload(gid, props, player) {
  const rows = props.filter((p) => p.player === player);
  if (!rows.length) return { embeds: [{ title: player, description: 'No props found.', color: 0x6b7280 }], components: [] };
  const lines = rows.slice(0, 15).map((p) => {
    const lean = p.lean ? ` · **${String(p.lean.side).toUpperCase()}** (${p.lean.strength})` : '';
    return `**${p.market_label || p.market}** ${p.line ?? ''} · ${p.book || ''}${lean}`;
  });
  return {
    embeds: [{ title: `Props · ${player}`, description: lines.join('\n'), color: 0x22c55e }],
    components: [
      { type: 1, components: [
        { type: 2, style: 3, label: 'Best pick for this player', custom_id: `pp|best|${gid}|${enc(player)}`.slice(0, 100) },
        { type: 2, style: 2, label: '← Players', custom_id: `pp|allpl|${gid}`.slice(0, 100) },
      ]},
      { type: 1, components: [{ type: 2, style: 2, label: '← Categories', custom_id: `pp|load|${gid}`.slice(0, 100) }] },
    ],
  };
}
export function bestPickPayload(gid, props, player) {
  const rows = props.filter((p) => p.player === player && p.lean);
  const rank = { High: 3, Medium: 2, Low: 1 };
  rows.sort((a, b) => (rank[b.lean?.strength] || 0) - (rank[a.lean?.strength] || 0));
  if (!rows.length) {
    return {
      embeds: [{ title: `Best pick · ${player}`, description: 'No strong lean yet for this player.', color: 0x6b7280 }],
      components: [{ type: 1, components: [{ type: 2, style: 2, label: '← Back', custom_id: `pp|plshow|${gid}|${enc(player)}`.slice(0, 100) }] }],
    };
  }
  const best = rows[0];
  return {
    embeds: [{
      title: `Best pick · ${player}`,
      description: [
        `**${best.market_label || best.market}** ${best.line ?? ''}`,
        `**Lean:** **${String(best.lean.side).toUpperCase()}** · ${best.lean.strength}`,
        best.lean.why ? `**Why:** ${String(best.lean.why).slice(0, 280)}` : null,
        `**Book:** ${best.book || '—'}`,
      ].filter(Boolean).join('\n'),
      color: 0x22c55e,
    }],
    components: [{ type: 1, components: [
      { type: 2, style: 2, label: '← All props for player', custom_id: `pp|plshow|${gid}|${enc(player)}`.slice(0, 100) },
      { type: 2, style: 2, label: '← Categories', custom_id: `pp|load|${gid}`.slice(0, 100) },
    ]}],
  };
}
export function topPlaysPayload(gid, data) {
  const top = data.top_plays || [];
  if (!top.length) {
    return { embeds: [{ title: 'Top leans', description: 'No strong leans for this game yet.', color: 0x6b7280 }], components: [] };
  }
  const lines = top.slice(0, 12).map((p) =>
    `**${p.player}** — ${p.market_label || p.market} ${p.line ?? ''} · **${String(p.lean?.side || '').toUpperCase()}** (${p.lean?.strength || ''})`
  );
  return {
    embeds: [{ title: 'Best props for this game', description: lines.join('\n'), color: 0x22c55e }],
    components: [{ type: 1, components: [{ type: 2, style: 2, label: '← Categories', custom_id: `pp|load|${gid}`.slice(0, 100) }] }],
  };
}
