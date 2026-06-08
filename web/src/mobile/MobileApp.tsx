/* Mobile app shell — rendered in place of the desktop layout on small screens.
   Bottom-tab navigation (Clone · TTS · STT · Settings) + a payment bottom-sheet.
   Ported from the design's mobile.jsx; screens are wired to the real API
   (generation, transcription, SePay QR) rather than the prototype's mocks. */
import React, { useEffect, useRef, useState } from 'react'
import { Icon, Select, useToast } from '../components/ui'
import { DEFAULTS } from '../components/panels'
import { t, type Lang } from '../lib/i18n'
import { VOICES, LANG_NAME, LANGUAGES } from '../lib/data'
import { useVoices } from '../app/store'
import { useGenerator, type GenRow } from '../hooks/useGenerator'
import { splitText } from '../lib/text'
import * as api from '../lib/api'

/* compact decorative QR — fallback when SePay isn't configured */
function MQR({ size = 240 }: { size?: number }) {
  const N = 27, cell = size / N, dark = '#0b0e16'
  const fnd = (r: number, c: number) => { const b = (br: number, bc: number) => r >= br && r < br + 7 && c >= bc && c < bc + 7; return b(0, 0) || b(0, N - 7) || b(N - 7, 0) }
  const on = (r: number, c: number) => { const x = Math.sin(r * 12.9898 + c * 78.233) * 43758.5; return (x - Math.floor(x)) > 0.52 }
  const rects: React.ReactNode[] = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (fnd(r, c)) continue
    if (r >= 10 && r <= 16 && c >= 10 && c <= 16) continue
    if (on(r, c)) rects.push(<rect key={r + '_' + c} x={(c * cell).toFixed(1)} y={(r * cell).toFixed(1)} width={cell + 0.4} height={cell + 0.4} fill={dark} />)
  }
  const finder = (br: number, bc: number, k: string) => (<g key={k}><rect x={bc * cell} y={br * cell} width={7 * cell} height={7 * cell} rx={cell} fill={dark} /><rect x={(bc + 1) * cell} y={(br + 1) * cell} width={5 * cell} height={5 * cell} rx={cell * .7} fill="#fff" /><rect x={(bc + 2) * cell} y={(br + 2) * cell} width={3 * cell} height={3 * cell} rx={cell * .5} fill={dark} /></g>)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: 'block' }}>
      {rects}{finder(0, 0, 'a')}{finder(0, N - 7, 'b')}{finder(N - 7, 0, 'c')}
      <g transform={`translate(${size / 2},${size / 2})`}>
        <rect x={-cell * 3.2} y={-cell * 3.2} width={cell * 6.4} height={cell * 6.4} rx={cell * 1.3} fill="#fff" />
        <path d={`M${-cell * 2.2} ${-cell * 1.9} L0 ${cell * 2.4} L${cell * 2.2} ${-cell * 1.9} L${cell} ${-cell * 1.9} L0 ${cell * .3} L${-cell} ${-cell * 1.9} Z`} fill="#e0322f" />
      </g>
    </svg>
  )
}

/* One shared audio element per screen for previewing generated clips. */
function useAudio() {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [cur, setCur] = useState<string | null>(null)
  useEffect(() => () => { ref.current?.pause() }, [])
  const play = (url: string) => {
    if (!ref.current) ref.current = new Audio()
    const a = ref.current
    if (cur === url) { a.pause(); setCur(null); return }
    a.src = url; a.onended = () => setCur(null); a.play().catch(() => {}); setCur(url)
  }
  return { play, cur }
}

function VoicePicker({ lang, voices, sel, onSelect }:
  { lang: Lang; voices: { name: string; vi?: string; en?: string }[]; sel: string; onSelect: (n: string) => void }) {
  const toast = useToast()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {voices.map(v => (
        <div key={v.name} className={'m-vrow' + (sel === v.name ? ' sel' : '')} onClick={() => onSelect(v.name)}>
          <Icon name="star" size={15} className="m-star" />
          <div style={{ flex: 1, minWidth: 0 }}><div className="m-vname">{v.name}</div><div className="m-vdesc">{lang === 'en' ? v.en : v.vi}</div></div>
          <button className="m-vplay" onClick={e => { e.stopPropagation(); toast({ kind: 'info', title: t(lang, 'm_previewing') }) }}><Icon name="play" size={13} fill /></button>
        </div>
      ))}
    </div>
  )
}

function ResultRows({ lang, rows, audio }: { lang: Lang; rows: GenRow[]; audio: ReturnType<typeof useAudio> }) {
  return (
    <>
      {rows.map(r => (
        <div key={r.id} className="m-result">
          <button className="m-vplay" disabled={!r.url} onClick={() => r.url && audio.play(r.url)}>
            <Icon name={audio.cur === r.url ? 'pause' : 'play'} size={13} fill />
          </button>
          <span className="m-rtext">{r.text}</span>
          {r.state === 'done'
            ? <span className="m-status"><Icon name="check" size={13} />{t(lang, 'done_status')}</span>
            : r.state === 'error'
              ? <span className="m-status" style={{ color: 'var(--bad)' }}><Icon name="warn" size={13} />{t(lang, 'failed')}</span>
              : <span className="m-status" style={{ color: 'var(--text-muted)' }}><Icon name="loader" size={13} />{t(lang, 'processing')}</span>}
        </div>
      ))}
    </>
  )
}

/* ---------- Screens ---------- */
function CloneScreen({ lang }: { lang: Lang }) {
  const toast = useToast()
  const gen = useGenerator()
  const audio = useAudio()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sample, setSample] = useState('')
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('vi')

  const aiSuggest = async () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_sample_first') }); return }
    toast({ kind: 'info', title: t(lang, 'transcribing_sample') })
    try { const r = await api.stt(file, 'turbo'); setSample(r.text); toast({ kind: 'good', title: t(lang, 'transcript_filled') }) }
    catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
  }
  const start = async () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_sample_audio') }); return }
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'enter_preview_text') }); return }
    toast({ kind: 'info', title: t(lang, 'cloning_voice') })
    await gen.start([{ text: text.slice(0, 350), build: () => api.tts({ text: text.slice(0, 350), language: LANG_NAME[language], refAudioFile: file, refText: sample || undefined, settings: DEFAULTS, format: 'wav' }) }], 1)
  }

  return (
    <>
      <div className="m-screen">
        <div className="m-h1">{t(lang, 'tab_clone')}<span className="m-h1sub">{t(lang, 'm_clone_sub')}</span></div>

        <div className="m-card">
          <div className="m-label"><Icon name="audio" size={14} />{t(lang, 'sample_audio')}</div>
          <input ref={fileRef} type="file" accept="audio/*,video/*" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
          <div className={'m-drop' + (file ? ' filled' : '')} onClick={() => fileRef.current?.click()}>
            <Icon name="audio" size={17} style={file ? { color: 'var(--accent)' } : undefined} />
            <span>{file ? file.name : t(lang, 'm_tap_file')}</span>
          </div>
        </div>

        <div className="m-card">
          <div className="m-between" style={{ marginBottom: 9 }}>
            <span className="m-label" style={{ margin: 0 }}>{t(lang, 'sample_text')} <span className="req">({t(lang, 'required')})</span></span>
            <button className="m-btn ghost" style={{ width: 'auto', padding: '5px 9px', fontSize: 12 }} onClick={aiSuggest}><Icon name="sparkles" size={13} style={{ color: 'var(--accent)' }} />{t(lang, 'ai_suggest')}</button>
          </div>
          <textarea className="m-textarea" rows={3} value={sample} onChange={e => setSample(e.target.value)} placeholder={t(lang, 'm_sample_ph')} />
        </div>

        <div className="m-card">
          <div className="m-label"><Icon name="globe" size={14} />{t(lang, 'language')}</div>
          <Select value={language} onChange={setLanguage} width="100%" options={LANGUAGES.map(l => ({ value: l.id, label: `${l.flag} ${l.label}` }))} />
        </div>

        <div className="m-card">
          <div className="m-between" style={{ marginBottom: 9 }}>
            <span className="m-label" style={{ margin: 0 }}><Icon name="type" size={14} />{t(lang, 'text_content')}</span>
            <span className="m-count">{text.length}/350</span>
          </div>
          <textarea className="m-textarea" rows={2} maxLength={350} value={text} onChange={e => setText(e.target.value)} placeholder={t(lang, 'm_short_ph')} />
        </div>

        <div className="m-card">
          <div className="m-label" style={{ marginBottom: 12 }}><Icon name="library" size={14} />{t(lang, 'm_result')}</div>
          {gen.hasResults ? <ResultRows lang={lang} rows={gen.rows} audio={audio} /> : (
            <div className="m-empty"><div className="m-eart"><Icon name="audio" size={26} /></div><div style={{ fontSize: 13.5 }}>{t(lang, 'no_audio')}</div></div>
          )}
        </div>
      </div>
      <div className="m-cta"><button className="m-btn primary" disabled={gen.running} onClick={start}><Icon name="play" size={16} fill />{t(lang, 'start')}</button></div>
    </>
  )
}

function TtsScreen({ lang }: { lang: Lang }) {
  const toast = useToast()
  const store = useVoices()
  const gen = useGenerator()
  const audio = useAudio()
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('Achird')
  const [language, setLanguage] = useState('vi')
  const voices = [...store.userUIVoices, ...VOICES].slice(0, 6)

  const start = () => {
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'enter_text_first') }); return }
    const lines = splitText(text, 'period')
    const va = store.resolve(voice)
    gen.start(lines.map(l => ({ text: l, build: () => api.tts({ text: l, language: LANG_NAME[language], voiceId: va.voiceId, instruct: va.instruct, settings: DEFAULTS, format: 'wav' }) })), 1)
    toast({ kind: 'info', title: t(lang, 'generating_lines').replace('{n}', String(lines.length)) })
  }

  return (
    <>
      <div className="m-screen">
        <div className="m-h1">{t(lang, 'tab_tts')}<span className="m-h1sub">{t(lang, 'm_tts_sub')}</span></div>

        <div className="m-card">
          <div className="m-label"><Icon name="globe" size={14} />{t(lang, 'language')}</div>
          <Select value={language} onChange={setLanguage} width="100%" options={LANGUAGES.map(l => ({ value: l.id, label: `${l.flag} ${l.label}` }))} />
        </div>

        <div className="m-card">
          <div className="m-label"><Icon name="mic" size={14} />{t(lang, 'voice')}</div>
          <VoicePicker lang={lang} voices={voices} sel={voice} onSelect={setVoice} />
        </div>

        <div className="m-card">
          <div className="m-between" style={{ marginBottom: 9 }}>
            <span className="m-label" style={{ margin: 0 }}><Icon name="type" size={14} />{t(lang, 'text_content')}</span>
            <span className="m-count">{text.length} {t(lang, 'chars')}</span>
          </div>
          <textarea className="m-textarea" rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={t(lang, 'm_tts_ph')} />
        </div>

        {gen.hasResults && (
          <div className="m-card">
            <div className="m-label" style={{ marginBottom: 12 }}><Icon name="library" size={14} />{t(lang, 'm_result')}</div>
            <ResultRows lang={lang} rows={gen.rows} audio={audio} />
          </div>
        )}
      </div>
      <div className="m-cta"><button className="m-btn primary" disabled={gen.running} onClick={start}><Icon name="play" size={16} fill />{t(lang, 'start')}</button></div>
    </>
  )
}

function SttScreen({ lang }: { lang: Lang }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)

  const transcribe = async () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_file_first') }); return }
    setBusy(true); toast({ kind: 'info', title: t(lang, 'm_transcribing') })
    try { const r = await api.stt(file, 'turbo'); setTranscript(r.text); toast({ kind: 'good', title: t(lang, 'transcription_complete') }) }
    catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="m-screen">
        <div className="m-h1">{t(lang, 'tab_stt')}<span className="m-h1sub">{t(lang, 'm_stt_sub')}</span></div>

        <div className="m-card">
          <div className="m-label"><Icon name="audio" size={14} />{t(lang, 'm_audio_file')}</div>
          <input ref={fileRef} type="file" accept="audio/*,video/*" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
          <div className={'m-drop' + (file ? ' filled' : '')} onClick={() => fileRef.current?.click()}>
            <Icon name="audio" size={17} style={file ? { color: 'var(--accent)' } : undefined} />
            <span>{file ? file.name : t(lang, 'm_tap_file')}</span>
          </div>
          <div className="m-seg" style={{ marginTop: 12 }}>
            <button className="on"><Icon name="upload" size={14} />{t(lang, 'm_upload')}</button>
            <button onClick={() => toast({ kind: 'info', title: t(lang, 'm_recording') })}><Icon name="mic" size={14} />{t(lang, 'm_record')}</button>
          </div>
        </div>

        <div className="m-card">
          <div className="m-label" style={{ marginBottom: 12 }}><Icon name="filetext" size={14} />{t(lang, 'm_transcript')}</div>
          {transcript
            ? <div className="m-textarea" style={{ whiteSpace: 'pre-wrap', minHeight: 80 }}>{transcript}</div>
            : <div className="m-empty"><div className="m-eart"><Icon name="filetext" size={26} /></div><div style={{ fontSize: 13.5 }}>{t(lang, 'm_no_transcript')}</div></div>}
        </div>
      </div>
      <div className="m-cta"><button className="m-btn primary" disabled={busy} onClick={transcribe}><Icon name="sparkles" size={16} />{t(lang, 'm_transcribe')}</button></div>
    </>
  )
}

function SettingsScreen({ lang, setLang, onPay }: { lang: Lang; setLang: (l: Lang) => void; onPay: () => void }) {
  const toast = useToast()
  return (
    <div className="m-screen" style={{ paddingBottom: 100 }}>
      <div className="m-h1">{t(lang, 'nav_settings')}</div>

      <div className="m-upsell">
        <div className="m-uptag"><Icon name="bolt" size={12} style={{ verticalAlign: '-2px' }} /> {t(lang, 'plan_studio')}</div>
        <div className="m-upprice">100.000đ <small>{t(lang, 'per_days')}</small></div>
        <button className="m-btn primary" onClick={onPay}><Icon name="bolt" size={16} />{t(lang, 'upgrade_now')}</button>
      </div>

      <div className="m-list">
        <div className="m-li"><span className="m-lic"><Icon name="user" size={16} /></span><div className="grow"><div className="m-lit">{t(lang, 'user')}</div><div className="m-lid">{t(lang, 'guest')}</div></div><button className="m-btn" style={{ width: 'auto', padding: '8px 12px', fontSize: 12.5 }} onClick={() => toast({ kind: 'good', title: t(lang, 'signed_in_toast') })}>{t(lang, 'sign_in_google')}</button></div>
        <div className="m-li"><span className="m-lic"><Icon name="globe" size={16} /></span><div className="grow"><div className="m-lit">{t(lang, 'interface_lang')}</div></div>
          <div className="m-seg" style={{ width: 120 }}>
            <button className={lang === 'vi' ? 'on' : ''} onClick={() => setLang('vi')}>VI</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
        <div className="m-li"><span className="m-lic"><Icon name="file" size={16} /></span><div className="grow"><div className="m-lit">{t(lang, 'file_naming')}</div><div className="m-lid">1_Xin_chao.wav</div></div><Icon name="chevright" size={15} className="faint" /></div>
        <div className="m-li"><span className="m-lic"><Icon name="filetext" size={16} /></span><div className="grow"><div className="m-lit">{t(lang, 'tab_logs')}</div></div><Icon name="chevright" size={15} className="faint" /></div>
      </div>

      <div className="m-list">
        <div className="m-li"><span className="m-lic"><Icon name="discord" size={16} /></span><div className="grow"><div className="m-lit">Discord</div></div><Icon name="chevright" size={15} className="faint" /></div>
        <div className="m-li"><span className="m-lic"><Icon name="youtube" size={16} /></span><div className="grow"><div className="m-lit">YouTube</div></div><Icon name="chevright" size={15} className="faint" /></div>
      </div>
      <div className="m-muted" style={{ textAlign: 'center', marginTop: 4 }}>Vonia Voice Studio · v2.4</div>
    </div>
  )
}

/* ---------- Payment bottom sheet ---------- */
function PaySheet({ lang, onClose, onPaid }: { lang: Lang; onClose: () => void; onPaid: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState('bank')
  const [cfg, setCfg] = useState<api.PaymentConfig | null>(null)
  const [qr, setQr] = useState<api.QrInfo | null>(null)
  const usd: [string, string][] = [['$5', '30'], ['$25', '180'], ['$50', '365']]
  const copy = (v: string) => { navigator.clipboard?.writeText(v).catch(() => {}); toast({ kind: 'good', title: t(lang, 'copied') }) }

  useEffect(() => { api.getPaymentConfig().then(setCfg).catch(() => {}) }, [])
  useEffect(() => {
    if (!cfg?.qr_enabled) return
    let alive = true
    api.createQr('studio_monthly').then(i => { if (alive) setQr(i) }).catch(() => {})
    return () => { alive = false }
  }, [cfg])
  useEffect(() => {
    if (!qr) return
    let alive = true, timer: any
    const tick = async () => {
      try { const o = await api.getOrder(qr.invoice_number); if (alive && o.status === 'paid') { toast({ kind: 'good', title: t(lang, 'payment_success') }); onPaid(); onClose(); return } } catch { /* keep polling */ }
      if (alive) timer = setTimeout(tick, 3000)
    }
    timer = setTimeout(tick, 3000)
    return () => { alive = false; clearTimeout(timer) }
  }, [qr])  // eslint-disable-line

  const tabs: [string, string][] = [['bank', t(lang, 'pay_tab_bank')], ['card', t(lang, 'pay_tab_card')], ['crypto', 'USDT']]
  const usdtRows: [string, string][] = [
    ['TON', 'UQDLDqND4CDalAt7du-d3E8_eqE9d4QjlOH4iZR8ZQVkGhbU'],
    ['TRON', 'TBUDFxZB1F5hvZ7TD9mhSb5YNRSMPGHJzr'],
    ['BSC', '0x10746732AFd5FD4D771dF5e1910ac480E84c6085'],
    ['SOLANA', 'EJPnZXEWNaMcGeC4VGYwymAmi8xNgDtWTSjtRDZANWUE'],
  ]
  return (
    <div className="m-sheet-scrim" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="m-sheet">
        <div className="m-sheet-grab" />
        <div className="m-sheet-head"><span className="badge accent" style={{ padding: '5px 9px' }}><Icon name="card" size={14} /></span><span className="m-sh-ttl">{t(lang, 'pay_title')}</span><button className="m-vplay" style={{ background: 'var(--surface-2)' }} onClick={onClose}><Icon name="x" size={15} /></button></div>
        <div className="m-sheet-tabs">
          {tabs.map(([id, label]) => <button key={id} className={'m-sheet-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        <div className="m-sheet-body">
          {tab === 'bank' && <>
            <div className="m-qr">{qr ? <img src={qr.qr_url} alt="VietQR" style={{ display: 'block', width: '100%' }} /> : <MQR />}</div>
            <div className="m-card">
              <div className="m-pay-line"><span>{t(lang, 'qr_bank')}</span><strong>{qr?.bank_name || qr?.bank_code || 'VPBank'}</strong></div>
              <div className="m-pay-line" style={{ marginTop: 10 }}><span>{t(lang, 'qr_account')}</span><strong>{qr?.bank_account || '209841867'}</strong></div>
              <div className="m-pay-line" style={{ marginTop: 10 }}><span>{t(lang, 'qr_amount')}</span><strong>{qr ? qr.amount.toLocaleString('en-US') + ' VND' : '100,000 VND'}</strong></div>
              <div className="m-pay-line" style={{ marginTop: 10 }}><span>{t(lang, 'qr_content')}</span><strong style={{ color: 'var(--bad)' }}>{qr?.content || 'GLABS 494130 VOICE'}</strong></div>
            </div>
            <div className="m-muted">{t(lang, 'pay_auto_short')}</div>
          </>}
          {tab === 'card' && <>
            <div className="banner warn"><Icon name="card" size={15} className="bico" /><span>{t(lang, 'pay_card_banner_short')}</span></div>
            {usd.map((p, i) => (
              <button key={i} className="m-btn primary" style={{ flexDirection: 'column', gap: 2, padding: 14 }} onClick={() => toast({ kind: 'info', title: t(lang, 'pay_opening_paypal') })}>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="audio" size={15} />Voice Studio</span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p[0]} / {p[1]} {t(lang, 'pay_days')}</span>
              </button>
            ))}
          </>}
          {tab === 'crypto' && <>
            <div className="m-card pay-guide" style={{ borderColor: 'rgba(52,211,153,0.28)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>{t(lang, 'pay_manual_short')}</div>
              <div className="m-muted" style={{ lineHeight: 1.7 }}>{t(lang, 'pay_manual_short_a')}<span style={{ color: 'var(--accent)' }}>@duckmartians</span>{t(lang, 'pay_manual_short_b')}</div>
            </div>
            <div className="m-card"><div className="m-copy"><span className="m-clabel">Email</span><span className="m-cval">locphamnguyen@gmail.com</span><button className="m-cbtn" onClick={() => copy('locphamnguyen@gmail.com')}>Copy</button></div></div>
            <div className="m-card" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {usdtRows.map(([k, v]) => (
                <div key={k} className="m-copy"><span className="m-clabel">{k}</span><span className="m-cval">{v}</span><button className="m-cbtn" onClick={() => copy(v)}>Copy</button></div>
              ))}
            </div>
            <div className="m-card"><div className="m-copy"><span className="m-clabel">Binance</span><span className="m-cval">873069972</span><button className="m-cbtn" onClick={() => copy('873069972')}>Copy</button></div></div>
          </>}
        </div>
      </div>
    </div>
  )
}

/* ---------- Shell ---------- */
export function MobileApp({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [tab, setTab] = useState('clone')
  const [pay, setPay] = useState(false)
  const store = useVoices()

  const navItems: [string, string, string][] = [
    ['clone', 'mic', t(lang, 'nav_m_clone')],
    ['tts', 'type', t(lang, 'nav_m_tts')],
    ['stt', 'filetext', t(lang, 'nav_m_stt')],
    ['settings', 'settings', t(lang, 'nav_m_settings')],
  ]

  return (
    <div className="m-app">
      <div className="m-top">
        <span className="m-mark"><Icon name="audio" size={18} style={{ color: 'var(--accent-ink)' }} /></span>
        <div><div className="m-ttl">Vonia<span style={{ color: 'var(--accent)' }}>.</span></div><div className="m-sub">VOICE STUDIO</div></div>
        <span className="grow" />
        <span className="m-plan-pill"><Icon name="bolt" size={11} />{t(lang, 'plan_studio')}</span>
      </div>

      {tab === 'clone' && <CloneScreen lang={lang} />}
      {tab === 'tts' && <TtsScreen lang={lang} />}
      {tab === 'stt' && <SttScreen lang={lang} />}
      {tab === 'settings' && <SettingsScreen lang={lang} setLang={setLang} onPay={() => setPay(true)} />}

      <div className="m-nav">
        {navItems.map(([id, icon, label]) => (
          <button key={id} className={'m-navbtn' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
            <span className="m-nico"><Icon name={icon} size={21} /></span>{label}
          </button>
        ))}
      </div>

      {pay && <PaySheet lang={lang} onClose={() => setPay(false)} onPaid={() => store.refresh()} />}
    </div>
  )
}
