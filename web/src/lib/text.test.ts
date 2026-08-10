import { describe, it, expect } from 'vitest'
import { splitText, softWrap, MAX_LINE_CHARS } from './text'

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

  it('caps every line at MAX_LINE_CHARS regardless of mode', () => {
    const long = 'word '.repeat(200).trim()  // 999 chars, no . or ,
    for (const m of ['none', 'newline', 'comma', 'period'] as const) {
      const lines = splitText(long, m)
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.every(l => l.length <= MAX_LINE_CHARS)).toBe(true)
    }
  })

  it('none: long paragraph is wrapped, breaking at . or ,', () => {
    const text =
      'The report is the last thing Claude writes in the video. Before that comes the gathering: the same information is scattered across your email, calendar, and project tracker, and every week Claude pulls it together into a rough first draft for you to review and finish in Cowork. That information gathering process is the same every week, no matter what the report says.'
    const lines = splitText(text, 'none')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(l => l.length <= MAX_LINE_CHARS)).toBe(true)
    // Each non-final line ends at a sentence/clause mark.
    expect(lines.slice(0, -1).every(l => /[.,]$/.test(l))).toBe(true)
    // No content is lost (ignoring whitespace differences).
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '))
  })
})

describe('softWrap', () => {
  it('returns the line unchanged when within the limit', () => {
    expect(softWrap('short line')).toEqual(['short line'])
    expect(softWrap('   ')).toEqual([])
  })

  it('breaks at the last comma or period within the window, keeping the mark', () => {
    const out = softWrap('aaaa, bbbb, cccc', 10)
    expect(out).toEqual(['aaaa,', 'bbbb, cccc'])
    expect(out[0].endsWith(',')).toBe(true)
  })

  it('falls back to a space when there is no . or , in the window', () => {
    expect(softWrap('aaaa bbbb cccc dddd', 10)).toEqual(['aaaa bbbb', 'cccc dddd'])
  })

  it('hard-cuts a punctuation-free, space-free run', () => {
    const out = softWrap('x'.repeat(25), 10)
    expect(out).toEqual(['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx'])
    expect(out.every(l => l.length <= 10)).toBe(true)
  })
})
