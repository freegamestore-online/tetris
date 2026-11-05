import { COLORS, SHAPES } from '../lib/game'

const MINI = 11

/** A small picture of a piece in its spawn orientation, for the hold and next slots. */
export function MiniPiece({ type, dim = false }: { type: number | null; dim?: boolean }) {
  const shape = type === null ? [] : SHAPES[type][0].filter(r => r.some(Boolean))
  const used = shape.length ? shape[0].map((_, c) => shape.some(r => r[c])) : []
  const rows = shape.map(r => r.filter((_, c) => used[c]))
  return (
    <div className="flex items-center justify-center" style={{ width: MINI * 4, height: MINI * 2 + 4, opacity: dim ? 0.35 : 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows[0]?.length ?? 0}, ${MINI}px)`, gridAutoRows: `${MINI}px` }}>
        {rows.flat().map((v, i) => (
          <div key={i} style={{ background: v && type !== null ? COLORS[type] : 'transparent', borderRadius: 2, boxShadow: v ? 'inset 0 0 0 1px rgba(255,255,255,0.15)' : undefined }} />
        ))}
      </div>
    </div>
  )
}
