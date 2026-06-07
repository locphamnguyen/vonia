/* Pronunciation normalization — text scanning, extracted so it is unit-testable.
   Finds tokens the TTS model is likely to mis-read (numbers with separators,
   percentages, currency/symbols, ALL-CAPS acronyms) and a short context snippet
   for each. See PronunciationModal for the UI/interaction contract. */

export interface Unknown { orig: string; context: string }

const TOKEN_RE = /\d+(?:[.,]\d+)*\s?%|\d+(?:[.,]\d+)+|[€$£¥₫°×÷±#@&]+|\b[A-Z]{2,}\b/g

/** Scan text for likely mis-read tokens. Returns up to 12 unique matches.
   Falls back to a demo set when the text yields nothing, so the dialog is
   always reviewable (mirrors the reference design). */
export function scanUnknowns(text: string): Unknown[] {
  const found: Unknown[] = []
  const seen = new Set<string>()
  if (text && text.trim()) {
    const re = new RegExp(TOKEN_RE)  // fresh lastIndex per call
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null && found.length < 12) {
      const tok = m[0].trim()
      if (seen.has(tok)) continue
      seen.add(tok)
      const start = Math.max(0, m.index - 26)
      const end = Math.min(text.length, m.index + tok.length + 12)
      let ctx = text.slice(start, end).replace(/\s+/g, ' ').trim()
      if (start > 0) ctx = '…' + ctx
      if (end < text.length) ctx = ctx + '…'
      found.push({ orig: tok, context: ctx })
    }
  }
  if (found.length) return found
  return [
    { orig: '8,6%', context: '…24 đạt 0,7955, tăng 8,6%.' },
    { orig: '18%', context: '…nh tế số chiếm trên 18% GDP, kỳ vọng vượt 2…' },
    { orig: '20%', context: '…% GDP, kỳ vọng vượt 20% năm 2025.' },
  ]
}
