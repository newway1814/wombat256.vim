import { useState, type ReactNode } from 'react'
import { sourceAnchor } from '../domain'

/** The agent's answer, shortest first: the finding, then the action. The evidence list and
 * other detail fold under a toggle. Citations ([CHUNK#n]) become links to the sources card. */
export function Answer({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const blocks = text.trim().split(/\n\s*\n/)
  const isList = (b: string) => b.split('\n').every((l) => /^\s*[-*] /.test(l))
  const [headline, ...rest] = blocks
  const action = rest.filter((b) => !isList(b)).pop()
  const detail = rest.filter((b) => b !== action)
  const items = detail.flatMap((b) => (isList(b) ? b.split('\n').map((l) => l.replace(/^\s*[-*] /, '')) : [b]))

  return (
    <div className="answer">
      <p className="answer-head">{inline(headline)}</p>
      {action && <p>{inline(action)}</p>}
      {items.length > 0 && (
        <>
          <button type="button" className="toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Hide evidence' : `Show evidence (${items.length})`}
          </button>
          {open && (
            <ul className="evidence open">
              {items.map((l, j) => (
                <li key={j}>{inline(l)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function inline(text: string): ReactNode[] {
  return text.split(/(\[[A-Z]+-[\w-]+#\d+\])/g).map((part, i) => {
    const m = part.match(/^\[([A-Z]+-[\w-]+#\d+)\]$/)
    if (!m) return part.replace(/\*\*/g, '').replace(/ -> /g, ' → ')
    return (
      <a key={i} className="cite" href={`#${sourceAnchor(m[1])}`}>
        {m[1]}
      </a>
    )
  })
}
