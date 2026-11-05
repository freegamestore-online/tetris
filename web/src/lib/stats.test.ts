import { describe, it, expect } from 'vitest'
import { STATS_VERSION, parseStats, recordGame } from './stats'

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

  it('keeps the higher score', () => {
    expect(recordGame({ bestScore: 500 }, 300).bestScore).toBe(500)
    expect(recordGame({ bestScore: 500 }, 900).bestScore).toBe(900)
  })
})
