import { describe, it, expect } from 'vitest'
import { srtTimestamp, buildSrt } from './srt'

describe('srtTimestamp', () => {
  it('formats HH:MM:SS,mmm', () => {
    expect(srtTimestamp(0)).toBe('00:00:00,000')
    expect(srtTimestamp(4.2)).toBe('00:00:04,200')
    expect(srtTimestamp(65)).toBe('00:01:05,000')
  })

  it('rolls over past one hour (the old MM:SS bug)', () => {
    expect(srtTimestamp(3661.5)).toBe('01:01:01,500')
  })

  it('never goes negative', () => {
    expect(srtTimestamp(-5)).toBe('00:00:00,000')
  })
})

describe('buildSrt', () => {
  it('accumulates real durations into sequential cues', () => {
    const out = buildSrt([
      { text: 'one', dur: 2 },
      { text: 'two', dur: 3.5 },
    ])
    expect(out).toBe(
      '1\n00:00:00,000 --> 00:00:02,000\none\n' +
      '\n' +
      '2\n00:00:02,000 --> 00:00:05,500\ntwo\n',
    )
  })

  it('handles an empty list', () => {
    expect(buildSrt([])).toBe('')
  })
})
