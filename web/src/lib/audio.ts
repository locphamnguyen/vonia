/* Client-side audio helpers shared by desktop and mobile. */

/** Save a Blob to the user's device under `name`. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Concatenate several PCM-WAV clips into one WAV, entirely client-side.
 * All clips come from the same engine (mono PCM16 @ 24kHz), so they share a
 * format; we parse each file's `fmt `/`data` chunks, append the PCM samples, and
 * write a fresh header. Instant (no GPU re-render) and bit-identical to the
 * source clips — and, crucially for the Dialogue tab, it preserves each line's
 * own voice (a single re-render could only use one voice).
 */
export async function mergeWavBlobs(blobs: Blob[]): Promise<Blob> {
  const bufs = await Promise.all(blobs.map(b => b.arrayBuffer()))
  const parse = (buf: ArrayBuffer) => {
    const dv = new DataView(buf)
    let off = 12 // skip "RIFF"<size>"WAVE"
    let fmt = { channels: 1, rate: 24000, bits: 16 }
    let data = new Uint8Array(0)
    while (off + 8 <= dv.byteLength) {
      const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3))
      const size = dv.getUint32(off + 4, true)
      if (id === 'fmt ') {
        fmt = { channels: dv.getUint16(off + 10, true), rate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) }
      } else if (id === 'data') {
        const len = Math.min(size, dv.byteLength - (off + 8))
        data = new Uint8Array(buf, off + 8, len)
      }
      off += 8 + size + (size & 1) // chunks are word-aligned
    }
    return { fmt, data }
  }
  const parts = bufs.map(parse).filter(p => p.data.length > 0)
  const fmt = parts[0]?.fmt ?? { channels: 1, rate: 24000, bits: 16 }
  const total = parts.reduce((n, p) => n + p.data.length, 0)
  const out = new Uint8Array(44 + total)
  const dv = new DataView(out.buffer)
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  const blockAlign = fmt.channels * fmt.bits / 8
  ascii(0, 'RIFF'); dv.setUint32(4, 36 + total, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true)
  dv.setUint16(22, fmt.channels, true); dv.setUint32(24, fmt.rate, true)
  dv.setUint32(28, fmt.rate * blockAlign, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, fmt.bits, true)
  ascii(36, 'data'); dv.setUint32(40, total, true)
  let pos = 44
  for (const p of parts) { out.set(p.data, pos); pos += p.data.length }
  return new Blob([out], { type: 'audio/wav' })
}
