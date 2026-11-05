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

export const SCORE_TABLE = [0, 100, 300, 500, 800]

export const levelOf = (lines: number) => Math.floor(lines / 10) + 1

export interface GameState {
  board: Board
  type: number
  rot: number
  pos: { row: number; col: number }
  score: number
  lines: number
  gameOver: boolean
  paused: boolean
}

export const shapeOf = (s: Pick<GameState, 'type' | 'rot'>) => SHAPES[s.type][s.rot]

/** Where a piece of this type enters: centred, with its top filled row on row 0. */
export function spawnPos(type: number): { row: number; col: number } {
  const shape = SHAPES[type][0]
  return { row: 0 - shape.findIndex(r => r.some(Boolean)), col: Math.floor((COLS - shape.length) / 2) }
}

export const randomType = (rng: () => number = Math.random) => Math.floor(rng() * PIECE_COUNT)

export function initState(rng: () => number = Math.random): GameState {
  const type = randomType(rng)
  return { board: emptyBoard(), type, rot: 0, pos: spawnPos(type), score: 0, lines: 0, gameOver: false, paused: false }
}

const active = (s: GameState) => !s.gameOver && !s.paused

export function move(s: GameState, dc: number): GameState {
  if (!active(s) || collides(s.board, shapeOf(s), s.pos.row, s.pos.col + dc)) return s
  return { ...s, pos: { ...s.pos, col: s.pos.col + dc } }
}

export function rotate(s: GameState): GameState {
  if (!active(s)) return s
  const rot = (s.rot + 1) % 4
  if (collides(s.board, SHAPES[s.type][rot], s.pos.row, s.pos.col)) return s
  return { ...s, rot }
}

/** Fix the piece in place, clear lines and bring in the next piece. */
export function lock(s: GameState, rng: () => number = Math.random): GameState {
  const merged = merge(s.board, shapeOf(s), s.pos.row, s.pos.col, COLORS[s.type])
  const { board, cleared } = clearLines(merged.board)
  const scored = { ...s, board, score: s.score + SCORE_TABLE[cleared], lines: s.lines + cleared }
  const type = randomType(rng)
  const pos = spawnPos(type)
  if (merged.above || collides(board, SHAPES[type][0], pos.row, pos.col)) return { ...scored, gameOver: true }
  return { ...scored, type, rot: 0, pos }
}

/** One row down, checked against this state; lock when it can't fall. */
export function step(s: GameState, rng: () => number = Math.random): GameState {
  if (!active(s)) return s
  if (collides(s.board, shapeOf(s), s.pos.row + 1, s.pos.col)) return lock(s, rng)
  return { ...s, pos: { ...s.pos, row: s.pos.row + 1 } }
}

export function dropRow(s: Pick<GameState, 'board' | 'type' | 'rot' | 'pos'>): number {
  let r = s.pos.row
  while (!collides(s.board, shapeOf(s), r + 1, s.pos.col)) r++
  return r
}

export function hardDrop(s: GameState, rng: () => number = Math.random): GameState {
  if (!active(s)) return s
  return lock({ ...s, pos: { ...s.pos, row: dropRow(s) } }, rng)
}
