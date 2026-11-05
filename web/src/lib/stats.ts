/**
 * Local stats, saved as one versioned JSON object so a later change can migrate it.
 */
export const STATS_KEY = 'fallingblocks-stats'
export const STATS_VERSION = 1

export interface Stats {
  bestScore: number
  bestLines: number
  bestLevel: number
  played: number
  totalLines: number
}

export const emptyStats = (): Stats => ({ bestScore: 0, bestLines: 0, bestLevel: 0, played: 0, totalLines: 0 })

const nonNegative = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)

/** Damaged or missing data reads as zero instead of breaking the page. */
export function parseStats(raw: string | null): Stats {
  try {
    const parsed = raw === null ? null : (JSON.parse(raw) as Record<string, unknown> | null)
    if (parsed && parsed.version === STATS_VERSION) {
      return {
        bestScore: nonNegative(parsed.bestScore),
        bestLines: nonNegative(parsed.bestLines),
        bestLevel: nonNegative(parsed.bestLevel),
        played: nonNegative(parsed.played),
        totalLines: nonNegative(parsed.totalLines),
      }
    }
  } catch {
    // Fall through to empty stats.
  }
  return emptyStats()
}

export function recordGame(stats: Stats, game: { score: number; lines: number; level: number }): Stats {
  return {
    bestScore: Math.max(stats.bestScore, game.score),
    bestLines: Math.max(stats.bestLines, game.lines),
    bestLevel: Math.max(stats.bestLevel, game.level),
    played: stats.played + 1,
    totalLines: stats.totalLines + game.lines,
  }
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
