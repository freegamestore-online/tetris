import { describe, it, expect } from 'vitest'
import {
  COLS, ROWS, SHAPES, type GameState, clearLines, collides, emptyBoard, hardDrop, initState, merge, rotate, shapeOf, spawnPos, step,
} from './game'

const I = 0, O = 1, T = 2

/** Absolute board cells a piece covers. */
function cells(s: Pick<GameState, 'type' | 'rot' | 'pos'>): string[] {
  const out: string[] = []
  shapeOf(s).forEach((row, r) => row.forEach((v, c) => { if (v) out.push(`${s.pos.row + r},${s.pos.col + c}`) }))
  return out.sort()
}

function stateWith(type: number, pos: { row: number; col: number }, rot = 0): GameState {
  return { ...initState(() => 0), type, rot, pos }
}

describe('rotation', () => {
  it('turns every piece about a fixed centre: four turns give the same cells', () => {
    for (let type = 0; type < SHAPES.length; type++) {
      let s = stateWith(type, { row: 5, col: 3 })
      const start = cells(s)
      for (let i = 0; i < 4; i++) s = rotate(s)
      expect(s.rot).toBe(0)
      expect(cells(s)).toEqual(start)
    }
  })

  it('does not drift: the box centre stays put while the piece turns', () => {
    for (let type = 0; type < SHAPES.length; type++) {
      let s = stateWith(type, { row: 5, col: 3 })
      const centre = (st: GameState) => {
        const cs = cells(st).map(k => k.split(',').map(Number))
        return [cs.reduce((a, [r]) => a + r, 0) / cs.length, cs.reduce((a, [, c]) => a + c, 0) / cs.length]
      }
      const box = SHAPES[type][0].length
      for (let i = 0; i < 4; i++) {
        s = rotate(s)
        const [r, c] = centre(s)
        // Each orientation's centre of mass stays within one cell of the box centre.
        expect(Math.abs(r - (5 + (box - 1) / 2))).toBeLessThanOrEqual(1)
        expect(Math.abs(c - (3 + (box - 1) / 2))).toBeLessThanOrEqual(1)
      }
    }
  })

  it('the O piece never moves when turned', () => {
    const s = stateWith(O, { row: 5, col: 4 })
    expect(cells(rotate(s))).toEqual(cells(s))
  })
})

describe('step (gravity / soft drop)', () => {
  it('re-checks collision on the state it is applied to, so stacked drops never pass the floor', () => {
    // An I bar lying flat, one row above the floor.
    let s = stateWith(I, { row: ROWS - 3, col: 3 })
    expect(collides(s.board, shapeOf(s), s.pos.row + 1, s.pos.col)).toBe(false)
    s = step(s, () => 0)
    expect(s.pos.row).toBe(ROWS - 2) // resting on the floor
    const locked = step(s, () => 0) // a second drop in the same frame
    expect(locked.board[ROWS - 1].slice(3, 7).every(Boolean)).toBe(true)
    expect(locked.board.length).toBe(ROWS)
  })

  it('never moves a piece into blocks', () => {
    const board = emptyBoard()
    board[10] = Array(COLS).fill('#000')
    board[10][0] = null
    let s: GameState = { ...stateWith(T, { row: 7, col: 3 }), board }
    for (let i = 0; i < 5; i++) {
      s = step(s, () => 0)
      if (s.type === T && s.pos.col === 3) expect(collides(s.board, shapeOf(s), s.pos.row, s.pos.col)).toBe(false)
    }
    expect(s.board[9].slice(3, 6).every(Boolean)).toBe(true)
  })
})

describe('locking', () => {
  it('scores a cleared line and spawns the next piece', () => {
    const board = emptyBoard()
    board[ROWS - 1] = Array(COLS).fill('#000')
    for (let c = 3; c < 7; c++) board[ROWS - 1][c] = null
    const s = hardDrop({ ...stateWith(I, { row: 0, col: 3 }), board }, () => 0)
    expect(s.lines).toBe(1)
    expect(s.score).toBe(100)
    expect(s.board[ROWS - 1].every(c => c === null)).toBe(true)
    expect(s.pos).toEqual(spawnPos(s.type))
  })

  it('ends the game when the next piece cannot enter', () => {
    const board = emptyBoard()
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (c !== 0) board[r][c] = '#000'
    const s = hardDrop({ ...stateWith(O, { row: -1, col: 0 }), board }, () => 0)
    expect(s.gameOver).toBe(true)
  })

  it('merge skips cells above the board and reports them', () => {
    const { board, above } = merge(emptyBoard(), SHAPES[I][1], -2, 0, '#fff')
    expect(above).toBe(true)
    expect(board[0][2]).toBe('#fff')
    expect(board[1][2]).toBe('#fff')
  })

  it('clearLines drops rows above a cleared one', () => {
    const board = emptyBoard()
    board[ROWS - 1] = Array(COLS).fill('#000')
    board[ROWS - 2][0] = '#abc'
    const { board: b, cleared } = clearLines(board)
    expect(cleared).toBe(1)
    expect(b[ROWS - 1][0]).toBe('#abc')
  })
})

describe('spawn', () => {
  it('puts the top filled row on row 0, centred', () => {
    expect(spawnPos(I)).toEqual({ row: -1, col: 3 })
    expect(spawnPos(O)).toEqual({ row: 0, col: 4 })
    expect(spawnPos(T)).toEqual({ row: 0, col: 3 })
  })
})
