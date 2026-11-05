import { useState, useEffect, useCallback, useRef } from 'react'
import { GameShell, GameTopbar, GameAuth, GameOverScreen, useGameSounds } from '@freegamestore/games'
import { useLeaderboard } from '@freegamestore/games'
import {
  COLS, ROWS, COLORS, PREVIEW, TIMING_FIELDS, type GameState,
  initState, levelOf, move, rotate, softDrop, hardDrop, holdPiece, advance, boardView,
} from './lib/game'
import { loadStats, recordGame, saveStats } from './lib/stats'
import { PadButton } from './components/PadButton'
import { MiniPiece } from './components/MiniPiece'
import { useBoardGestures } from './useBoardGestures'

// useGameSounds reads SoundContext, which GameShell provides internally. Called above
// <GameShell> it gets the muted default, so this no-render child of GameShell hands the
// real sounds API to App through a ref.
type SoundsApi = ReturnType<typeof useGameSounds>

function AudioBridge({ apiRef }: { apiRef: React.MutableRefObject<SoundsApi | null> }) {
  apiRef.current = useGameSounds()
  return null
}

/** Width of the hold / next / best column beside the board. */
const SIDE = 64

const Label = ({ children }: { children: string }) => (
  <div className="text-[0.6rem] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{children}</div>
)

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
    // Gravity runs every frame; only redraw when something on screen changed.
    if ((Object.keys(next) as (keyof GameState)[]).some(k => !TIMING_FIELDS.has(k) && next[k] !== prev[k])) setState(next)

    const sounds = audioRef.current
    if (next.gameOver && !prev.gameOver) {
      sounds?.playGameOver()
      submitScore(next.score)
      setStats(s => recordGame(s, { score: next.score, lines: next.lines, level: levelOf(next.lines) }))
    } else if (next.lines > prev.lines) {
      sounds?.playClear()
      if (levelOf(next.lines) > levelOf(prev.lines)) sounds?.playLevelUp()
    } else if (next.board !== prev.board) {
      sounds?.playDrop()
    } else if (next.hold !== prev.hold || (next.type === prev.type && (next.pos.col !== prev.pos.col || next.rot !== prev.rot))) {
      sounds?.playMove()
    }
  }, [submitScore])

  const left = useCallback(() => apply(s => move(s, -1)), [apply])
  const right = useCallback(() => apply(s => move(s, 1)), [apply])
  const turn = useCallback(() => apply(s => rotate(s, 1)), [apply])
  const turnBack = useCallback(() => apply(s => rotate(s, -1)), [apply])
  const down = useCallback(() => apply(softDrop), [apply])
  const drop = useCallback(() => apply(s => hardDrop(s)), [apply])
  const hold = useCallback(() => apply(s => holdPiece(s)), [apply])
  const togglePause = useCallback(() => apply(s => (s.gameOver ? s : { ...s, paused: !s.paused })), [apply])
  const restart = useCallback(() => {
    stateRef.current = initState()
    setState(stateRef.current)
  }, [])

  useEffect(() => saveStats(stats), [stats])

  // Game loop: gravity and lock delay run on real time, capped so a hidden tab doesn't jump.
  useEffect(() => {
    if (state.gameOver || state.paused) return
    let last = performance.now()
    let id = requestAnimationFrame(function frame(now) {
      const dt = Math.min(now - last, 100)
      last = now
      apply(s => advance(s, dt))
      id = requestAnimationFrame(frame)
    })
    return () => cancelAnimationFrame(id)
  }, [apply, state.gameOver, state.paused])

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(e.key)) e.preventDefault()
      switch (e.key) {
        case 'ArrowLeft': left(); break
        case 'ArrowRight': right(); break
        case 'ArrowDown': down(); break
        case 'ArrowUp': case 'x': case 'X': if (!e.repeat) turn(); break
        case 'z': case 'Z': case 'Control': if (!e.repeat) turnBack(); break
        case 'c': case 'C': case 'Shift': if (!e.repeat) hold(); break
        case ' ': if (!e.repeat) drop(); break
        case 'p': case 'P': case 'Escape': togglePause(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [left, right, down, turn, turnBack, hold, drop, togglePause])

  const gestures = useBoardGestures({
    move: dc => apply(s => move(s, dc)),
    softDrop: down,
    hardDrop: drop,
    rotate: turn,
    hold,
  })

  const { cells: display, ghost } = boardView(state)
  const color = COLORS[state.type]

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
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Touch</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Drag left/right on the board to move, drag down to drop faster</li>
                <li>Flick down to drop at once, swipe up to hold</li>
                <li>Tap the board to rotate</li>
                <li>Hold the arrow buttons to keep moving</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Keyboard</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Left/Right arrows to move</li>
                <li>Up arrow or X to rotate clockwise, Z to rotate back</li>
                <li>Down arrow to soft drop, Space to hard drop</li>
                <li>C or Shift to hold</li>
                <li>P or Esc to pause</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Scoring</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>1 / 2 / 3 / 4 lines = 100 / 300 / 500 / 800 × level</li>
                <li>Soft drop 1 point per row, hard drop 2</li>
              </ul>
              <h4 style={{marginTop:'0.75rem',fontWeight:600}}>Rules</h4>
              <ul style={{paddingLeft:'1.2rem',marginTop:'0.25rem'}}>
                <li>Every 7 pieces contain one of each shape</li>
                <li>Hold swaps the piece out, once per piece</li>
                <li>A piece locks half a second after it lands; moving it buys a little time</li>
                <li>Level increases every 10 lines, and pieces fall faster</li>
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
      <AudioBridge apiRef={audioRef} />
      <div className="relative flex flex-col h-full min-h-0">
        {/* Board and side column, sized together to the space left */}
        <div className="flex-1 min-h-0 px-2 pt-1" style={{ containerType: 'size' }}>
          <div className="flex h-full items-center justify-center">
            <div className="flex items-start gap-2">
              <div
                {...gestures}
                className="rounded-xl overflow-hidden"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                  gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                  border: '2px solid var(--line)',
                  background: 'var(--panel)',
                  width: `min(calc(100cqw - ${SIDE + 8}px), ${(COLS / ROWS) * 100}cqh)`,
                  aspectRatio: `${COLS}/${ROWS}`,
                  touchAction: 'none',
                }}
              >
                {display.map((cell, i) => {
                  const shadow = !cell && ghost.has(i)
                  return (
                    <div
                      key={i}
                      style={{
                        background: cell || (shadow ? color : 'transparent'),
                        opacity: shadow ? 0.25 : 1,
                        boxShadow: cell
                          ? 'inset 0 0 0 1px rgba(255,255,255,0.15)'
                          : 'inset 0 0 0 1px var(--line)',
                        borderRadius: cell || shadow ? '2px' : '0',
                        minWidth: 0,
                        minHeight: 0,
                      }}
                    />
                  )
                })}
              </div>
  
              <div className="flex flex-col items-center gap-1 pt-1" style={{ width: SIDE }}>
                <Label>Hold</Label>
                <MiniPiece type={state.hold} dim={!state.canHold} />
                <div className="h-1" />
                <Label>Next</Label>
                {state.queue.slice(0, PREVIEW).map((t, i) => <MiniPiece key={i} type={t} />)}
                <div className="h-1" />
                <Label>Best</Label>
                <div className="text-sm font-bold">{Math.max(stats.bestScore, state.score)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls below the board */}
        {!state.gameOver && (
          <div className="grid grid-cols-6 gap-1 px-2 pb-1 pt-1 shrink-0">
            <PadButton label="Left" onPress={left} repeat>&#8592;</PadButton>
            <PadButton label="Hold" onPress={hold}><span className="text-xs font-bold uppercase">Hold</span></PadButton>
            <PadButton label="Rotate" onPress={turn}>&#8635;</PadButton>
            <PadButton label="Down" onPress={down} repeat>&#8595;</PadButton>
            <PadButton label="Drop" onPress={drop} accent>&#9196;</PadButton>
            <PadButton label="Right" onPress={right} repeat>&#8594;</PadButton>
          </div>
        )}

        {state.gameOver && (
          <GameOverScreen score={state.score} highScore={stats.bestScore} onPlayAgain={restart}>
            <div>{state.lines} lines · level {levelOf(state.lines)}</div>
            <div style={{ marginTop: '0.25rem' }}>
              {stats.played} played · best {stats.bestLines} lines, level {stats.bestLevel}
            </div>
          </GameOverScreen>
        )}

        {state.paused && !state.gameOver && (
          <div className="text-center py-2 display-font text-lg font-bold" style={{ color: 'var(--muted)' }}>Paused</div>
        )}
      </div>
    </GameShell>
  )
}
