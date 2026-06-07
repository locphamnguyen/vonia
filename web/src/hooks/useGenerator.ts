/* Real generation engine: runs a queue of items, each calling an async
   builder that returns an audio Blob, with bounded concurrency. */
import { useCallback, useEffect, useRef, useState } from 'react'

export type RowState = 'queued' | 'processing' | 'done' | 'error' | 'idle'

export interface GenItem {
  text: string
  time?: string
  char?: string
  build: () => Promise<Blob>   // performs the API call
}

export interface GenRow {
  id: number
  text: string
  time?: string
  char?: string
  state: RowState
  url?: string
  blob?: Blob
  error?: string
}

export function useGenerator() {
  const [rows, setRows] = useState<GenRow[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'run' | 'done' | 'err'>('idle')
  const cancelled = useRef(false)
  const builders = useRef<Record<number, () => Promise<Blob>>>({})
  const urls = useRef<string[]>([])

  const revokeAll = () => { urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = [] }
  useEffect(() => () => revokeAll(), [])

  const runOne = useCallback(async (id: number, build: () => Promise<Blob>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, state: 'processing' } : r))
    try {
      const blob = await build()
      // If the user stopped while this was in flight, don't resurrect the row to
      // 'done' (that made Stop look like a no-op). Drop the result, mark idle.
      if (cancelled.current) {
        setRows(rs => rs.map(r => r.id === id ? { ...r, state: 'idle' } : r))
        return false
      }
      const url = URL.createObjectURL(blob)
      urls.current.push(url)
      setRows(rs => rs.map(r => r.id === id ? { ...r, state: 'done', blob, url, error: undefined } : r))
      return true
    } catch (e: any) {
      if (cancelled.current) {
        setRows(rs => rs.map(r => r.id === id ? { ...r, state: 'idle' } : r))
        return false
      }
      setRows(rs => rs.map(r => r.id === id ? { ...r, state: 'error', error: String(e?.message || e) } : r))
      return false
    }
  }, [])

  const start = useCallback(async (items: GenItem[], concurrent = 1) => {
    if (!items || !items.length) return false
    cancelled.current = false
    revokeAll()
    const seeded: GenRow[] = items.map((it, i) => ({
      id: i + 1, text: it.text, time: it.time, char: it.char, state: 'queued',
    }))
    builders.current = {}
    items.forEach((it, i) => { builders.current[i + 1] = it.build })
    setRows(seeded); setRunning(true); setStatus('run'); setProgress(0)

    let done = 0
    const total = items.length
    const ids = seeded.map(r => r.id)
    let cursor = 0
    const worker = async () => {
      while (true) {
        if (cancelled.current) return
        const myIndex = cursor++
        if (myIndex >= ids.length) return
        const id = ids[myIndex]
        await runOne(id, builders.current[id])
        if (cancelled.current) return
        done++
        setProgress(Math.round((done / total) * 100))
      }
    }
    const pool = Array.from({ length: Math.max(1, Math.min(concurrent, total)) }, () => worker())
    await Promise.all(pool)
    setRunning(false)
    setStatus(cancelled.current ? 'idle' : 'done')
    return true
  }, [runOne])

  const stop = useCallback(() => {
    cancelled.current = true
    setRunning(false); setStatus('idle')
    setRows(rs => rs.map(r => (r.state === 'queued' || r.state === 'processing') ? { ...r, state: 'idle' } : r))
  }, [])

  const reset = useCallback(() => {
    cancelled.current = true; revokeAll()
    setRows([]); setProgress(0); setStatus('idle'); setRunning(false)
  }, [])

  const retry = useCallback(async (id: number) => {
    const build = builders.current[id]
    if (!build) return
    cancelled.current = false  // a prior stop() set this; retry is a fresh run
    await runOne(id, build)
  }, [runOne])

  return {
    rows, running, progress, status, start, stop, reset, retry,
    hasResults: rows.length > 0,
    allDone: rows.length > 0 && rows.every(r => r.state === 'done' || r.state === 'error'),
  }
}

export function fmtTime(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
