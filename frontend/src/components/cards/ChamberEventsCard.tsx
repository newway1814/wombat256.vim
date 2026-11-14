import { dateTime } from '../../format'
import { Panel } from './Panel'

interface Result {
  chamber_id: string
  maintenance: { kind: string; performed_at: string; technician: string; notes: string }[]
  alarms: { code: string; severity: string; raised_at: string; message: string }[]
  alarm_count: number
}

export function ChamberEventsCard({ result }: { result: Result }) {
  const events = [
    ...result.maintenance.map((m) => ({ at: m.performed_at, what: m.kind, text: `${m.notes} (${m.technician})`, sev: '' })),
    ...result.alarms.map((a) => ({ at: a.raised_at, what: a.code, text: a.message, sev: a.severity })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <Panel
      label={`Events ${result.chamber_id}`}
      title={
        <>
          Events · <span className="mono">{result.chamber_id}</span>
        </>
      }
      meta={`get_chamber_events · ${result.maintenance.length} PM · ${result.alarm_count} alarms`}
    >
      <div className="table-box" style={{ maxHeight: 260, overflowY: 'auto' }}>
        <table className="data">
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>
                  {dateTime(e.at)}
                </td>
                <td
                  className={`mono ${e.sev === 'ALARM' ? 'alarm' : e.sev === 'WARN' ? 'warn' : ''}`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {e.what}
                </td>
                <td>{e.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
