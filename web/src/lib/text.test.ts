import { describe, it, expect } from 'vitest'
import { splitText } from './text'

describe('splitText', () => {
  it('none: returns the whole trimmed text as one line', () => {
    expect(splitText('  hello world  ', 'none')).toEqual(['hello world'])
    expect(splitText('   ', 'none')).toEqual([])
  })

  it('newline: splits on line breaks and drops empties', () => {
    expect(splitText('a\n\nb\n c ', 'newline')).toEqual(['a', 'b', 'c'])
  })

  it('comma: splits on ASCII and fullwidth commas and newlines', () => {
    expect(splitText('a, b，c\nd', 'comma')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('period: splits on sentence enders followed by space', () => {
    expect(splitText('One. Two! Three? Four… Five', 'period')).toEqual([
      'One.', 'Two!', 'Three?', 'Four…', 'Five',
    ])
  })

  it('period: does not split decimals (no space after the dot)', () => {
    expect(splitText('Pi is 3.14 today.', 'period')).toEqual(['Pi is 3.14 today.'])
  })

  it('empty input yields no lines for every mode', () => {
    for (const m of ['none', 'newline', 'comma', 'period'] as const) {
      expect(splitText('', m)).toEqual([])
    }
  })
})
