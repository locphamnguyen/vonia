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

/** Map the design's abstract sliders to OmniVoice generation params.
   Guards against stale/undefined settings (e.g. localStorage from an older
   build missing `detail`) which would otherwise yield NaN and a 422. */
export function mapParams(s: GenSettings) {
  const detail = Number.isFinite(s.detail) ? s.detail : 32
  const adherence = Number.isFinite(s.adherence) ? s.adherence : 2.0
  const speed = Number.isFinite(s.speed) ? s.speed : 1.0
  return {
    num_step: Math.round(16 + (Math.max(0, Math.min(100, detail)) / 100) * 32), // 16..48
    guidance_scale: adherence,
    speed,
    normalize: !!s.normalize,
    postprocess_output: s.proc !== 'raw',
  }
}

async function asError(res: Response): Promise<never> {
  if (res.status === 401) {
    window.location.href = '/auth/login'
    return new Promise(() => {}) as never
  }
  let msg = `HTTP ${res.status}`
  try {
    const j = await res.json()
    if (res.status === 403 && j?.error?.type === 'ACCOUNT_PENDING') {
      window.location.href = '/auth/pending'
      return new Promise(() => {}) as never
    }
    msg = j?.error?.message || j?.detail || msg
  } catch { /* ignore */ }
  throw new Error(msg)
}

export type UserStatus = 'active' | 'pending' | 'disabled'
export interface MeInfo {
  email: string; sub: string; full_name: string; is_admin: boolean; status: UserStatus
}
export interface MemberRecord {
  email: string; full_name: string; status: UserStatus; is_admin: boolean
  providers: string[]; email_verified: boolean; has_password: boolean
  created_at: number; approved_by: string; approved_at: number
}
export type MemberAction = 'approve' | 'disable' | 'make_admin' | 'revoke_admin' | 'delete'

export async function getMe(): Promise<MeInfo> {
  const res = await fetch(`${API_BASE}/auth/me`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function listMembers(): Promise<{ users: MemberRecord[]; pending: number }> {
  const res = await fetch(`${API_BASE}/admin/users`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function memberAction(email: string, action: MemberAction): Promise<MemberRecord | null> {
  const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(email)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  })
  if (!res.ok) await asError(res)
  return (await res.json()).user
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

export interface VramStatus {
  device: string
  supported: boolean      // false on CPU/MPS — auto-release is a no-op there
  idle_minutes: number    // 0 = never (model stays resident)
  offloaded: boolean      // true while the model is parked on CPU (VRAM freed)
  vram: { free_mb: number; used_mb: number; total_mb: number } | null
}

export async function getVram(): Promise<VramStatus> {
  const res = await fetch(`${API_BASE}/v1/vram`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function setVramIdle(idle_minutes: number): Promise<VramStatus> {
  const res = await fetch(`${API_BASE}/v1/vram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idle_minutes }),
  })
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
  seed?: number | null        // stable seed → deterministic, distinct design voice
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
    if (a.seed != null) fd.append('seed', String(a.seed))
    fd.append('normalize', String(p.normalize))
    fd.append('num_step', String(p.num_step))
    fd.append('guidance_scale', String(p.guidance_scale))
    fd.append('speed', String(p.speed))
    fd.append('postprocess_output', String(p.postprocess_output))
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
  if (a.seed != null) body.seed = a.seed
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) await asError(res)
  return res.blob()
}

// ----------------------------------------------------------------- payments
export interface PaymentConfig {
  configured: boolean; method: 'qr' | 'gateway' | null
  qr_enabled: boolean; gateway_enabled: boolean
  env: string; public_url: string; currency: string
}
export interface QrInfo {
  invoice_number: string; amount: number; currency: string; qr_url: string
  bank_account: string; bank_code: string; bank_name: string; content: string; plan_id: string
}
export interface Plan { id: string; name: string; amount: number; currency: string; days: number; desc_vi: string; desc_en: string }
export interface Subscription {
  plan_id: string | null; status: string; expires_at: string | null
  updated_at: string; active: boolean; days_left: number
}
export interface Order {
  invoice_number: string; plan_id: string; amount: number; currency: string
  payment_method: string; customer_id: string; status: string; created: string
  paid_at: string | null; sepay_order_id: string | null
  sepay_transaction_id: string | null; description: string | null
}
export interface CheckoutResponse { checkout_url: string; fields: Record<string, string>; invoice_number: string }

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const res = await fetch(`${API_BASE}/payment/config`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function getPlans(): Promise<Plan[]> {
  const res = await fetch(`${API_BASE}/payment/plans`)
  if (!res.ok) await asError(res)
  return (await res.json()).plans
}

export async function getSubscription(): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/payment/subscription`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function getOrder(invoiceNumber: string): Promise<Order> {
  const res = await fetch(`${API_BASE}/payment/order/${encodeURIComponent(invoiceNumber)}`)
  if (!res.ok) await asError(res)
  return res.json()
}

export async function createCheckout(planId: string, paymentMethod: string): Promise<CheckoutResponse> {
  const res = await fetch(`${API_BASE}/payment/checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: planId, payment_method: paymentMethod }),
  })
  if (!res.ok) await asError(res)
  return res.json()
}

export async function createQr(planId: string): Promise<QrInfo> {
  const res = await fetch(`${API_BASE}/payment/qr`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: planId }),
  })
  if (!res.ok) await asError(res)
  return res.json()
}

/** Build a hidden form from the signed SePay fields and POST it as a top-level
   navigation, sending the browser to SePay's hosted payment page. */
export function redirectToCheckout(co: CheckoutResponse): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = co.checkout_url
  form.style.display = 'none'
  for (const [k, v] of Object.entries(co.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'; input.name = k; input.value = v
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
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

// ── API key cho công cụ ngoài (key nguyên văn chỉ trả về MỘT lần lúc tạo) ──
export interface ApiKeyRecord {
  id: string; name: string; hint: string; owner: string; created_at: number; last_used_at: number
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const res = await fetch(`${API_BASE}/account/api-keys`)
  if (!res.ok) await asError(res)
  return (await res.json()).keys
}

export async function createApiKey(name: string): Promise<{ key: string; record: ApiKeyRecord }> {
  const res = await fetch(`${API_BASE}/account/api-keys`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
  if (!res.ok) await asError(res)
  return res.json()
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/account/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) await asError(res)
}
