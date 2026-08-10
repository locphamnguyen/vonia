/* Pure text helpers, extracted from the tabs so they are unit-testable. */

export type SplitMode = 'none' | 'newline' | 'comma' | 'period'

/**
 * Max characters per generated line. Any longer line is auto-wrapped (see
 * `softWrap`) so a single request never turns into one very long audio —
 * which would hold the GPU lock, spike VRAM, and risk OOM / quality drift.
 * This is what makes "no split" safe for huge pasted blocks.
 */
export const MAX_LINE_CHARS = 300

/**
 * Cap one line to `maxLen`, preferring to break at the last sentence/clause
 * mark (`.` or `,`) that fits in the window. Falls back to the last space, and
 * finally a hard cut, so a long run *without any punctuation* still gets split
 * instead of becoming a single oversized generation.
 */
export function softWrap(line: string, maxLen = MAX_LINE_CHARS): string[] {
  let s = line.trim()
  if (s.length <= maxLen) return s ? [s] : []
  const out: string[] = []
  while (s.length > maxLen) {
    const window = s.slice(0, maxLen)
    // Break right after the last '.' or ',' in the window (keep the mark).
    let cut = Math.max(window.lastIndexOf('.'), window.lastIndexOf(',')) + 1
    if (cut <= 0) {
      const sp = window.lastIndexOf(' ')
      cut = sp > 0 ? sp : maxLen   // no punctuation → break on a space, else hard cut
    }
    out.push(s.slice(0, cut).trim())
    s = s.slice(cut).trim()
  }
  if (s) out.push(s)
  return out
}

/**
 * Split a block of text into lines for per-line generation.
 *  - none:    whole text as one line
 *  - newline: split on line breaks
 *  - comma:   split on commas (ASCII + fullwidth) and line breaks
 *  - period:  split on sentence enders (.!?…) followed by space, and line breaks
 * Always trims each piece and drops empties. Finally, every resulting line is
 * capped to `MAX_LINE_CHARS` via `softWrap` (a safety net for all modes — most
 * importantly "none" with a long pasted block).
 */
export function splitText(text: string, mode: SplitMode): string[] {
  let lines: string[]
  if (mode === 'none') lines = [text.trim()].filter(Boolean)
  else if (mode === 'newline') lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean)
  else if (mode === 'comma') lines = text.split(/[,，]\s*|\n+/).map(x => x.trim()).filter(Boolean)
  else lines = text.split(/(?<=[.!?…])\s+|\n+/).map(x => x.trim()).filter(Boolean)
  return lines.flatMap(l => softWrap(l))
}
