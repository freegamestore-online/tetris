import { useState, useEffect, useCallback, useRef } from 'react'
import { GameShell, GameTopbar, GameAuth, GameOverScreen, useGameSounds } from '@freegamestore/games'
import { useLeaderboard } from '@freegamestore/games'
import { COLS, ROWS, COLORS, type GameState, initState, levelOf, move, rotate, step, hardDrop, shapeOf } from './lib/game'
import { loadStats, recordGame, saveStats } from './lib/stats'

const BASE_TICK = 500

// useGameSounds reads SoundContext, which GameShell provides internally. Called above
// <GameShell> it gets the muted default, so this no-render child of GameShell hands the
// real sounds API to App through a ref.
type SoundsApi = ReturnType<typeof useGameSounds>

function AudioBridge({ apiRef }: { apiRef: React.MutableRefObject<SoundsApi | null> }) {
  apiRef.current = useGameSounds()
  return null
}

export default function App() {
  const [state, setState] = useState<GameState>(initState)
  // The latest state, updated as soon as an action runs, so actions in the same frame
  // build on each other instead of on the last render.
  const stateRef = useRef(state)
  const { submitScore } = useLeaderboard("tetris")
  const audioRef = useRef<SoundsApi | null>(null)
  const [stats, setStats] = useState(loadStats)

  const apply = useCallback((action: (s: GameState) => GameState) => {
    const prev = stateRef.current
    const next = action(prev)
    if (next === prev) return
    stateRef.current = next
    setState(next)

    const sounds = audioRef.current
    if (next.gameOver && !prev.gameOver) {
      sounds?.playGameOver()
      submitScore(next.score)
      setStats(s => recordGame(s, next.score))
    } else if (next.lines > prev.lines) {
      sounds?.playClear()
      if (levelOf(next.lines) > levelOf(prev.lines)) sounds?.playLevelUp()
    } else if (next.pos.col !== prev.pos.col || next.rot !== prev.rot) {
      sounds?.playMove()
    }
  }, [submitScore])

  const tick = useCallback(() => apply(s => step(s)), [apply])
  const drop = useCallback(() => {
    if (!stateRef.current.gameOver && !stateRef.current.paused) audioRef.current?.playDrop()
    apply(s => hardDrop(s))
  }, [apply])
  const togglePause = useCallback(() => apply(s => (s.gameOver ? s : { ...s, paused: !s.paused })), [apply])
  const restart = useCallback(() => apply(() => initState()), [apply])

  useEffect(() => saveStats(stats), [stats])

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
        case 'ArrowLeft': apply(s => move(s, -1)); break
        case 'ArrowRight': apply(s => move(s, 1)); break
        case 'ArrowDown': tick(); break
        case 'ArrowUp': apply(rotate); break
        case ' ': drop(); break
        case 'p': case 'P': togglePause(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [apply, tick, drop, togglePause])

  // Render
  const display = state.board.map(r => [...r])
  const shape = shapeOf(state)
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c] && state.pos.row + r >= 0)
        display[state.pos.row + r][state.pos.col + c] = COLORS[state.type]

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Falling Blocks"
          stats={[
            { label: 'Score', value: state.score, accent: true },
            { label: 'Lines', value: state.lines },
            { label: 'Level', value: levelOf(state.lines) },
          ]}
          rules={
            <div>
              <h3 style={{marginBottom:'0.5rem',fontWeight:700}}>Falling Blocks</h3>
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
          onPlayPause={!state.gameOver ? togglePause : undefined}
          paused={state.paused}
          onRestart={restart}
          actions={<GameAuth />}
        />
      }
    >
      {/* Single responsive layout — touch controls always visible */}
      <AudioBridge apiRef={audioRef} />
      <div className="relative flex flex-col h-full min-h-0">
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
              onClick={() => apply(s => move(s, -1))}
              className="rounded-xl font-bold flex items-center justify-center min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '1.2rem' }}
              aria-label="Left"
            >&#8592;</button>
            <button
              onClick={() => apply(rotate)}
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
              onClick={drop}
              className="rounded-xl font-bold flex items-center justify-center text-white min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--accent)', fontSize: '1.3rem' }}
              aria-label="Drop"
            >&#9196;</button>
            <button
              onClick={() => apply(s => move(s, 1))}
              className="rounded-xl font-bold flex items-center justify-center min-h-[2.75rem]"
              style={{ height: 48, background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '1.2rem' }}
              aria-label="Right"
            >&#8594;</button>
          </div>
        )}

        {state.gameOver && (
          <GameOverScreen score={state.score} highScore={stats.bestScore} onPlayAgain={restart}>
            {state.lines} lines · level {levelOf(state.lines)}
          </GameOverScreen>
        )}

        {state.paused && !state.gameOver && (
          <div className="text-center py-2 display-font text-lg font-bold" style={{ color: 'var(--muted)' }}>Paused</div>
        )}
      </div>
    </GameShell>
  )
}
