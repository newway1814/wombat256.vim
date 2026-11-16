// One plain-language finding per tool result: the sentence a reader takes away.
/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are free-form JSON */
import { PARAMS } from '../../domain'

const PATTERN: Record<string, string> = { edge_ring: 'Edge ring', cluster: 'A cluster', random: 'Random fails', clean: 'Clean' }

export const TOOL_LABEL: Record<string, string> = {
  check_lot_yields: 'Flagged lots',
  find_commonality: 'Commonality',
  get_lot: 'Lot',
  classify_wafer_map: 'Wafer map',
  spc_chart: 'SPC chart',
  compare_around_pm: 'Before and after PM',
  get_chamber_events: 'Chamber events',
  search_docs: 'Sources',
  draft_work_order: 'Work order',
  run_sql: 'Query',
}

export function finding(name: string, r: any): string {
  switch (name) {
    case 'check_lot_yields':
      return r.flagged.length
        ? `${r.flagged.length} of ${r.checked} lots fell below ${r.limit.toFixed(1)}% yield.`
        : `No lot is unusually low; all are within ${r.k} sigma of ${r.baseline_yield}%.`
    case 'find_commonality': {
      const top = r.ranking[0]
      return top && top.p_adjusted < 0.01
        ? `${top.bad_in_chamber} of ${r.bad_wafers} bad wafers went through ${top.chamber_id}.`
        : 'No chamber stands out among the bad wafers.'
    }
    case 'get_lot': {
      const gate = r.route.find((s: any) => s.step === 'ETCH-GATE')
      return gate
        ? `${r.id} was split across ${gate.chambers.map((c: any) => c.chamber_id).join(' and ')} at gate etch.`
        : `${r.id}: ${r.mean_yield?.toFixed(1)}% mean yield.`
    }
    case 'classify_wafer_map':
      return `${PATTERN[r.label] ?? r.label} on ${r.wafer_id}: ${Math.round(100 * r.edge_fail_rate)}% of edge dies fail, ${Math.round(100 * r.inner_fail_rate)}% inside.`
    case 'spc_chart': {
      const p = PARAMS[r.param]?.name ?? r.param
      const after = r.points.filter((x: any) => !x.baseline).length
      return r.out_of_control
        ? `${r.points_out_of_control_after_baseline ?? '?'} of ${after} points since the PM are out of control.`
        : `${r.chamber_id}'s ${p} is in control.`
    }
    case 'compare_around_pm': {
      const p = PARAMS[r.param] ?? { name: r.param, unit: '' }
      return `${cap(p.name)} moved from ${r.mean_before.toFixed(1)} to ${r.mean_after.toFixed(1)} ${p.unit} after the PM.`
    }
    case 'get_chamber_events': {
      const pm = r.maintenance.at(-1)
      return pm
        ? `Last PM on ${pm.performed_at.slice(0, 10)}, then ${r.alarm_count} alarm${r.alarm_count === 1 ? '' : 's'}.`
        : `No maintenance on record; ${r.alarm_count} alarms.`
    }
    case 'search_docs':
      return `Found ${r.hits.length} relevant manual sections.`
    case 'draft_work_order':
      return `Drafted work order WO-${String(r.id).padStart(4, '0')} for ${r.chamber_id}.`
    case 'run_sql':
      return `${r.rows.length} row${r.rows.length === 1 ? '' : 's'}${r.truncated ? ' (first 200)' : ''}.`
    default:
      return 'Done.'
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** What the agent is doing while a tool runs. */
export const DOING: Record<string, string> = {
  check_lot_yields: 'Checking lot yields',
  find_commonality: 'Looking for a shared chamber',
  get_lot: 'Opening the lot',
  classify_wafer_map: 'Reading the wafer map',
  spc_chart: 'Drawing the SPC chart',
  compare_around_pm: 'Comparing before and after the PM',
  get_chamber_events: 'Reading the chamber history',
  search_docs: 'Searching the manuals',
  draft_work_order: 'Drafting a work order',
  run_sql: 'Querying the database',
}
