/**
 * Pure game rules. Every action takes a state and returns the next one (or the same
 * object when nothing changed), so the UI can apply actions one after another
 * without reading stale state.
 */
export const COLS = 10
export const ROWS = 20

export type Cell = string | null
export type Board = Cell[][]
export type Shape = number[][]

// Original FreeGameStore palette — built from the brand accent (#10b981 / #2563eb)
// and neutral-friendly hues. Deliberately not the classic guideline colour set.
// Each shape sits in a square box so it turns about the box centre instead of drifting.
const BASE: { shape: Shape; color: string }[] = [
  { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#2563eb' },
  { shape: [[1,1],[1,1]], color: '#f59e0b' },
  { shape: [[0,1,0],[1,1,1],[0,0,0]], color: '#8b5cf6' },
  { shape: [[1,0,0],[1,1,1],[0,0,0]], color: '#10b981' },
  { shape: [[0,0,1],[1,1,1],[0,0,0]], color: '#ec4899' },
  { shape: [[0,1,1],[1,1,0],[0,0,0]], color: '#0d9488' },
  { shape: [[1,1,0],[0,1,1],[0,0,0]], color: '#64748b' },
]

/** Turn a square shape a quarter turn clockwise inside its own box. */
export function rotateCW(shape: Shape): Shape {
  const n = shape.length
  return shape.map((_, r) => shape.map((_, c) => shape[n - 1 - c][r]))
}

export const PIECE_COUNT = BASE.length
export const COLORS = BASE.map(p => p.color)
/** SHAPES[type][rot], rot 0..3 clockwise from spawn. */
export const SHAPES: Shape[][] = BASE.map(({ shape }) => {
  const rots = [shape]
  for (let i = 1; i < 4; i++) rots.push(rotateCW(rots[i - 1]))
  return rots
})

export const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array(COLS).fill(null))

/** Rows above the board (negative) are open, so pieces can spawn and turn there. */
export function collides(board: Board, shape: Shape, row: number, col: number): boolean {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        const nr = row + r, nc = col + c
        if (nr >= ROWS || nc < 0 || nc >= COLS) return true
        if (nr >= 0 && board[nr][nc]) return true
      }
  return false
}

/** Write a piece into the board. `above` is true when part of it sits above row 0. */
export function merge(board: Board, shape: Shape, row: number, col: number, color: string): { board: Board; above: boolean } {
  const b = board.map(r => [...r])
  let above = false
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        if (row + r < 0) above = true
        else b[row + r][col + c] = color
      }
  return { board: b, above }
}

export function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter(row => row.some(cell => !cell))
  const cleared = ROWS - kept.length
  const empty: Board = Array.from({ length: cleared }, () => Array(COLS).fill(null))
  return { board: [...empty, ...kept], cleared }
}

/** Line-clear points at level 1; multiplied by the level. */
export const SCORE_TABLE = [0, 100, 300, 500, 800]
export const SOFT_DROP_POINTS = 1
export const HARD_DROP_POINTS = 2

export const levelOf = (lines: number) => Math.floor(lines / 10) + 1

/** Milliseconds per row at a level: the usual modern curve, flat from level 20. */
export function gravityMs(level: number): number {
  const l = Math.min(level, 20) - 1
  return (0.8 - l * 0.007) ** l * 1000
}

/** How long a piece may rest on the stack before it locks, and how often moving restarts that wait. */
export const LOCK_DELAY = 500
export const MAX_LOCK_RESETS = 15
export const PREVIEW = 3

// Wall kicks, as (col, row) offsets with row growing downwards, tried in order.
// Keyed by "from>to" rotation. One table for the 3-wide pieces, one for the bar.
type Kicks = Record<string, [number, number][]>
const KICKS_3: Kicks = {
  '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
}
const KICKS_BAR: Kicks = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
}
const BAR = 0, SQUARE = 1

export interface GameState {
  board: Board
  type: number
  rot: number
  pos: { row: number; col: number }
  /** Upcoming pieces, always at least one bag long. */
  queue: number[]
  hold: number | null
  /** False once hold has been used for the current piece. */
  canHold: boolean
  score: number
  lines: number
  gameOver: boolean
  paused: boolean
  /** Time gathered towards the next gravity row. */
  fallMs: number
  /** Time the piece has rested on the stack. */
  lockMs: number
  lockResets: number
  /** Deepest row this piece has reached; going deeper gives back the lock resets. */
  lowest: number
}

/** Fields that only drive timing; a change to them alone needs no redraw. */
export const TIMING_FIELDS = new Set<keyof GameState>(['fallMs', 'lockMs', 'lockResets', 'lowest'])

export const shapeOf = (s: Pick<GameState, 'type' | 'rot'>) => SHAPES[s.type][s.rot]

/** Where a piece of this type enters: centred, with its top filled row on row 0. */
export function spawnPos(type: number): { row: number; col: number } {
  const shape = SHAPES[type][0]
  return { row: 0 - shape.findIndex(r => r.some(Boolean)), col: Math.floor((COLS - shape.length) / 2) }
}

/** One of each piece, shuffled. */
export function bag(rng: () => number = Math.random): number[] {
  const b = Array.from({ length: PIECE_COUNT }, (_, i) => i)
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

function fillQueue(queue: number[], rng: () => number): number[] {
  return queue.length >= PIECE_COUNT ? queue : [...queue, ...bag(rng)]
}

/** Put a piece of `type` at the top; the game ends if it has no room. */
function spawn(s: GameState, type: number): GameState {
  const pos = spawnPos(type)
  const next = { ...s, type, rot: 0, pos, fallMs: 0, lockMs: 0, lockResets: 0, lowest: pos.row }
  return collides(s.board, SHAPES[type][0], pos.row, pos.col) ? { ...next, gameOver: true } : next
}

function spawnNext(s: GameState, rng: () => number): GameState {
  const [type, ...rest] = s.queue
  return spawn({ ...s, queue: fillQueue(rest, rng) }, type)
}

export function initState(rng: () => number = Math.random): GameState {
  const empty: GameState = {
    board: emptyBoard(), type: 0, rot: 0, pos: { row: 0, col: 0 }, queue: fillQueue([], rng), hold: null, canHold: true,
    score: 0, lines: 0, gameOver: false, paused: false, fallMs: 0, lockMs: 0, lockResets: 0, lowest: 0,
  }
  return spawnNext(empty, rng)
}

const active = (s: GameState) => !s.gameOver && !s.paused

export const grounded = (s: GameState) => collides(s.board, shapeOf(s), s.pos.row + 1, s.pos.col)

/** A move or turn that worked: while resting on the stack it restarts the lock wait, up to a limit. */
function shifted(before: GameState, after: GameState): GameState {
  if (!grounded(before) || before.lockResets >= MAX_LOCK_RESETS) return after
  return { ...after, lockMs: 0, lockResets: before.lockResets + 1 }
}

export function move(s: GameState, dc: number): GameState {
  if (!active(s) || collides(s.board, shapeOf(s), s.pos.row, s.pos.col + dc)) return s
  return shifted(s, { ...s, pos: { ...s.pos, col: s.pos.col + dc } })
}

/** Turn clockwise (dir 1) or anticlockwise (dir -1), trying wall kicks in order. */
export function rotate(s: GameState, dir: 1 | -1 = 1): GameState {
  if (!active(s)) return s
  const rot = (s.rot + dir + 4) % 4
  const kicks = s.type === SQUARE ? [[0, 0]] : (s.type === BAR ? KICKS_BAR : KICKS_3)[`${s.rot}>${rot}`]
  for (const [dc, dr] of kicks) {
    const pos = { row: s.pos.row + dr, col: s.pos.col + dc }
    if (!collides(s.board, SHAPES[s.type][rot], pos.row, pos.col)) {
      const turned = shifted(s, { ...s, rot, pos })
      return pos.row > s.lowest ? { ...turned, lowest: pos.row, lockResets: 0 } : turned
    }
  }
  return s
}

/** Fix the piece in place, clear lines and bring in the next piece. */
export function lock(s: GameState, rng: () => number = Math.random): GameState {
  const merged = merge(s.board, shapeOf(s), s.pos.row, s.pos.col, COLORS[s.type])
  const { board, cleared } = clearLines(merged.board)
  const scored = {
    ...s, board, canHold: true,
    score: s.score + SCORE_TABLE[cleared] * levelOf(s.lines),
    lines: s.lines + cleared,
  }
  if (merged.above) return { ...scored, gameOver: true }
  return spawnNext(scored, rng)
}

/** One row down if there is room, checked against this state. */
function descend(s: GameState): GameState {
  const row = s.pos.row + 1
  return { ...s, pos: { ...s.pos, row }, fallMs: 0, lockMs: 0, ...(row > s.lowest ? { lowest: row, lockResets: 0 } : {}) }
}

/** Player soft drop: one row down for a point. On the stack it does nothing; lock delay decides. */
export function softDrop(s: GameState): GameState {
  if (!active(s) || grounded(s)) return s
  return { ...descend(s), score: s.score + SOFT_DROP_POINTS }
}

export function dropRow(s: Pick<GameState, 'board' | 'type' | 'rot' | 'pos'>): number {
  let r = s.pos.row
  while (!collides(s.board, shapeOf(s), r + 1, s.pos.col)) r++
  return r
}

export function hardDrop(s: GameState, rng: () => number = Math.random): GameState {
  if (!active(s)) return s
  const row = dropRow(s)
  return lock({ ...s, pos: { ...s.pos, row }, score: s.score + (row - s.pos.row) * HARD_DROP_POINTS }, rng)
}

/** Swap the piece for the held one (or the next one), once per piece. */
export function holdPiece(s: GameState, rng: () => number = Math.random): GameState {
  if (!active(s) || !s.canHold) return s
  const held = { ...s, hold: s.type, canHold: false }
  return s.hold === null ? spawnNext(held, rng) : spawn(held, s.hold)
}

/** Run gravity and lock delay for `dt` milliseconds. */
export function advance(s: GameState, dt: number, rng: () => number = Math.random): GameState {
  if (!active(s)) return s
  const interval = gravityMs(levelOf(s.lines))
  let next = s
  let fall = s.fallMs + dt
  while (fall >= interval && !grounded(next)) {
    next = descend(next)
    fall -= interval
  }
  if (!grounded(next)) return { ...next, fallMs: fall }
  const lockMs = next.lockMs + dt
  if (lockMs >= LOCK_DELAY) return lock(next, rng)
  return { ...next, fallMs: 0, lockMs }
}
