// Win chance from sportsbook prices (client-side copy of api/_odds.js, kept small).

function prob(odds: number) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)
}

export type WinChance = {
  home: number
  away: number
  books: number
  bestHome: { price: number; book: string }
  bestAway: { price: number; book: string }
}

/** Average of each book's "no-vig" win chance (the sportsbook's cut removed). */
export function winChance(books: Record<string, any> | undefined): WinChance | null {
  const rows = Object.values(books || {}).filter(
    (b: any) => b && typeof b.ml_home === 'number' && typeof b.ml_away === 'number'
  ) as any[]
  if (!rows.length) return null
  let h = 0
  let a = 0
  let bestHome = { price: -Infinity, book: '' }
  let bestAway = { price: -Infinity, book: '' }
  for (const b of rows) {
    const ph = prob(b.ml_home)
    const pa = prob(b.ml_away)
    h += ph / (ph + pa)
    a += pa / (ph + pa)
    if (b.ml_home > bestHome.price) bestHome = { price: b.ml_home, book: b.title || 'Book' }
    if (b.ml_away > bestAway.price) bestAway = { price: b.ml_away, book: b.title || 'Book' }
  }
  return { home: h / rows.length, away: a / rows.length, books: rows.length, bestHome, bestAway }
}

export const price = (n: number) => (n > 0 ? `+${n}` : `${n}`)

export function spreadText(team: string, spread: number | null | undefined) {
  if (spread == null) return '—'
  const s = spread > 0 ? `+${spread}` : `${spread}`
  return `${team.split(' ').pop()} ${s}`
}
