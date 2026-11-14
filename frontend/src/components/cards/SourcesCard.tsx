import { sourceAnchor } from '../../domain'
import { Panel } from './Panel'

interface Hit {
  chunk_id: string
  doc_id: string
  doc_title: string
  heading: string
  text: string
  score: number
}

export function SourcesCard({ result, cited }: { result: { query: string; hits: Hit[] }; cited: Set<string> }) {
  return (
    <Panel wide label="Sources" title="Sources" meta={`search_docs · "${result.query}"`}>
      <ol style={{ listStyle: 'none', margin: 0, padding: '0 12px 4px' }}>
        {result.hits.map((h, i) => (
          <li
            key={h.chunk_id}
            id={sourceAnchor(h.chunk_id)}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 140px) minmax(0, 1fr) auto',
              gap: 12,
              alignItems: 'baseline',
              padding: '8px 0',
              borderTop: i ? '1px solid var(--grid)' : 0,
            }}
          >
            <span className="mono" style={{ fontSize: 12 }}>
              {h.chunk_id}
            </span>
            <span>
              <span style={{ fontWeight: 500 }}>{h.doc_title}</span>
              <span className="muted">
                {' '}
                · {h.heading} · {h.text.slice(0, 180)}
                {h.text.length > 180 ? '…' : ''}
              </span>
            </span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {cited.has(h.chunk_id) ? 'cited' : h.score.toFixed(2)}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
