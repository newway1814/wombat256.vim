import { shortDate } from '../../format'
import { Panel } from './Panel'

interface Result {
  chamber_id: string
  maintenance: { kind: string; performed_at: string }[]
  alarms: { code: string; severity: string; raised_at: string }[]
  alarm_count: number
}

export function ChamberEventsCard({ result }: { result: Result }) {
  const events = [
    ...result.maintenance.map((m) => ({ at: m.performed_at, what: m.kind, cls: 'accent' })),
    ...result.alarms.map((a) => ({ at: a.raised_at, what: a.code, cls: a.severity === 'ALARM' ? 'alarm' : 'warn' })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5)
  return (
    <Panel
      label={`Events ${result.chamber_id}`}
      title="Recent events"
      meta={`${result.maintenance.length} PM · ${result.alarm_count} alarms`}
    >
      <ul className="events">
        {events.map((e, i) => (
          <li key={i}>
            <span className="mono muted">{shortDate(e.at)}</span>
            <span className={`mono ${e.cls}`}>{e.what}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
