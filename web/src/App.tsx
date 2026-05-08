import { useState, useEffect, useCallback, useRef } from 'react'
import { GameShell, GameTopbar, GameAuth } from '@freegamestore/games'
import { useLeaderboard } from './hooks/useLeaderboard'

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
  const { submitScore } = useLeaderboard("tetris")
  const submittedRef = useRef(false)

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

  // Submit score on game over
  useEffect(() => {
    if (state.gameOver && !submittedRef.current) {
      submittedRef.current = true
      submitScore(state.score)
    }
    if (!state.gameOver) {
      submittedRef.current = false
    }
  }, [state.gameOver, state.score, submitScore])

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
    <GameShell
      topbar={
        <GameTopbar
          title="Tetris"
          stats={[
            { label: 'Score', value: state.score, accent: true },
            { label: 'Lines', value: state.lines },
            { label: 'Level', value: Math.floor(state.lines / 10) + 1 },
          ]}
          rules={
            <div>
              <h3 style={{marginBottom:'0.5rem',fontWeight:700}}>Tetris</h3>
              <p>Stack falling blocks and clear complete lines.</p>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Controls</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Left/Right arrows to move</li>
                <li>Up arrow to rotate</li>
                <li>Down arrow to soft drop</li>
                <li>Space to hard drop</li>
                <li>P to pause</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Scoring</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>1 line = 100 pts</li>
                <li>2 lines = 300 pts</li>
                <li>3 lines = 500 pts</li>
                <li>4 lines = 800 pts</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Rules</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Level increases every 10 lines</li>
                <li>Higher levels = faster drops</li>
              </ul>
            </div>
          }
          actions={
            <>
              {!state.gameOver && (
                <button
                  onClick={() => setState(s => ({ ...s, paused: !s.paused }))}
                  className="rounded-lg px-3 py-1 text-xs min-h-[2.75rem] min-w-[2.75rem]"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}
                >
                  {state.paused ? 'Resume' : 'Pause'}
                </button>
              )}
              <GameAuth />
            </>
          }
        />
      }
    >
      {/* Desktop layout */}
      <div className="hidden sm:flex flex-1 flex-col items-center justify-center gap-4 p-4 h-full">
        <div
          className="rounded-xl overflow-hidden"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)`, border: '2px solid var(--line)', background: 'var(--panel)', width: '16rem', aspectRatio: `${COLS}/${ROWS}` }}
        >
          {display.flat().map((cell, i) => (
            <div
              key={i}
              style={{
                background: cell || 'transparent',
                boxShadow: cell
                  ? 'inset 0 0 0 1px rgba(255,255,255,0.15)'
                  : 'inset 0 0 0 1px var(--line)',
                borderRadius: cell ? '2px' : '0',
                minWidth: 0,
                minHeight: 0,
              }}
            />
          ))}
        </div>

        {state.gameOver ? (
          <div className="text-center">
            <div className="display-font text-xl font-bold mb-3" style={{ color: 'var(--error, #ef4444)' }}>Game Over</div>
            <button onClick={() => setState(initState)} className="rounded-xl px-6 py-2.5 font-semibold text-white min-h-[2.75rem]" style={{ background: 'var(--accent)' }}>Play Again</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="text-[0.7rem]" style={{ color: 'var(--muted)' }}>
              Arrow keys &middot; Space to drop &middot; P to pause
            </div>
          </div>
        )}
        {state.paused && !state.gameOver && <div className="display-font text-lg font-bold" style={{ color: 'var(--muted)' }}>Paused</div>}
      </div>

      {/* Mobile layout */}
      <div className="flex sm:hidden flex-col h-full min-h-0">
        {/* Board area */}
        <div className="flex flex-1 items-center justify-center px-2 min-h-0">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridTemplateRows: `repeat(${ROWS}, 1fr)`,
              border: '2px solid var(--line)',
              background: 'var(--panel)',
              height: '100%',
              maxWidth: '100%',
              aspectRatio: `${COLS}/${ROWS}`,
            }}
          >
            {display.flat().map((cell, i) => (
              <div
                key={i}
                style={{
                  background: cell || 'transparent',
                  boxShadow: cell
                    ? 'inset 0 0 0 1px rgba(255,255,255,0.15)'
                    : 'inset 0 0 0 1px var(--line)',
                  borderRadius: cell ? '2px' : '0',
                  minWidth: 0,
                  minHeight: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Controls below the board */}
        {!state.gameOver && (
          <div className="grid grid-cols-5 gap-1 px-2 pb-1 pt-1 shrink-0">
            <button
              onClick={() => move(-1)}
              className="rounded-xl font-bold flex items-center justify-center min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '1.2rem' }}
              aria-label="Left"
            >&#8592;</button>
            <button
              onClick={rotatePiece}
              className="rounded-xl font-bold flex items-center justify-center min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '1.3rem' }}
              aria-label="Rotate"
            >&#8635;</button>
            <button
              onClick={tick}
              className="rounded-xl font-bold flex items-center justify-center min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '1.2rem' }}
              aria-label="Down"
            >&#8595;</button>
            <button
              onClick={() => move(1)}
              className="rounded-xl font-bold flex items-center justify-center min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '1.2rem' }}
              aria-label="Right"
            >&#8594;</button>
            <button
              onClick={hardDrop}
              className="rounded-xl font-bold flex items-center justify-center text-white min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--accent)', fontSize: '1.3rem' }}
              aria-label="Drop"
            >&#9196;</button>
          </div>
        )}

        {/* Game over overlay for mobile */}
        {state.gameOver && (
          <div className="flex flex-col items-center gap-3 py-3 shrink-0">
            <div className="display-font text-xl font-bold" style={{ color: 'var(--error, #ef4444)' }}>Game Over</div>
            <button onClick={() => setState(initState)} className="rounded-xl px-6 py-2.5 font-semibold text-white min-h-[2.75rem]" style={{ background: 'var(--accent)' }}>Play Again</button>
          </div>
        )}

        {state.paused && !state.gameOver && (
          <div className="text-center py-2 display-font text-lg font-bold" style={{ color: 'var(--muted)' }}>Paused</div>
        )}
      </div>
    </GameShell>
  )
}
