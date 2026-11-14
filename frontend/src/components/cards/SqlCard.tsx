import { Panel } from './Panel'

export function SqlCard({ result, sql }: { result: { columns: string[]; rows: unknown[][]; truncated: boolean }; sql: string }) {
  return (
    <Panel wide label="Query result" title="Query result" meta={`run_sql · ${result.rows.length} rows${result.truncated ? ' (first 200)' : ''}`}>
      <pre className="mono muted" style={{ margin: 0, padding: '8px 12px 0', fontSize: 12, whiteSpace: 'pre-wrap' }}>
        {sql}
      </pre>
      <div className="table-box" style={{ maxHeight: 320, overflowY: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => (
                  <td key={j} className={typeof v === 'number' ? 'num' : 'mono'}>
                    {String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
