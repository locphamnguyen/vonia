/* OmniVoice API client. Same-origin in production (UI mounted at '/'),
   proxied to :8002 in dev (see vite.config.ts). */

export const API_BASE = ''

export interface GenSettings {
  detail: number       // 0..100
  adherence: number    // 0.5..5
  speed: number        // 0.5..2
  pause?: number
  proc: string         // broadcast|cinema|podcast|raw|warm|bright
  normalize: boolean
  concurrent?: number
}

export interface Preset {
  id: string; name: string; gender: string; instruct: string; desc_vi: string; desc_en: string
}
export interface VoiceRecord { id: string; name: string; has_ref_text: boolean; created: string }
export interface SttSegment { start: number | null; end: number | null; text: string }
export interface SttResult { text: string; segments: SttSegment[] }

/** Map the design's abstract sliders to OmniVoice generation params. */
export function mapParams(s: GenSettings) {
  return {
    num_step: Math.round(16 + (Math.max(0, Math.min(100, s.detail)) / 100) * 32), // 16..48
    guidance_scale: s.adherence,
    speed: s.speed,
    normalize: !!s.normalize,
    postprocess_output: s.proc !== 'raw',
  }
}

async function asError(res: Response): Promise<never> {
  let msg = `HTTP ${res.status}`
  try {
    const j = await res.json()
    msg = j?.error?.message || j?.detail || msg
  } catch { /* ignore */ }
  throw new Error(msg)
}

export async function health(): Promise<any> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function info(): Promise<any> {
  const res = await fetch(`${API_BASE}/v1/info`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function getPresets(): Promise<Preset[]> {
  const res = await fetch(`${API_BASE}/v1/presets`)
  if (!res.ok) await asError(res)
  return (await res.json()).presets
}

export async function listVoices(): Promise<VoiceRecord[]> {
  const res = await fetch(`${API_BASE}/v1/voices`)
  if (!res.ok) await asError(res)
  return (await res.json()).voices
}

export async function deleteVoice(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/voices/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) await asError(res)
}

export async function registerVoice(name: string, file: File, refText?: string,
                                    overwrite = false): Promise<VoiceRecord> {
  const fd = new FormData()
  fd.append('name', name)
  fd.append('file', file)
  if (refText) fd.append('ref_text', refText)
  fd.append('overwrite', String(overwrite))
  const res = await fetch(`${API_BASE}/v1/voices`, { method: 'POST', body: fd })
  if (!res.ok) await asError(res)
  return res.json()
}

export interface TtsArgs {
  text: string
  language?: string | null
  voiceId?: string | null     // registered voice
  instruct?: string | null    // voice design (presets / random)
  refAudioFile?: File | null   // ephemeral clone
  refText?: string | null
  settings: GenSettings
  format?: 'wav' | 'mp3' | 'pcm'
}

/** Synthesize one line; returns an audio Blob. */
export async function tts(a: TtsArgs): Promise<Blob> {
  const fmt = a.format || 'wav'
  const p = mapParams(a.settings)
  if (a.refAudioFile) {
    // ephemeral clone via multipart upload
    const fd = new FormData()
    fd.append('text', a.text)
    fd.append('file', a.refAudioFile)
    if (a.language) fd.append('language', a.language)
    if (a.refText) fd.append('ref_text', a.refText)
    fd.append('normalize', String(p.normalize))
    fd.append('num_step', String(p.num_step))
    fd.append('guidance_scale', String(p.guidance_scale))
    fd.append('speed', String(p.speed))
    fd.append('response_format', fmt)
    const res = await fetch(`${API_BASE}/tts/upload`, { method: 'POST', body: fd })
    if (!res.ok) await asError(res)
    return res.blob()
  }
  const body: any = {
    text: a.text,
    language: a.language || undefined,
    response_format: fmt,
    ...p,
  }
  if (a.voiceId) body.voice_id = a.voiceId
  else if (a.instruct) body.instruct = a.instruct
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) await asError(res)
  return res.blob()
}

export async function stt(file: File, model: string, language?: string): Promise<SttResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('model', model)
  if (language && language !== 'auto') fd.append('language', language)
  const res = await fetch(`${API_BASE}/v1/stt`, { method: 'POST', body: fd })
  if (!res.ok) await asError(res)
  return res.json()
}
