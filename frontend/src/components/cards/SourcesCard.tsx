import { useState } from 'react'
import { sourceAnchor } from '../../domain'
import { Panel } from './Panel'

interface Hit {
  chunk_id: string
  doc_title: string
  text: string
}

/** Cited sources up front; what else the search found folds behind "more". */
export function SourcesCard({ result, cited }: { result: { hits: Hit[] }; cited: Set<string> }) {
  const [all, setAll] = useState(false)
  const main = result.hits.filter((h) => cited.has(h.chunk_id))
  const lead = main.length ? main : result.hits.slice(0, 2)
  const others = result.hits.filter((h) => !lead.includes(h))
  const shown = all ? [...lead, ...others] : lead
  return (
    <Panel wide label="Sources" title="Sources" meta={main.length ? `${main.length} cited` : undefined}>
      <ul className="sources">
        {shown.map((h) => (
          <li key={h.chunk_id} id={sourceAnchor(h.chunk_id)} className={cited.has(h.chunk_id) ? 'cited' : undefined} title={h.text}>
            <span className="mono">{h.chunk_id}</span>
            <span>{h.doc_title.replace(/^[A-Z]+-[\w-]+ /, '')}</span>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <button type="button" className="toggle card-toggle" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `${others.length} more found`}
        </button>
      )}
    </Panel>
  )
}
