import type { ReactNode } from 'react'

export type EntityKind = 'cite' | 'lot' | 'chamber'
/** Returns a click handler when the entity can be opened in the side panel, else null. */
export type Resolve = (kind: EntityKind, id: string) => (() => void) | null

const TOKEN = /(\[[A-Z]+-[\w-]+#\d+\]|\*\*[^*]+\*\*|`[^`]+`|\bL\d{7}(?:-\d{2})?\b|\b[A-Z]{3,6}-\d{2}-[A-Z]\b)/g

/** The agent's answer as plain reading text: paragraphs, lists and bold lead-ins, with
 * citations, lots and chambers turned into links that open the evidence beside the chat. */
export function Prose({ text, resolve }: { text: string; resolve: Resolve }) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter((l) => l.trim())
        const bullets = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))
        if (bullets) {
          const ordered = /^\s*\d/.test(lines[0])
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), resolve)}</li>)
          return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>
        }
        // A paragraph followed by a list in the same block ("Evidence:\n- a\n- b").
        const firstBullet = lines.findIndex((l) => /^\s*[-*•]\s+/.test(l))
        if (firstBullet > 0 && lines.slice(firstBullet).every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <div key={i}>
              <p>{inline(lines.slice(0, firstBullet).join(' '), resolve)}</p>
              <ul>
                {lines.slice(firstBullet).map((l, j) => (
                  <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ''), resolve)}</li>
                ))}
              </ul>
            </div>
          )
        }
        const heading = b.match(/^#{1,4}\s+(.*)$/)
        if (heading) return <h3 key={i}>{inline(heading[1], resolve)}</h3>
        return <p key={i}>{inline(lines.join(' '), resolve)}</p>
      })}
    </div>
  )
}

function inline(text: string, resolve: Resolve): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i}>{inline(part.slice(2, -2), resolve)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return (
        <code key={i} className="mono">
          {part.slice(1, -1)}
        </code>
      )
    const cite = part.match(/^\[([A-Z]+-[\w-]+#\d+)\]$/)
    if (cite) {
      const go = resolve('cite', cite[1])
      return go ? (
        <button key={i} type="button" className="cite" onClick={go}>
          {cite[1]}
        </button>
      ) : (
        <span key={i} className="cite static">
          {cite[1]}
        </span>
      )
    }
    const kind: EntityKind | null = /^L\d{7}/.test(part) ? 'lot' : /^[A-Z]{3,6}-\d{2}-[A-Z]$/.test(part) ? 'chamber' : null
    if (kind) {
      const go = resolve(kind, part)
      if (go)
        return (
          <button key={i} type="button" className="entity mono" onClick={go}>
            {part}
          </button>
        )
    }
    return part.replace(/ -> /g, ' → ')
  })
}
