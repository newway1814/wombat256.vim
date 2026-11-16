import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { DocDetail } from '../../api/types'
import { docOf } from '../../domain'

/** A whole SOP or log, opened at the passage the agent cited, which is highlighted.
 * Other passages the search returned for this answer are marked more quietly. */
export function DocView({
  chunkId,
  cited,
  retrieved,
  onOpen,
}: {
  chunkId: string
  cited: Set<string>
  retrieved: Map<string, number> // chunk id → similarity score
  onOpen: (chunkId: string) => void
}) {
  const docId = docOf(chunkId)
  const [doc, setDoc] = useState<DocDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const target = useRef<HTMLElement>(null)

  useEffect(() => {
    let live = true
    api
      .doc(docId)
      .then((d) => live && setDoc(d))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [docId])

  // Bring the cited passage into view once the document is on screen.
  useEffect(() => {
    if (doc) target.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [doc, chunkId])

  if (error)
    return (
      <div className="ws-pad">
        <p className="ws-kicker mono">{chunkId}</p>
        <p className="alarm">
          The agent cited {chunkId}, but there is no such document in the library. Treat that claim as unsupported.
        </p>
      </div>
    )
  if (!doc) return <p className="ws-empty">Opening {docId}…</p>

  const found = doc.sections.some((s) => s.chunk_id === chunkId)
  return (
    <div className="ws-pad doc">
      <p className="ws-kicker">
        {doc.kind} · <span className="mono">{doc.doc_id}</span>
      </p>
      <h2 className="ws-title">{doc.title.replace(`${doc.doc_id} `, '')}</h2>
      <p className="doc-key">
        <span className="doc-swatch hl" /> cited in the answer
        <span className="doc-swatch rt" /> retrieved by search
      </p>
      {!found && (
        <p className="alarm small">
          The agent cited {chunkId}, but {doc.doc_id} has no such section. Treat that claim as unsupported.
        </p>
      )}
      {doc.sections.map((s) => {
        const here = s.chunk_id === chunkId
        const isCited = cited.has(s.chunk_id)
        const score = retrieved.get(s.chunk_id)
        const cls = isCited || here ? 'hl' : score !== undefined ? 'rt' : ''
        return (
          <section
            key={s.chunk_id}
            ref={here ? target : undefined}
            className={`doc-sec ${cls}${here ? ' target' : ''}`}
            aria-current={here ? 'location' : undefined}
            aria-label={`${s.chunk_id} ${s.heading}`}
          >
            <header>
              <h3>{s.heading}</h3>
              <button type="button" className="doc-id mono" onClick={() => onOpen(s.chunk_id)} title="Link to this passage">
                {s.chunk_id.split('#')[1] ? `#${s.chunk_id.split('#')[1]}` : s.chunk_id}
              </button>
              {score !== undefined && <span className="doc-score mono">match {score.toFixed(2)}</span>}
            </header>
            <DocText text={s.text} />
          </section>
        )
      })}
    </div>
  )
}

/** Section text: paragraphs and simple lists, as written in the markdown source. */
function DocText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim())
        if (lines.length && lines.every((l) => /^\s*([-*]|\d+[.)])\s+/.test(l))) {
          const items = lines.map((l, j) => <li key={j}>{l.replace(/^\s*([-*]|\d+[.)])\s+/, '')}</li>)
          return /^\s*\d/.test(lines[0]) ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>
        }
        return <p key={i}>{lines.join(' ')}</p>
      })}
    </>
  )
}
