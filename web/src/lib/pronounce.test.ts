import { describe, it, expect } from 'vitest'
import { scanUnknowns } from './pronounce'

describe('scanUnknowns', () => {
  it('finds percentages and decimal numbers with a context snippet', () => {
    const out = scanUnknowns('GDP tăng 8,6% trong quý này.')
    expect(out.map(u => u.orig)).toContain('8,6%')
    expect(out[0].context).toContain('8,6%')
  })

  it('finds currency/symbols and ALL-CAPS acronyms', () => {
    const out = scanUnknowns('The NATO budget is 500₫ and GDP rose.')
    const origs = out.map(u => u.orig)
    expect(origs).toContain('NATO')
    expect(origs).toContain('₫')
    expect(origs).toContain('GDP')
  })

  it('dedupes repeated tokens', () => {
    const out = scanUnknowns('18% and again 18% and 18%')
    expect(out.filter(u => u.orig === '18%')).toHaveLength(1)
  })

  it('caps at 12 matches', () => {
    const text = Array.from({ length: 30 }, (_, i) => `${i}.${i}`).join(' ')
    expect(scanUnknowns(text).length).toBeLessThanOrEqual(12)
  })

  it('falls back to the demo set for empty/plain text', () => {
    expect(scanUnknowns('').length).toBe(3)
    expect(scanUnknowns('hello world no symbols here').length).toBe(3)
  })

  it('does not share lastIndex between calls (stateful-regex bug guard)', () => {
    const a = scanUnknowns('value 8,6% here')
    const b = scanUnknowns('value 8,6% here')
    expect(a).toEqual(b)
  })
})
