/* Dialogue voice consistency.
 *
 * Preset ("instruct") voices are voice-DESIGN: the model invents a voice that
 * fits the description, and a different line (different text) yields a slightly
 * different voice even with the same seed. In a multi-speaker dialogue that
 * makes one character drift across their lines — so a 2-role script can come
 * out sounding like 3-4 people.
 *
 * Fix: synthesize ONE short anchor clip per character (seeded, so it's stable
 * across runs), then CLONE every one of that character's lines from that anchor.
 * Cloning locks the timbre, so each role keeps exactly one voice. Characters
 * already assigned a cloned voice (a registered voiceId) are consistent by
 * nature and skip the anchor. */
import * as api from './api'

const ANCHOR_TEXT: Record<string, string> = {
  vi: 'Xin chào, đây là giọng đọc của tôi trong đoạn hội thoại này.',
  en: 'Hello, this is my reading voice for this dialogue.',
}
export const anchorText = (langCode: string) => ANCHOR_TEXT[langCode] || ANCHOR_TEXT.en

/** Per-character voice source: a registered clone (voiceId), an anchor clip to
 *  clone from (ref/refText), or — only if the anchor failed — raw instruct+seed. */
export interface CastVoice { voiceId?: string; ref?: File; refText?: string; instruct?: string; seed?: number }

export async function buildCastVoices(
  chars: string[],
  voiceOf: (char: string) => string | undefined,
  resolve: (name: string) => { voiceId?: string; instruct?: string; seed?: number },
  langName: string | undefined,   // language value sent to the API (e.g. "Vietnamese")
  langCode: string,               // 'vi' | 'en' … for the anchor phrase
  settings: any,
): Promise<Record<string, CastVoice>> {
  const out: Record<string, CastVoice> = {}
  for (const ch of chars) {
    const va = resolve(voiceOf(ch) || 'Achird')
    if (va.voiceId) { out[ch] = { voiceId: va.voiceId }; continue }   // cloned voice: already stable
    const text = anchorText(langCode)
    try {
      const blob = await api.tts({ text, language: langName, instruct: va.instruct, seed: va.seed, settings, format: 'wav' })
      out[ch] = { ref: new File([blob], 'anchor.wav', { type: 'audio/wav' }), refText: text }
    } catch {
      out[ch] = { instruct: va.instruct, seed: va.seed }   // fallback: at least seeded
    }
  }
  return out
}
