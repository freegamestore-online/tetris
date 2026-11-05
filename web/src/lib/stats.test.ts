import { describe, it, expect } from 'vitest'
import { STATS_VERSION, emptyStats, parseStats, recordGame } from './stats'

describe('stats', () => {
  it('reads missing or damaged data as zero', () => {
    expect(parseStats(null).bestScore).toBe(0)
    expect(parseStats('not json').bestScore).toBe(0)
    expect(parseStats('null').bestScore).toBe(0)
    expect(parseStats(JSON.stringify({ version: STATS_VERSION, bestScore: -5 })).bestScore).toBe(0)
  })

  it('round-trips a saved best score', () => {
    expect(parseStats(JSON.stringify({ version: STATS_VERSION, bestScore: 1200 })).bestScore).toBe(1200)
  })

  it('records a game: bests kept, totals added', () => {
    let s = recordGame(emptyStats(), { score: 900, lines: 12, level: 2 })
    s = recordGame(s, { score: 300, lines: 20, level: 3 })
    expect(s).toEqual({ bestScore: 900, bestLines: 20, bestLevel: 3, played: 2, totalLines: 32 })
  })

  it('round-trips every field', () => {
    const s = { bestScore: 1, bestLines: 2, bestLevel: 3, played: 4, totalLines: 5 }
    expect(parseStats(JSON.stringify({ version: STATS_VERSION, ...s }))).toEqual(s)
  })
})
