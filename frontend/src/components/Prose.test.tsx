import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Prose } from './Prose'

const html = (text: string) => renderToStaticMarkup(<Prose text={text} resolve={() => () => {}} />)

describe('citations in an answer', () => {
  it('turns every bracketing the model uses into links', () => {
    for (const text of [
      'Recalibrate the match [SOP-ETCH-001#4].',
      'Recalibrate the match (SOP-ETCH-001#4).',
      'Recalibrate the match, see SOP-ETCH-001#4.',
      'Recalibrate the match [SOP-ETCH-001#4, MLOG-2025-014#2].',
    ]) {
      expect(html(text)).toContain('<button type="button" class="cite" title="Open the cited passage">SOP-ETCH-001#4</button>')
    }
    expect(html('See [SOP-ETCH-001#4; MLOG-2025-014#2].')).toContain('>MLOG-2025-014#2</button>')
  })

  it('leaves chambers and lots as entities, not citations', () => {
    const out = html('ETCH-03-B ran L2610040.')
    expect(out).not.toContain('class="cite"')
    expect(out).toContain('class="entity mono"')
  })
})
