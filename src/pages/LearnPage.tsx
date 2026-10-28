import { useEffect, useMemo, useRef, useState } from 'react'

type Visual =
  | { t: 'odds'; rows: { odds: string; pct: number; note: string }[] }
  | { t: 'edge'; mine: number; market: number; ev: string }
  | { t: 'shop'; rows: { book: string; line: string; best?: boolean }[] }
  | { t: 'board' }
  | { t: 'units'; bars: { label: string; pct: number; bad?: boolean }[] }

type Scene = { title: string; text: string; v: Visual }
type Lesson = { id: string; name: string; blurb: string; length: string; scenes: Scene[] }

const LESSONS: Lesson[] = [
  {
    id: 'odds',
    name: 'Read the odds',
    blurb: 'What -150 and +130 actually say about a team’s chances.',
    length: '0:30',
    scenes: [
      { title: 'Odds are a price', text: 'American odds show what you risk or win. Minus means the favorite, plus means the underdog.', v: { t: 'odds', rows: [{ odds: '-150', pct: 60, note: 'Risk $150 to win $100' }, { odds: '+130', pct: 43.5, note: 'Risk $100 to win $130' }] } },
      { title: 'Turn odds into a chance', text: 'Every price implies a win chance. -150 means the book needs this side to win about 60% of the time.', v: { t: 'odds', rows: [{ odds: '-150', pct: 60, note: 'Implied 60.0%' }, { odds: '+130', pct: 43.5, note: 'Implied 43.5%' }] } },
      { title: 'The books keep a cut', text: '60.0% + 43.5% is 103.5%. The extra 3.5% is the book’s margin (the vig). You have to beat it to profit.', v: { t: 'odds', rows: [{ odds: 'Total', pct: 100, note: 'Fair market = 100%' }, { odds: '103.5%', pct: 100, note: 'With the vig' }] } },
    ],
  },
  {
    id: 'value',
    name: 'What makes a bet “good”',
    blurb: 'Value means your chance beats the price, not that the team wins.',
    length: '0:35',
    scenes: [
      { title: 'Good bet ≠ likely winner', text: 'A good bet is one where the true chance is higher than the price says. Favorites can be bad bets.', v: { t: 'edge', mine: 58, market: 52.4, ev: '' } },
      { title: 'Find the edge', text: 'At -110 the book implies 52.4%. If a tool says the true chance is 58%, your edge is +5.6 points.', v: { t: 'edge', mine: 58, market: 52.4, ev: '+5.6 pts' } },
      { title: 'Edge pays over time', text: 'On a $100 bet at -110 with a 58% chance, you expect to make about $10.73 per bet. One bet can still lose.', v: { t: 'edge', mine: 58, market: 52.4, ev: '+$10.73 per $100' } },
    ],
  },
  {
    id: 'shop',
    name: 'Shop the line',
    blurb: 'The same bet can pay more at a different sportsbook.',
    length: '0:30',
    scenes: [
      { title: 'Check more than one book', text: 'Books set their own prices. Open the same game at DraftKings and FanDuel before you bet.', v: { t: 'shop', rows: [{ book: 'DraftKings', line: 'Home -145' }, { book: 'FanDuel', line: 'Home -150' }] } },
      { title: 'Small gaps add up', text: '-145 beats -150: you risk $5 less for the same $100 win. Over hundreds of bets that is real money.', v: { t: 'shop', rows: [{ book: 'DraftKings', line: 'Home -145', best: true }, { book: 'FanDuel', line: 'Home -150' }] } },
      { title: 'Half points matter', text: 'Spread -3 vs -3.5 changes whether a 3-point win covers. Take the number that helps you.', v: { t: 'shop', rows: [{ book: 'Book A', line: 'Home -3.5' }, { book: 'Book B', line: 'Home -3', best: true }] } },
    ],
  },
  {
    id: 'props',
    name: 'Using a player props board',
    blurb: 'How to read a line on PrizePicks-style and sportsbook prop boards.',
    length: '0:40',
    scenes: [
      { title: 'Open the board', text: 'On PrizePicks, DraftKings or FanDuel, pick a sport and a player. You see a stat and a line, like Points 27.5.', v: { t: 'board' } },
      { title: 'Over or under', text: 'You choose whether the player ends above (More / Over) or below (Less / Under) the line. Half-point lines never push.', v: { t: 'board' } },
      { title: 'Compare the line', text: 'If another site has the same stat at 25.5, the Over at 25.5 is easier. HelpBet flags these as line gaps.', v: { t: 'board' } },
      { title: 'Pick, don’t stack', text: 'Choose only plays with a clear reason. More picks in one entry means a lower chance that all of them hit.', v: { t: 'board' } },
    ],
  },
  {
    id: 'bankroll',
    name: 'Protect your bankroll',
    blurb: 'Bet sizes that keep a losing streak from ending your run.',
    length: '0:30',
    scenes: [
      { title: 'Set a bankroll', text: 'Use money you can afford to lose. Say $1,000. That number is your whole budget, not a starting point to refill.', v: { t: 'units', bars: [{ label: 'Bankroll', pct: 100 }] } },
      { title: 'Bet in units', text: 'A unit is 1–2% of your bankroll: $10–$20. Keep every bet near one unit, even when you feel sure.', v: { t: 'units', bars: [{ label: '1 unit (1–2%)', pct: 8 }, { label: 'Bankroll', pct: 100 }] } },
      { title: 'Streaks happen', text: 'Five losses in a row at 1 unit costs about 5–10%. At 20% a bet, the same streak wipes you out.', v: { t: 'units', bars: [{ label: '5 losses at 1u', pct: 8, bad: false }, { label: '5 losses at 20%', pct: 100, bad: true }] } },
    ],
  },
]

function Scene({ v, step }: { v: Visual; step: number }) {
  if (v.t === 'odds')
    return (
      <div className="space-y-4">
        {v.rows.map((r) => (
          <div key={r.odds + r.note}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="odds-num text-[26px]">{r.odds}</span>
              <span className="hint">{r.note}</span>
            </div>
            <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-1000" style={{ width: `${r.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    )
  if (v.t === 'edge')
    return (
      <div className="space-y-4">
        {[['Price says', v.market, 'var(--faint)'], ['True chance', v.mine, 'var(--good)']].map(([l, n, c]) => (
          <div key={String(l)}>
            <div className="flex justify-between mb-1.5">
              <span className="hint">{l}</span>
              <span className="odds-num">{n}%</span>
            </div>
            <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${n}%`, background: String(c) }} />
            </div>
          </div>
        ))}
        {v.ev && <div className="card-soft text-center"><span className="odds-num text-[22px] text-[var(--good)]">{v.ev}</span><div className="hint mt-1">Your edge</div></div>}
      </div>
    )
  if (v.t === 'shop')
    return (
      <div className="grid grid-cols-2 gap-3">
        {v.rows.map((r) => (
          <div key={r.book} className={`card-soft text-center transition-all duration-500 ${r.best ? 'border-[var(--good)] bg-[rgba(61,220,151,0.08)]' : ''}`}>
            <div className="hint mb-1">{r.book}</div>
            <div className="odds-num text-[22px]">{r.line}</div>
            {r.best && <div className="pill pill-good mt-2">Best price</div>}
          </div>
        ))}
      </div>
    )
  if (v.t === 'board') {
    const pick = step >= 1 ? 'over' : null
    return (
      <div>
        <div className="hint mb-2">Sample board (generic mock, not a real app)</div>
        <div className="card-soft">
          <div className="flex items-center justify-between">
            <div><div className="font-semibold">Player A</div><div className="hint">Team X · Points</div></div>
            <div className="odds-num text-[26px]">{step >= 2 ? '27.5' : '27.5'}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {['Under', 'Over'].map((s) => (
              <div key={s} className={`text-center rounded-xl py-3 font-semibold border transition-all duration-500 ${pick && s === 'Over' ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-transparent' : 'border-[var(--border-strong)] text-zinc-300'}`}>{s}</div>
            ))}
          </div>
          {step >= 2 && <div className="mt-3 text-[13px] text-[var(--good)] font-semibold">Other site: 25.5 → Over 25.5 is the easier number</div>}
          {step >= 3 && <div className="mt-2 pill">Entry: 2 picks · both must hit</div>}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {v.bars.map((b) => (
        <div key={b.label}>
          <div className="flex justify-between mb-1.5"><span className="hint">{b.label}</span></div>
          <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${b.pct}%`, background: b.bad ? 'var(--bad)' : 'var(--cool)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

const SCENE_MS = 6000

export default function LearnPage() {
  const [id, setId] = useState(LESSONS[0].id)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const lesson = useMemo(() => LESSONS.find((l) => l.id === id)!, [id])
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    if (!playing) return
    timer.current = window.setTimeout(() => {
      if (step < lesson.scenes.length - 1) setStep(step + 1)
      else setPlaying(false)
    }, SCENE_MS)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [step, playing, lesson])

  const pick = (l: Lesson) => { setId(l.id); setStep(0); setPlaying(true) }
  const sc = lesson.scenes[step]
  const done = !playing && step === lesson.scenes.length - 1

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Learn</h2>
        <p className="hint mt-1">Five short lessons on spotting a good bet. Tap a lesson, watch it play, pause any time.</p>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="flex gap-1 p-3 pb-0">
          {lesson.scenes.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: i < step ? '100%' : i === step ? (playing ? '100%' : done ? '100%' : '40%') : '0%', transition: i === step && playing ? `width ${SCENE_MS}ms linear` : 'none' }}
              />
            </div>
          ))}
        </div>
        <div className="p-5 min-h-[300px]" key={`${id}-${step}`}>
          <h3 className="text-[22px] font-extrabold leading-tight">{sc.title}</h3>
          <p className="hint mt-2 mb-5 !text-[15px] max-w-[52ch]">{sc.text}</p>
          <Scene v={sc.v} step={step} />
        </div>
        <div className="flex items-center gap-2 p-3 border-t border-[var(--border)]">
          <button className="btn-ghost !min-h-[40px]" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous">Back</button>
          <button className="btn-primary !w-auto px-5 !min-h-[40px]" onClick={() => { if (done) { setStep(0); setPlaying(true) } else setPlaying(!playing) }}>
            {done ? 'Replay' : playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn-ghost !min-h-[40px]" onClick={() => setStep(Math.min(lesson.scenes.length - 1, step + 1))} disabled={step === lesson.scenes.length - 1} aria-label="Next">Next</button>
          <span className="hint ml-auto">{step + 1} / {lesson.scenes.length}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="section-title">All lessons</div>
        {LESSONS.map((l, i) => (
          <button key={l.id} onClick={() => pick(l)} className={`card-soft w-full text-left flex items-center gap-3 ${l.id === id ? '!border-[var(--accent)]' : ''}`}>
            <span className="odds-num w-7 h-7 rounded-lg grid place-items-center bg-zinc-800 text-[13px]">{i + 1}</span>
            <span className="flex-1">
              <span className="block font-semibold">{l.name}</span>
              <span className="hint block">{l.blurb}</span>
            </span>
            <span className="pill">{l.length}</span>
          </button>
        ))}
      </div>

      <p className="hint">Education only. No bet is guaranteed, and edges show up over many bets, not one. Bet only what you can afford to lose. If gambling stops being fun, call 1-800-GAMBLER.</p>
    </div>
  )
}
