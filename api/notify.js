import crypto from 'node:crypto';

const GUILD = () => process.env.DISCORD_GUILD_ID || '';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function botApi(method, path, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if (r.status === 429) {
      let wait = 1.5;
      try { wait = Math.min(6, Number(JSON.parse(text).retry_after) || 1.5); } catch {}
      await sleep(wait * 1000 + 100);
      continue;
    }
    throw new Error(`Discord ${r.status}: ${text.slice(0, 160)}`);
  }
  throw new Error('Discord rate limited');
}

function sbHeaders() {
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}
function sbUrl() { return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; }
async function sb(path, opts = {}) {
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: { ...sbHeaders(), ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function loadCfg(guildId) {
  if (!guildId) return {};
  try {
    const rows = await sb(`discord_config?guild_id=eq.${guildId}&select=config&limit=1`);
    return rows?.[0]?.config || {};
  } catch { return {}; }
}

function text(content) { return { type: 4, data: { flags: 64, content } }; }
function eph(data) { return { type: 4, data: { flags: 64, ...data } }; }

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const route = req.query?.route || '';

  if (route === 'interactions' || req.url?.includes('discord-interactions')) {
    try {
      let raw = '';
      if (typeof req.body === 'string') raw = req.body;
      else if (req.body) raw = JSON.stringify(req.body);
      else {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        raw = Buffer.concat(chunks).toString('utf8');
      }
      const it = raw ? JSON.parse(raw) : {};
      if (it.type === 1) return res.status(200).json({ type: 1 });

      if (it.type === 2) {
        res.status(200).json({ type: 5 });
        const name = it.data?.name;
        const follow = async (content) => {
          try {
            await botApi('POST', `/webhooks/${it.application_id}/${it.token}/messages/@original`, { content });
          } catch {}
        };
        if (name === 'wipeallchannel') {
          const ch = (it.data?.options || []).find((x) => x.name === 'channel')?.value || it.channel_id;
          if (!ch) { await follow('No channel.'); return; }
          let deleted = 0;
          for (let pass = 0; pass < 2; pass++) {
            try {
              const msgs = await botApi('GET', `/channels/${ch}/messages?limit=100`);
              if (!Array.isArray(msgs) || !msgs.length) break;
              for (const m of msgs) {
                try { await botApi('DELETE', `/channels/${ch}/messages/${m.id}`); deleted += 1; await sleep(350); } catch {}
              }
            } catch { break; }
          }
          await follow(`Wiped ~${deleted} messages.`);
          return;
        }
        if (name === 'send') {
          const base = process.env.APP_URL || 'https://helpbet.vercel.app';
          const daysChoice = String((it.data?.options || []).find((x) => x.name === 'days')?.value || 'today_and_tomorrow');
          const now = new Date();
          const ct = (off) => {
            const d = new Date(now.getTime() + off * 86400000);
            return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
          };
          let dates = [ct(0)];
          if (daysChoice === 'today_and_tomorrow') dates = [ct(0), ct(1)];
          else if (daysChoice === 'next_3') dates = [ct(0), ct(1), ct(2)];
          try {
            const r = await fetch(`${base}/api/send-days`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dates, force: true }),
            });
            const data = await r.json().catch(() => ({}));
            await follow(data.message || (r.ok ? 'Sent.' : `Error: ${data.error || r.status}`));
          } catch (e) {
            await follow(`Send failed: ${String(e.message || e).slice(0, 120)}`);
          }
          return;
        }
        if (name === 'config' || name === 'setroles' || name === 'login' || name === 'test') {
          await follow(`Command **/${name}** — use website for full config. Send works.`);
          return;
        }
        await follow(`Unknown command: ${name}`);
        return;
      }

      if (it.type === 3) {
        const cid = String(it.data?.custom_id || '');
        if (cid.startsWith('pp|')) {
          return res.status(200).json(eph({ content: 'Player props: open https://helpbet.vercel.app for full stats board.' }));
        }
        if (cid.startsWith('role|')) {
          return res.status(200).json(text('Role toggle — set roles on website / Setup.'));
        }
        return res.status(200).json(text('OK'));
      }
      return res.status(200).json(text('OK'));
    } catch (e) {
      return res.status(200).json(text(`Error: ${String(e.message || e).slice(0, 100)}`));
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const base = process.env.APP_URL || 'https://helpbet.vercel.app';
      const r = await fetch(`${base}/api/send-days`, {
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

  return res.status(200).json({ ok: true, service: 'notify-minimal' });
}
