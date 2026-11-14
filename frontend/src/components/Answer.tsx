import type { ReactNode } from 'react'
import { sourceAnchor } from '../domain'

/** Renders the agent's plain-text answer: paragraphs, "- " lists, and [CHUNK#n] citations. */
export function Answer({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <div className="answer">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*] /, ''))}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{inline(block)}</p>
      })}
    </div>
  )
}

function inline(text: string): ReactNode[] {
  return text.split(/(\[[A-Z]+-[\w-]+#\d+\])/g).map((part, i) => {
    const m = part.match(/^\[([A-Z]+-[\w-]+#\d+)\]$/)
    if (!m) return part.replace(/\*\*/g, '').replace(/ -> /g, ' → ')
    return (
      <a key={i} className="cite" href={`#${sourceAnchor(m[1])}`}>
        [{m[1]}]
      </a>
    )
  })
}
