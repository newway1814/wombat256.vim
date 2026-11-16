// Shared constants and helpers used by several components.

const BIN_VAR: Record<number, string> = {
  1: 'var(--die-pass)',
  2: 'var(--bin-2)',
  3: 'var(--bin-3)',
  4: 'var(--bin-4)',
  5: 'var(--bin-5)',
  6: 'var(--bin-6)',
  7: 'var(--bin-7)',
}
export const binColor = (bin: number) => BIN_VAR[bin] ?? 'var(--muted)'

export const sourceAnchor = (chunkId: string) => `src-${chunkId.replace(/[^A-Za-z0-9-]/g, '-')}`

export const PARAMS: Record<string, { name: string; unit: string }> = {
  rf_reflected_w: { name: 'reflected RF power', unit: 'W' },
  rf_forward_w: { name: 'forward RF power', unit: 'W' },
  pressure_mtorr: { name: 'chamber pressure', unit: 'mTorr' },
  esc_temp_c: { name: 'ESC temperature', unit: '°C' },
}

/** A chunk id as the agent cites it, e.g. SOP-ETCH-001#3 or MLOG-2025-014#2. */
export const CHUNK_ID = /[A-Z]{2,}-[A-Z0-9]+(?:-[A-Z0-9]+)*#\d+/g

/** Every chunk id cited in a text, however it was bracketed. */
export const citedIds = (text: string) => new Set(text.match(CHUNK_ID) ?? [])

export const docOf = (chunkId: string) => chunkId.split('#')[0]
