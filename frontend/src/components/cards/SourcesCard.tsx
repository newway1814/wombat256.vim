import { sourceAnchor } from '../../domain'
import { Panel } from './Panel'

interface Hit {
  chunk_id: string
  doc_title: string
  text: string
}

export function SourcesCard({ result, cited }: { result: { hits: Hit[] }; cited: Set<string> }) {
  // Cited sources first; the rest are what the search also found.
  const hits = [...result.hits].sort((a, b) => Number(cited.has(b.chunk_id)) - Number(cited.has(a.chunk_id)))
  return (
    <Panel wide label="Sources" title="Sources" meta={cited.size ? `${cited.size} cited` : undefined}>
      <ul className="sources">
        {hits.map((h) => (
          <li key={h.chunk_id} id={sourceAnchor(h.chunk_id)} className={cited.has(h.chunk_id) ? 'cited' : undefined} title={h.text}>
            <span className="mono">{h.chunk_id}</span>
            <span>{h.doc_title.replace(/^[A-Z]+-[\w-]+ /, '')}</span>
            {cited.has(h.chunk_id) && <span className="tag">cited</span>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
