import { describe, it, expect } from 'vitest'
import { mapParams, type GenSettings } from './api'

const base: GenSettings = {
  detail: 50, adherence: 2, speed: 1, pause: 300, proc: 'broadcast', normalize: true,
}

describe('mapParams', () => {
  it('maps detail 0..100 to num_step 16..48', () => {
    expect(mapParams({ ...base, detail: 0 }).num_step).toBe(16)
    expect(mapParams({ ...base, detail: 100 }).num_step).toBe(48)
    expect(mapParams({ ...base, detail: 50 }).num_step).toBe(32)
  })

  it('clamps out-of-range detail', () => {
    expect(mapParams({ ...base, detail: -20 }).num_step).toBe(16)
    expect(mapParams({ ...base, detail: 999 }).num_step).toBe(48)
  })

  it('guards against NaN/undefined from stale localStorage', () => {
    const bad = { ...base, detail: NaN, adherence: undefined as any, speed: undefined as any }
    const p = mapParams(bad)
    // detail defaults to 32 -> num_step = round(16 + (32/100)*32) = 26
    expect(p.num_step).toBe(26)
    expect(p.guidance_scale).toBe(2.0) // adherence default
    expect(p.speed).toBe(1.0)          // speed default
  })

  it('postprocess_output is false only for raw mode', () => {
    expect(mapParams({ ...base, proc: 'raw' }).postprocess_output).toBe(false)
    expect(mapParams({ ...base, proc: 'broadcast' }).postprocess_output).toBe(true)
  })

  it('passes normalize through as a boolean', () => {
    expect(mapParams({ ...base, normalize: true }).normalize).toBe(true)
    expect(mapParams({ ...base, normalize: false }).normalize).toBe(false)
  })
})
