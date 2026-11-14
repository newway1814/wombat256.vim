import { describe, expect, it } from 'vitest'
import { sourceAnchor } from './domain'
import { argsText, pValue } from './format'

describe('format', () => {
  it('writes tiny p-values in scientific notation and others plainly', () => {
    expect(pValue(1.3e-37)).toBe('1.3e-37')
    expect(pValue(0.0004)).toBe('4.0e-4')
    expect(pValue(0.1)).toBe('0.10')
    expect(pValue(1)).toBe('1.00')
  })

  it('shows tool arguments like a function call', () => {
    expect(argsText({ chamber_id: 'ETCH-03-B', k: 3 })).toBe('chamber_id="ETCH-03-B", k=3')
    expect(argsText({})).toBe('')
  })

  it('makes chunk IDs safe to use as anchors', () => {
    expect(sourceAnchor('SOP-ETCH-001#3')).toBe('src-SOP-ETCH-001-3')
  })
})
