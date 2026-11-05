import { useEffect, useRef, type ReactNode } from 'react'

/** Wait before a held button starts repeating, then the time between repeats. */
const REPEAT_DELAY = 170
const REPEAT_MS = 50

/**
 * A touch control that acts on press (not release) and, with `repeat`, keeps acting
 * while held. Keyboard activation (click with detail 0) still works.
 */
export function PadButton({ label, onPress, repeat = false, accent = false, children }: {
  label: string
  onPress: () => void
  repeat?: boolean
  accent?: boolean
  children: ReactNode
}) {
  const pressRef = useRef(onPress)
  pressRef.current = onPress
  const timer = useRef<number | undefined>(undefined)
  const stop = () => window.clearTimeout(timer.current)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <button
      type="button"
      aria-label={label}
      className={`rounded-xl font-bold flex items-center justify-center min-h-[2.75rem] ${accent ? 'text-white' : ''}`}
      style={{
        height: 48,
        touchAction: 'none',
        fontSize: '1.2rem',
        ...(accent
          ? { background: 'var(--accent)' }
          : { background: 'var(--glass)', border: '1px solid var(--line)', color: 'var(--ink)' }),
      }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        stop()
        pressRef.current()
        if (!repeat) return
        const again = (delay: number) => {
          timer.current = window.setTimeout(() => { pressRef.current(); again(REPEAT_MS) }, delay)
        }
        again(REPEAT_DELAY)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onClick={e => { if (e.detail === 0) onPress() }}
    >
      {children}
    </button>
  )
}
