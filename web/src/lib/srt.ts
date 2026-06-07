/* SRT subtitle helpers — pure and unit-testable.
   The timing comes from the real measured duration of each generated clip
   (see measureDuration in the tab), not a fixed per-line estimate. */

export interface SrtEntry { text: string; dur: number }  // dur in seconds

/** Format seconds as an SRT timestamp: HH:MM:SS,mmm (hours roll over correctly). */
export function srtTimestamp(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const milli = ms % 1000
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)},${p(milli, 3)}`
}

/** Build an SRT document from entries, accumulating real durations. */
export function buildSrt(entries: SrtEntry[]): string {
  let cursor = 0
  return entries.map((e, i) => {
    const start = cursor
    const end = cursor + Math.max(0, e.dur)
    cursor = end
    return `${i + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${e.text}\n`
  }).join('\n')
}
