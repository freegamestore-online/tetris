import { useState, useEffect, useCallback, useRef } from 'react'
import { Shell } from './components/Shell'

const COLS = 10
const ROWS = 20
const BASE_TICK = 500

const PIECES = [
  { shape: [[1,1,1,1]], color: '#00bcd4' },
  { shape: [[1,1],[1,1]], color: '#ffc107' },
  { shape: [[0,1,0],[1,1,1]], color: '#9c27b0' },
  { shape: [[1,0,0],[1,1,1]], color: '#2196f3' },
  { shape: [[0,0,1],[1,1,1]], color: '#ff9800' },
  { shape: [[0,1,1],[1,1,0]], color: '#4caf50' },
  { shape: [[1,1,0],[0,1,1]], color: '#f44336' },
]

type Cell = string | null
type Board = Cell[][]

const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array(COLS).fill(null))
const randomPiece = () => PIECES[Math.floor(Math.random() * PIECES.length)]

function rotate(shape: number[][]): number[][] {
  const rows = shape.length, cols = shape[0].length
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (_, r) => shape[rows - 1 - r][c])
  )
}

function collides(board: Board, shape: number[][], row: number, col: number): boolean {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        const nr = row + r, nc = col + c
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc]) return true
      }
  return false
}

function merge(board: Board, shape: number[][], row: number, col: number, color: string): Board {
  const b = board.map(r => [...r])
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) b[row + r][col + c] = color
  return b
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const kept = board.filter(row => row.some(cell => !cell))
  const cleared = ROWS - kept.length
  const empty: Board = Array.from({ length: cleared }, () => Array(COLS).fill(null))
  return { board: [...empty, ...kept], cleared }
}

const SCORE_TABLE = [0, 100, 300, 500, 800]

interface GameState {
  board: Board
  piece: typeof PIECES[0]
  shape: number[][]
  pos: { row: number; col: number }
  score: number
  lines: number
  gameOver: boolean
  paused: boolean
}

function initState(): GameState {
  const p = randomPiece()
  return {
    board: emptyBoard(),
    piece: p,
    shape: p.shape,
    pos: { row: 0, col: Math.floor((COLS - p.shape[0].length) / 2) },
    score: 0,
    lines: 0,
    gameOver: false,
    paused: false,
  }
}

export default function App() {
  const [state, setState] = useState<GameState>(initState)
  const stateRef = useRef(state)
  stateRef.current = state

  const spawnPiece = useCallback((board: Board): Partial<GameState> | null => {
    const p = randomPiece()
    const col = Math.floor((COLS - p.shape[0].length) / 2)
    if (collides(board, p.shape, 0, col)) return null
    return { piece: p, shape: p.shape, pos: { row: 0, col } }
  }, [])

  const lockAndSpawn = useCallback(() => {
    setState(s => {
      const merged = merge(s.board, s.shape, s.pos.row, s.pos.col, s.piece.color)
      const { board, cleared } = clearLines(merged)
      const spawn = spawnPiece(board)
      if (!spawn) return { ...s, board, score: s.score + (SCORE_TABLE[cleared] ?? 0), lines: s.lines + cleared, gameOver: true }
      return { ...s, board, score: s.score + (SCORE_TABLE[cleared] ?? 0), lines: s.lines + cleared, ...spawn }
    })
  }, [spawnPiece])

  const tick = useCallback(() => {
    const s = stateRef.current
    if (s.gameOver || s.paused) return
    if (!collides(s.board, s.shape, s.pos.row + 1, s.pos.col)) {
      setState(prev => ({ ...prev, pos: { ...prev.pos, row: prev.pos.row + 1 } }))
    } else {
      lockAndSpawn()
    }
  }, [lockAndSpawn])

  const move = useCallback((dc: number) => {
    setState(s => {
      if (s.gameOver || s.paused) return s
      if (!collides(s.board, s.shape, s.pos.row, s.pos.col + dc))
        return { ...s, pos: { ...s.pos, col: s.pos.col + dc } }
      return s
    })
  }, [])

  const rotatePiece = useCallback(() => {
    setState(s => {
      if (s.gameOver || s.paused) return s
      const rotated = rotate(s.shape)
      if (!collides(s.board, rotated, s.pos.row, s.pos.col))
        return { ...s, shape: rotated }
      return s
    })
  }, [])

  const hardDrop = useCallback(() => {
    setState(s => {
      if (s.gameOver || s.paused) return s
      let r = s.pos.row
      while (!collides(s.board, s.shape, r + 1, s.pos.col)) r++
      const merged = merge(s.board, s.shape, r, s.pos.col, s.piece.color)
      const { board, cleared } = clearLines(merged)
      const spawn = spawnPiece(board)
      if (!spawn) return { ...s, board, pos: { ...s.pos, row: r }, score: s.score + (SCORE_TABLE[cleared] ?? 0), lines: s.lines + cleared, gameOver: true }
      return { ...s, board, score: s.score + (SCORE_TABLE[cleared] ?? 0), lines: s.lines + cleared, ...spawn }
    })
  }, [spawnPiece])

  // Game loop
  useEffect(() => {
    if (state.gameOver || state.paused) return
    const speed = Math.max(100, BASE_TICK - state.lines * 15)
    const id = setInterval(tick, speed)
    return () => clearInterval(id)
  }, [tick, state.gameOver, state.paused, state.lines])

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(e.key)) e.preventDefault()
      switch (e.key) {
        case 'ArrowLeft': move(-1); break
        case 'ArrowRight': move(1); break
        case 'ArrowDown': tick(); break
        case 'ArrowUp': rotatePiece(); break
        case ' ': hardDrop(); break
        case 'p': case 'P': setState(s => ({ ...s, paused: !s.paused })); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [move, tick, rotatePiece, hardDrop])

  // Render
  const display = state.board.map(r => [...r])
  for (let r = 0; r < state.shape.length; r++)
    for (let c = 0; c < (state.shape[r]?.length ?? 0); c++)
      if (state.shape[r]?.[c] && state.pos.row + r >= 0 && display[state.pos.row + r])
        display[state.pos.row + r]![state.pos.col + c] = state.piece.color

  return (
    <Shell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="flex gap-6 text-center">
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Score</div>
            <div className="display-font text-2xl font-bold" style={{ color: 'var(--ink)' }}>{state.score}</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Lines</div>
            <div className="display-font text-2xl font-bold" style={{ color: 'var(--ink)' }}>{state.lines}</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Level</div>
            <div className="display-font text-2xl font-bold" style={{ color: 'var(--ink)' }}>{Math.floor(state.lines / 10) + 1}</div>
          </div>
        </div>

        <div
          className="rounded-xl overflow-hidden"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, border: '2px solid var(--line)', background: 'var(--panel)', width: 'min(16rem, calc(100vw - 3rem))', aspectRatio: `${COLS}/${ROWS}` }}
        >
          {display.flat().map((cell, i) => (
            <div key={i} style={{ aspectRatio: '1', background: cell || 'transparent', border: cell ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--line)', borderRadius: cell ? '2px' : '0' }} />
          ))}
        </div>

        {state.gameOver ? (
          <div className="text-center">
            <div className="display-font text-xl font-bold mb-3" style={{ color: 'var(--error, #ef4444)' }}>Game Over</div>
            <button onClick={() => setState(initState)} className="rounded-xl px-6 py-2.5 font-semibold text-white" style={{ background: 'var(--accent)' }}>Play Again</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2 sm:hidden">
              <button onClick={() => move(-1)} className="rounded-xl px-4 py-3 font-bold" style={{ background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)' }}>&#9664;</button>
              <button onClick={rotatePiece} className="rounded-xl px-4 py-3 font-bold" style={{ background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)' }}>&#8635;</button>
              <button onClick={tick} className="rounded-xl px-4 py-3 font-bold" style={{ background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)' }}>&#9660;</button>
              <button onClick={() => move(1)} className="rounded-xl px-4 py-3 font-bold" style={{ background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)' }}>&#9654;</button>
              <button onClick={hardDrop} className="rounded-xl px-5 py-3 font-bold text-white" style={{ background: 'var(--accent)' }}>&#9196;</button>
            </div>
            <div className="text-[0.7rem] hidden sm:block" style={{ color: 'var(--muted)' }}>
              Arrow keys &middot; Space to drop &middot; P to pause
            </div>
            <button onClick={() => setState(s => ({ ...s, paused: !s.paused }))} className="sm:hidden rounded-lg px-3 py-1 text-xs" style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
              {state.paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        )}
        {state.paused && !state.gameOver && <div className="display-font text-lg font-bold" style={{ color: 'var(--muted)' }}>Paused</div>}
      </div>
    </Shell>
  )
}
