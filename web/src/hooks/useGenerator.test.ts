import { describe, it, expect, beforeAll, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGenerator, fmtTime, type GenItem } from './useGenerator'

// jsdom has no object-URL impl; the hook only needs them not to throw.
beforeAll(() => {
  // jsdom has no object-URL impl; the hook only needs them not to throw.
  URL.createObjectURL = vi.fn(() => 'blob:test') as any
  URL.revokeObjectURL = vi.fn(() => {}) as any
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const blob = () => new Blob(['x'], { type: 'audio/wav' })

describe('useGenerator', () => {
  it('runs all items and marks them done (concurrent=1)', async () => {
    const { result } = renderHook(() => useGenerator())
    const items: GenItem[] = ['a', 'b', 'c'].map(text => ({ text, build: async () => blob() }))

    await act(async () => { await result.current.start(items, 1) })

    expect(result.current.rows).toHaveLength(3)
    expect(result.current.rows.every(r => r.state === 'done')).toBe(true)
    expect(result.current.progress).toBe(100)
    expect(result.current.allDone).toBe(true)
  })

  it('never exceeds the requested concurrency', async () => {
    let active = 0, peak = 0
    const build = async () => {
      active++; peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 5))
      active--; return blob()
    }
    const items: GenItem[] = Array.from({ length: 6 }, (_, i) => ({ text: `l${i}`, build }))
    const { result } = renderHook(() => useGenerator())

    await act(async () => { await result.current.start(items, 2) })

    expect(peak).toBeLessThanOrEqual(2)
    expect(result.current.rows.every(r => r.state === 'done')).toBe(true)
  })

  it('stop() mid-flight drops the in-flight result to idle (not done)', async () => {
    const d = deferred<Blob>()
    const items: GenItem[] = [{ text: 'slow', build: () => d.promise }]
    const { result } = renderHook(() => useGenerator())

    let startPromise!: Promise<boolean>
    act(() => { startPromise = result.current.start(items, 1) })
    await waitFor(() => expect(result.current.rows[0]?.state).toBe('processing'))

    act(() => { result.current.stop() })
    await act(async () => { d.resolve(blob()); await startPromise })

    // The regression this guards: a stopped row must NOT resurrect to 'done'.
    expect(result.current.rows[0].state).toBe('idle')
    expect(result.current.running).toBe(false)
  })

  it('marks a failing build as error and retry() recovers it', async () => {
    let attempt = 0
    const items: GenItem[] = [{
      text: 'flaky',
      build: async () => { attempt++; if (attempt === 1) throw new Error('boom'); return blob() },
    }]
    const { result } = renderHook(() => useGenerator())

    await act(async () => { await result.current.start(items, 1) })
    expect(result.current.rows[0].state).toBe('error')
    expect(result.current.rows[0].error).toContain('boom')

    await act(async () => { await result.current.retry(1) })
    expect(result.current.rows[0].state).toBe('done')
  })

  it('start([]) is a no-op', async () => {
    const { result } = renderHook(() => useGenerator())
    let ret: boolean | undefined
    await act(async () => { ret = await result.current.start([], 1) })
    expect(ret).toBe(false)
    expect(result.current.rows).toHaveLength(0)
  })
})

describe('fmtTime', () => {
  it('formats seconds as MM:SS with rollover', () => {
    expect(fmtTime(0)).toBe('00:00')
    expect(fmtTime(65)).toBe('01:05')
    expect(fmtTime(4.2)).toBe('00:04')
  })
})
