import { useRef, type PointerEvent } from 'react'
import { COLS } from './lib/game'

/** A downward swipe faster than this (px per ms) is a hard drop. */
const FLICK_SPEED = 1
const TAP_MS = 250
const TAP_SLOP = 10

/**
 * Swipe on the board: drag sideways to move a cell at a time, drag down to soft drop,
 * flick down to hard drop, swipe up to hold, tap to rotate.
 */
export function useBoardGestures(on: {
  move: (dc: number) => void
  softDrop: () => void
  hardDrop: () => void
  rotate: () => void
  hold: () => void
}) {
  const g = useRef<{ id: number; x0: number; y0: number; t0: number; ax: number; ay: number; axis: 'x' | 'y' | null } | null>(null)

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (g.current) return
      e.currentTarget.setPointerCapture(e.pointerId)
      g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, ax: e.clientX, ay: e.clientY, axis: null }
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const s = g.current
      if (!s || s.id !== e.pointerId) return
      const cell = e.currentTarget.getBoundingClientRect().width / COLS
      if (!s.axis) {
        const dx = Math.abs(e.clientX - s.x0), dy = Math.abs(e.clientY - s.y0)
        if (Math.max(dx, dy) < cell / 2) return
        s.axis = dx > dy ? 'x' : 'y'
      }
      if (s.axis === 'x') {
        while (e.clientX - s.ax >= cell) { on.move(1); s.ax += cell }
        while (s.ax - e.clientX >= cell) { on.move(-1); s.ax -= cell }
      } else {
        while (e.clientY - s.ay >= cell) { on.softDrop(); s.ay += cell }
      }
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const s = g.current
      if (!s || s.id !== e.pointerId) return
      g.current = null
      const dt = Math.max(1, e.timeStamp - s.t0)
      const dx = e.clientX - s.x0, dy = e.clientY - s.y0
      if (!s.axis && dt < TAP_MS && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) on.rotate()
      else if (s.axis === 'y' && dy > 0 && dy / dt > FLICK_SPEED) on.hardDrop()
      else if (s.axis === 'y' && dy < 0 && -dy / dt > FLICK_SPEED / 2) on.hold()
    },
    onPointerCancel() {
      g.current = null
    },
  }
}
