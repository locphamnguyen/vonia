/* Pure text helpers, extracted from the tabs so they are unit-testable. */

export type SplitMode = 'none' | 'newline' | 'comma' | 'period'

/**
 * Split a block of text into lines for per-line generation.
 *  - none:    whole text as one line
 *  - newline: split on line breaks
 *  - comma:   split on commas (ASCII + fullwidth) and line breaks
 *  - period:  split on sentence enders (.!?…) followed by space, and line breaks
 * Always trims each piece and drops empties.
 */
export function splitText(text: string, mode: SplitMode): string[] {
  if (mode === 'none') return [text.trim()].filter(Boolean)
  if (mode === 'newline') return text.split(/\n+/).map(x => x.trim()).filter(Boolean)
  if (mode === 'comma') return text.split(/[,，]\s*|\n+/).map(x => x.trim()).filter(Boolean)
  return text.split(/(?<=[.!?…])\s+|\n+/).map(x => x.trim()).filter(Boolean)
}
