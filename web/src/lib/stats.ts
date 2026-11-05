/**
 * Local stats, saved as one versioned JSON object so a later change can migrate it.
 */
export const STATS_KEY = 'fallingblocks-stats'
export const STATS_VERSION = 1

export interface Stats {
  bestScore: number
}

const nonNegative = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

/** Damaged or missing data reads as zero instead of breaking the page. */
export function parseStats(raw: string | null): Stats {
  try {
    const parsed = raw === null ? null : (JSON.parse(raw) as Record<string, unknown> | null)
    if (parsed && parsed.version === STATS_VERSION) return { bestScore: nonNegative(parsed.bestScore) }
  } catch {
    // Fall through to empty stats.
  }
  return { bestScore: 0 }
}

export function recordGame(stats: Stats, score: number): Stats {
  return { ...stats, bestScore: Math.max(stats.bestScore, score) }
}

export function loadStats(): Stats {
  try {
    return parseStats(localStorage.getItem(STATS_KEY))
  } catch {
    return parseStats(null)
  }
}

export function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify({ version: STATS_VERSION, ...stats }))
  } catch {
    // Storage blocked or full: stats just aren't kept.
  }
}
