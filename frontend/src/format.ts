export const clock = (d: Date) => d.toTimeString().slice(0, 8)

export const woName = (id: number) => `WO-${String(id).padStart(4, '0')}`

export const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`

/** p-values: tiny ones in scientific notation, the rest with two decimals. */
export const pValue = (p: number) => (p < 0.001 ? p.toExponential(1) : p.toFixed(2))

export const shortDate = (iso: string) => iso.slice(5, 10)

export const dateTime = (iso: string) => iso.replace('T', ' ').slice(0, 16)

export const argsText = (args: Record<string, unknown>) =>
  Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ')
