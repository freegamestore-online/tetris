import { describe, it, expect } from 'vitest'
import {
  COLS, ROWS, SHAPES, LOCK_DELAY, MAX_LOCK_RESETS, PIECE_COUNT, type GameState,
  advance, bag, clearLines, collides, emptyBoard, gravityMs, hardDrop, holdPiece, initState, lock, merge, move, rotate,
  shapeOf, softDrop, spawnPos,
} from './game'

const I = 0, O = 1, T = 2, J = 3

/** Advance in frame-sized steps, as the game loop does. */
function run(s: GameState, ms: number): GameState {
  for (let t = 0; t < ms; t += 16) s = advance(s, 16, () => 0)
  return s
}

/** Absolute board cells a piece covers. */
function cells(s: Pick<GameState, 'type' | 'rot' | 'pos'>): string[] {
  const out: string[] = []
  shapeOf(s).forEach((row, r) => {
    row.forEach((v, c) => { if (v) out.push(`${s.pos.row + r},${s.pos.col + c}`) })
  })
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

describe('wall kicks', () => {
  it('kicks a piece off the left wall instead of refusing to turn', () => {
    // T turned once (stem right), box hanging off the left wall: the next turn needs a kick.
    let s = stateWith(T, { row: 5, col: -1 }, 1)
    expect(collides(s.board, shapeOf(s), s.pos.row, s.pos.col)).toBe(false)
    expect(collides(s.board, SHAPES[T][2], s.pos.row, s.pos.col)).toBe(true)
    s = rotate(s, 1)
    expect(s.rot).toBe(2)
    expect(s.pos.col).toBe(0)
  })

  it('kicks the bar off the right wall', () => {
    // Bar standing upright in its right-hand column, against the right wall.
    let s = stateWith(I, { row: 5, col: COLS - 3 }, 1)
    expect(collides(s.board, shapeOf(s), s.pos.row, s.pos.col)).toBe(false)
    s = rotate(s, 1)
    expect(s.rot).toBe(2)
    expect(collides(s.board, shapeOf(s), s.pos.row, s.pos.col)).toBe(false)
    expect(cells(s).every(k => Number(k.split(',')[1]) < COLS)).toBe(true)
  })

  it('turns anticlockwise too, and back again to the same cells', () => {
    const s = stateWith(J, { row: 5, col: 3 })
    expect(rotate(s, -1).rot).toBe(3)
    expect(cells(rotate(rotate(s, -1), 1))).toEqual(cells(s))
  })

  it('kicks up off the floor (a flat bar standing up on the bottom row)', () => {
    let s = stateWith(I, { row: ROWS - 2, col: 3 }) // lying on the floor
    expect(collides(s.board, SHAPES[I][1], s.pos.row, s.pos.col)).toBe(true)
    s = rotate(s, 1)
    expect(s.rot).toBe(1)
    expect(s.pos.row).toBe(ROWS - 4)
    expect(collides(s.board, shapeOf(s), s.pos.row, s.pos.col)).toBe(false)
  })

  it('refuses a turn when every kick is blocked', () => {
    const board = emptyBoard().map(() => Array(COLS).fill('#000'))
    for (let c = 3; c < 7; c++) board[5][c] = null
    const s = { ...stateWith(I, { row: 4, col: 3 }), board }
    expect(rotate(s, 1)).toBe(s)
  })
})

describe('7-bag', () => {
  it('every bag holds each piece exactly once', () => {
    let seed = 1
    const rng = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let n = 0; n < 50; n++) expect([...bag(rng)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('deals pieces so any 7 in a row from a bag boundary are all different', () => {
    let s = initState(Math.random)
    const dealt = [s.type]
    for (let i = 0; i < PIECE_COUNT * 4 - 1; i++) {
      s = hardDrop({ ...s, board: emptyBoard() })
      dealt.push(s.type)
    }
    for (let b = 0; b < dealt.length; b += PIECE_COUNT) expect(new Set(dealt.slice(b, b + PIECE_COUNT)).size).toBe(PIECE_COUNT)
  })

  it('keeps at least a bag of pieces queued for the preview', () => {
    const s = initState()
    expect(s.queue.length).toBeGreaterThanOrEqual(PIECE_COUNT)
  })
})

describe('gravity and soft drop', () => {
  it('soft drop re-checks collision on the state it is applied to, so repeated drops never pass the floor', () => {
    let s = stateWith(I, { row: ROWS - 3, col: 3 })
    s = softDrop(s)
    expect(s.pos.row).toBe(ROWS - 2) // resting on the floor
    expect(softDrop(softDrop(s))).toBe(s) // more drops in the same frame do nothing
  })

  it('never moves a piece into blocks', () => {
    const board = emptyBoard()
    board[10] = Array(COLS).fill('#000')
    let s: GameState = { ...stateWith(T, { row: 0, col: 3 }), board }
    for (let i = 0; i < 20; i++) {
      s = softDrop(s)
      expect(collides(s.board, shapeOf(s), s.pos.row, s.pos.col)).toBe(false)
    }
    expect(s.pos.row).toBe(8)
  })

  it('soft drop scores a point a row, hard drop two', () => {
    const s = stateWith(O, { row: 0, col: 4 })
    expect(softDrop(s).score).toBe(1)
    expect(hardDrop(s, () => 0).score).toBe((ROWS - 2) * 2)
  })

  it('gets faster with level', () => {
    expect(gravityMs(1)).toBe(1000)
    for (let l = 1; l < 20; l++) expect(gravityMs(l + 1)).toBeLessThan(gravityMs(l))
    expect(gravityMs(25)).toBe(gravityMs(20))
  })

  it('falls one row per gravity interval at level 1', () => {
    const s = stateWith(T, { row: 0, col: 3 })
    expect(advance(s, 999).pos.row).toBe(0)
    expect(advance(s, 1000).pos.row).toBe(1)
    expect(advance(advance(s, 600), 600).pos.row).toBe(1)
  })
})

describe('lock delay', () => {
  const onFloor = () => stateWith(T, { row: ROWS - 2, col: 3 })

  it('waits before locking a piece that has landed', () => {
    const s = run(onFloor(), LOCK_DELAY - 50)
    expect(s.type).toBe(T)
    expect(s.board[ROWS - 1].every(c => c === null)).toBe(true)
    const locked = run(s, 100)
    expect(locked.board[ROWS - 1].slice(3, 6).every(Boolean)).toBe(true)
  })

  it('moving on the stack restarts the wait', () => {
    let s = run(onFloor(), LOCK_DELAY - 50)
    s = move(s, 1)
    s = run(s, LOCK_DELAY - 50)
    expect(s.board[ROWS - 1].every(c => c === null)).toBe(true)
  })

  it('stops restarting the wait after the reset limit', () => {
    let s = onFloor()
    for (let i = 0; i < MAX_LOCK_RESETS; i++) s = move(s, i % 2 ? 1 : -1)
    expect(s.lockResets).toBe(MAX_LOCK_RESETS)
    s = run(s, LOCK_DELAY - 100)
    s = move(s, 1)
    s = run(s, 150)
    expect(s.board[ROWS - 1].some(Boolean)).toBe(true)
  })

  it('soft drop on the stack does not lock early', () => {
    const s = onFloor()
    expect(softDrop(s)).toBe(s)
  })
})

describe('hold', () => {
  it('first hold takes the next piece; the second swaps back', () => {
    let s = initState(() => 0)
    const first = s.type, next = s.queue[0]
    s = holdPiece(s)
    expect(s.hold).toBe(first)
    expect(s.type).toBe(next)
    expect(holdPiece(s)).toBe(s) // once per piece
    s = hardDrop({ ...s, board: emptyBoard() }, () => 0)
    const now = s.type
    s = holdPiece(s)
    expect(s.type).toBe(first)
    expect(s.hold).toBe(now)
    expect(s.pos).toEqual(spawnPos(first))
  })
})

describe('line-clear scoring', () => {
  /** A board whose bottom `n` rows are full except the bar's column 0. */
  function wellBoard(n: number) {
    const board = emptyBoard()
    for (let r = ROWS - n; r < ROWS; r++) board[r] = [null, ...Array(COLS - 1).fill('#000')]
    return board
  }

  it.each([[1, 100], [2, 300], [3, 500], [4, 800]])('%i lines score %i at level 1', (n, points) => {
    // Upright bar in column 0, its bottom on the last row.
    const s = lock({ ...stateWith(I, { row: ROWS - 4, col: -2 }, 1), board: wellBoard(n) }, () => 0)
    expect(s.lines).toBe(n)
    expect(s.score).toBe(points)
  })

  it('multiplies by the level', () => {
    const s = lock({ ...stateWith(I, { row: ROWS - 4, col: -2 }, 1), board: wellBoard(4), lines: 20 }, () => 0)
    expect(s.score).toBe(800 * 3)
  })
})

describe('locking', () => {
  it('scores a cleared line and spawns the next piece', () => {
    const board = emptyBoard()
    board[ROWS - 1] = Array(COLS).fill('#000')
    for (let c = 3; c < 7; c++) board[ROWS - 1][c] = null
    const s = hardDrop({ ...stateWith(I, { row: 0, col: 3 }), board }, () => 0)
    expect(s.lines).toBe(1)
    expect(s.score).toBe(100 + (ROWS - 2) * 2)
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
