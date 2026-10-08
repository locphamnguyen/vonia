/* Mobile app shell — rendered in place of the desktop layout on small screens.
   Bottom-tab navigation (Clone · TTS · STT · Settings) + a payment bottom-sheet.
   Ported from the design's mobile.jsx; screens are wired to the real API
   (generation, transcription, SePay QR) rather than the prototype's mocks. */
import React, { useEffect, useRef, useState } from 'react'
import { Icon, Select, useToast } from '../components/ui'
import { DEFAULTS } from '../components/panels'
import { t, type Lang } from '../lib/i18n'
import { VOICES, LANG_NAME, LANGUAGES, avatarColor } from '../lib/data'
import { useVoices } from '../app/store'
import { VoicePickerOverlay } from '../components/voice-library'
import { ServerAnnouncementBanner } from '../components/ServerAnnouncementBanner'
import { useGenerator, fmtTime, type GenRow } from '../hooks/useGenerator'
import { splitText, type SplitMode } from '../lib/text'
import { mergeWavBlobs, saveBlob } from '../lib/audio'
import { buildCastVoices, type CastVoice } from '../lib/dialogue'
import * as api from '../lib/api'
import { PAYMENTS_ENABLED } from '../lib/features'

/* File picker filter. iOS Files greys out anything not matched, and a bare
   `audio/*,video/*` can hide real audio files (e.g. voice-memo .m4a) — so we
   also list explicit extensions. Video is intentionally allowed: ffmpeg on the
   server extracts the audio track for cloning/transcription. */
const FILE_ACCEPT =
  'audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.amr,.aiff,.caf,.mp4,.mov,.m4v,.webm,.3gp,.mkv'

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

/* Trigger a browser download for one generated clip. */
function downloadRow(r: GenRow, fmt = 'wav') {
  if (!r.url) return
  const a = document.createElement('a')
  a.href = r.url; a.download = `vonia_${String(r.id).padStart(2, '0')}.${fmt}`
  document.body.appendChild(a); a.click(); a.remove()
}

/* Download every finished clip. Mobile browsers throttle bursts of downloads,
   so space them out (iOS may still surface only the last one). */
async function downloadAll(rows: GenRow[], fmt = 'wav') {
  const done = rows.filter(r => r.state === 'done' && r.url)
  for (const r of done) {
    downloadRow(r, fmt)
    await new Promise(res => setTimeout(res, 350))
  }
}

/* Shared export state for result cards: merge (default) vs per-line download. */
function useAudioExport(lang: Lang, rows: GenRow[], mergeName = 'vonia_merged.wav') {
  const toast = useToast()
  const [exportMode, setExportMode] = useState<'merge' | 'split'>('merge')
  const [busy, setBusy] = useState(false)
  const doDownload = async () => {
    const done = rows.filter(r => r.state === 'done' && r.blob)
    if (!done.length) return
    if (exportMode === 'split') { downloadAll(rows); return }
    setBusy(true)
    toast({ kind: 'info', title: t(lang, 'm_merging') })
    try { saveBlob(await mergeWavBlobs(done.map(r => r.blob!)), mergeName) }
    catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
    finally { setBusy(false) }
  }
  return { exportMode, setExportMode, busy, doDownload }
}

/* Merge/split toggle + download button — shown once any clip is ready. */
function ExportControls({ lang, rows, ex }:
  { lang: Lang; rows: GenRow[]; ex: ReturnType<typeof useAudioExport> }) {
  if (!rows.some(r => r.state === 'done' && r.blob)) return null
  return (
    <>
      <div className="m-seg" style={{ marginTop: 12 }}>
        <button className={ex.exportMode === 'merge' ? 'on' : ''} onClick={() => ex.setExportMode('merge')}><Icon name="library" size={14} />{t(lang, 'm_export_merge')}</button>
        <button className={ex.exportMode === 'split' ? 'on' : ''} onClick={() => ex.setExportMode('split')}><Icon name="audio" size={14} />{t(lang, 'm_export_split')}</button>
      </div>
      <button className="m-btn primary" style={{ marginTop: 12 }} disabled={ex.busy} onClick={ex.doDownload}>
        <Icon name="download" size={16} />{t(lang, 'm_download_btn')}
      </button>
    </>
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
          <span className="m-rtext">{r.char ? <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.char}: </span> : null}{r.text}</span>
          {r.state === 'done'
            ? <button className="m-vplay" title={t(lang, 'download')} onClick={() => downloadRow(r)}><Icon name="download" size={13} /></button>
            : r.state === 'error'
              ? <span className="m-status" style={{ color: 'var(--bad)' }}><Icon name="warn" size={13} />{t(lang, 'failed')}</span>
              : <span className="m-status" style={{ color: 'var(--text-muted)' }}><Icon name="loader" size={13} />{t(lang, 'processing')}</span>}
        </div>
      ))}
    </>
  )
}

/* Result card header — title + a "download all" action once any clip is ready. */
function ResultHead({ lang, rows }: { lang: Lang; rows: GenRow[] }) {
  const anyDone = rows.some(r => r.state === 'done' && r.url)
  return (
    <div className="m-between" style={{ marginBottom: 12 }}>
      <span className="m-label" style={{ margin: 0 }}><Icon name="library" size={14} />{t(lang, 'm_result')}</span>
      {anyDone && (
        <button className="m-btn ghost" style={{ width: 'auto', padding: '5px 9px', fontSize: 12 }} onClick={() => downloadAll(rows)}>
          <Icon name="download" size={13} style={{ color: 'var(--accent)' }} />{t(lang, 'm_download_all')}
        </button>
      )}
    </div>
  )
}

/* ---------- Screens ---------- */
function CloneScreen({ lang }: { lang: Lang }) {
  const toast = useToast()
  const store = useVoices()
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
  // Save the current sample as a reusable voice in the store (so it shows up
  // here and in the TTS voice picker) — mirrors the desktop "Save to store".
  const saveVoice = async () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_sample_first') }); return }
    const name = window.prompt(t(lang, 'voice_name_prompt'))
    if (!name) return
    try {
      await api.registerVoice(name, file, sample || undefined)
      await store.refresh()
      toast({ kind: 'good', title: t(lang, 'voice_saved_toast'), desc: name })
    } catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
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
          <input ref={fileRef} type="file" accept={FILE_ACCEPT} style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
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
          <ResultHead lang={lang} rows={gen.rows} />
          {gen.hasResults ? <ResultRows lang={lang} rows={gen.rows} audio={audio} /> : (
            <div className="m-empty"><div className="m-eart"><Icon name="audio" size={26} /></div><div style={{ fontSize: 13.5 }}>{t(lang, 'no_audio')}</div></div>
          )}
        </div>

        <div className="m-card">
          <div className="m-between" style={{ marginBottom: store.userUIVoices.length ? 12 : 0 }}>
            <span className="m-label" style={{ margin: 0 }}><Icon name="mic" size={14} />{t(lang, 'your_voices')}</span>
            <button className="m-btn ghost" style={{ width: 'auto', padding: '5px 9px', fontSize: 12 }} disabled={!file} onClick={saveVoice}>
              <Icon name="save" size={13} style={{ color: 'var(--accent)' }} />{t(lang, 'm_save_voice')}
            </button>
          </div>
          {store.userUIVoices.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {store.userUIVoices.map(v => (
                <div key={v.id || v.name} className="m-vrow">
                  <Icon name="star" size={15} className="m-star on" />
                  <div style={{ flex: 1, minWidth: 0 }}><div className="m-vname">{v.name}</div><div className="m-vdesc">{t(lang, 'cloned')}</div></div>
                </div>
              ))}
            </div>
          ) : <div className="m-muted">{t(lang, 'your_voices_empty')}</div>}
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
  // Default split = none (whole text, only auto-wrapped at MAX_LINE_CHARS for
  // safety); default export = one merged file. User can change both.
  const [split, setSplit] = useState<SplitMode>('none')
  const ex = useAudioExport(lang, gen.rows)
  const voices = [...store.userUIVoices, ...VOICES].slice(0, 6)

  const start = () => {
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'enter_text_first') }); return }
    const lines = splitText(text, split)
    const va = store.resolve(voice)
    gen.start(lines.map(l => ({ text: l, build: () => api.tts({ text: l, language: LANG_NAME[language], voiceId: va.voiceId, instruct: va.instruct, seed: va.seed, settings: DEFAULTS, format: 'wav' }) })), 1)
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

        <div className="m-card">
          <div className="m-label"><Icon name="type" size={14} />{t(lang, 'split_style')}</div>
          <Select value={split} onChange={v => setSplit(v as SplitMode)} width="100%" options={[
            { value: 'none', label: t(lang, 'split_none') },
            { value: 'period', label: t(lang, 'split_auto') },
            { value: 'newline', label: t(lang, 'split_newline') },
            { value: 'comma', label: t(lang, 'split_comma') },
          ]} />
        </div>

        {gen.hasResults && (
          <div className="m-card">
            <div className="m-label" style={{ marginBottom: 12 }}><Icon name="library" size={14} />{t(lang, 'm_result')}</div>
            <ResultRows lang={lang} rows={gen.rows} audio={audio} />
            <ExportControls lang={lang} rows={gen.rows} ex={ex} />
          </div>
        )}
      </div>
      <div className="m-cta"><button className="m-btn primary" disabled={gen.running} onClick={start}><Icon name="play" size={16} fill />{t(lang, 'start')}</button></div>
    </>
  )
}

interface CastEntry { name: string; voice: string }

const SAMPLE_DIALOGUE = `Lan: Chào An, cậu đã thử Vonia chưa?
An: Rồi, mình vừa tạo một đoạn hội thoại hai giọng đấy.
Lan: Nghe tự nhiên không cậu?
An: Rất tự nhiên, mà lại chạy ngay trên máy mình, không cần internet.
Lan: Tuyệt thật, để mình thử ngay xem sao.`

function DialogueScreen({ lang }: { lang: Lang }) {
  const toast = useToast()
  const store = useVoices()
  const gen = useGenerator()
  const audio = useAudio()
  const ex = useAudioExport(lang, gen.rows)
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('vi')
  const [cast, setCast] = useState<CastEntry[]>([])

  // Parse "Name: line" script into per-line rows + a detected cast, assigning a
  // distinct preset voice to each new speaker (same logic as the desktop tab).
  const parse = () => {
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
    const rows: { char: string; text: string; time: string }[] = []
    const chars: Record<string, string> = {}
    const pal = VOICES.map(v => v.name)
    lines.forEach((l, i) => {
      const m = l.match(/^([^:：]{1,24})[:：]\s*(.+)$/)
      const char = m ? m[1].trim() : t(lang, 'narrator')
      const body = m ? m[2].trim() : l
      if (!chars[char]) chars[char] = pal[Object.keys(chars).length % pal.length]
      rows.push({ char, text: body, time: fmtTime(i * 3.6) })
    })
    return { rows, cast: Object.keys(chars).map(name => ({ name, voice: chars[name] })) }
  }

  const buildItems = (rows: { char: string; text: string; time: string }[], sources: Record<string, CastVoice>) =>
    rows.map(r => {
      const sv = sources[r.char] || {}
      return {
        char: r.char, text: r.text, time: r.time,
        build: () => api.tts({
          text: r.text, language: LANG_NAME[language],
          voiceId: sv.voiceId, refAudioFile: sv.ref, refText: sv.refText, instruct: sv.instruct, seed: sv.seed,
          settings: DEFAULTS, format: 'wav',
        }),
      }
    })

  const analyze = () => {
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'paste_dialogue_first') }); return }
    const { cast: c } = parse()
    setCast(c)
    toast({ kind: 'good', title: t(lang, 'detected_speakers').replace('{n}', String(c.length)) })
  }
  const start = async () => {
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'paste_dialogue_first') }); return }
    const { rows, cast: c } = parse()
    const castList = cast.length ? cast : c
    if (!cast.length) setCast(c)
    const voiceOf = (ch: string) => castList.find(x => x.name === ch)?.voice
    const chars = Array.from(new Set(rows.map(r => r.char)))
    toast({ kind: 'info', title: t(lang, 'preparing_voices') })
    const sources = await buildCastVoices(chars, voiceOf, store.resolve, LANG_NAME[language], language, DEFAULTS)
    gen.start(buildItems(rows, sources), 1)
    toast({ kind: 'info', title: t(lang, 'generating_dialogue') })
  }

  // Same voice picker as the TTS tab (presets + cloned, search/filter/star/play),
  // opened per role. Starred is session-local on mobile.
  const allVoices = [...VOICES, ...store.userUIVoices]
  const [pickFor, setPickFor] = useState<string | null>(null)
  const [starred, setStarred] = useState<Set<string>>(() => new Set())
  const onStar = (n: string) => setStarred(s => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x })

  return (
    <>
      <div className="m-screen">
        <div className="m-h1">{t(lang, 'tab_dialogue')}<span className="m-h1sub">{t(lang, 'm_dialogue_sub')}</span></div>

        <div className="m-card">
          <div className="m-between" style={{ marginBottom: 9 }}>
            <span className="m-label" style={{ margin: 0 }}><Icon name="message" size={14} />{t(lang, 'text_content')}</span>
            <button className="m-btn ghost" style={{ width: 'auto', padding: '5px 9px', fontSize: 12 }} onClick={() => setText(SAMPLE_DIALOGUE)}><Icon name="list" size={13} style={{ color: 'var(--accent)' }} />{t(lang, 'dialogue_tpl')}</button>
          </div>
          <textarea className="m-textarea" rows={6} value={text} onChange={e => setText(e.target.value)} placeholder={t(lang, 'dialogue_text_ph')} />
          <button className="m-btn subtle" style={{ marginTop: 10 }} onClick={analyze}><Icon name="users" size={15} />{t(lang, 'analyze')}</button>
        </div>

        <div className="m-card">
          <div className="m-label"><Icon name="globe" size={14} />{t(lang, 'language')}</div>
          <Select value={language} onChange={setLanguage} width="100%" options={LANGUAGES.map(l => ({ value: l.id, label: `${l.flag} ${l.label}` }))} />
        </div>

        <div className="m-card">
          <div className="m-label" style={{ marginBottom: cast.length ? 12 : 0 }}><Icon name="users" size={14} />{t(lang, 'cast')}</div>
          {cast.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cast.map(c => (
                <div key={c.name} className="m-row">
                  <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: avatarColor(c.name), flexShrink: 0 }}>{c.name[0]}</span>
                  <span className="grow" style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <button className="cast-voice-btn" onClick={() => setPickFor(c.name)}>
                    <span className="av" style={{ width: 18, height: 18, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, background: avatarColor(c.voice) }}>{c.voice[0]}</span>
                    <span className="cv-name">{c.voice}</span>
                    <Icon name="chevdown" size={14} className="faint" />
                  </button>
                </div>
              ))}
            </div>
          ) : <div className="m-muted">{t(lang, 'no_chars_hint')}</div>}
        </div>

        {gen.hasResults && (
          <div className="m-card">
            <div className="m-label" style={{ marginBottom: 12 }}><Icon name="library" size={14} />{t(lang, 'm_result')}</div>
            <ResultRows lang={lang} rows={gen.rows} audio={audio} />
            <ExportControls lang={lang} rows={gen.rows} ex={ex} />
          </div>
        )}
      </div>
      <div className="m-cta"><button className="m-btn primary" disabled={gen.running} onClick={start}><Icon name="play" size={16} fill />{t(lang, 'start')}</button></div>
      {pickFor && (
        <VoicePickerOverlay lang={lang} title={pickFor} current={cast.find(c => c.name === pickFor)?.voice || ''}
          voices={allVoices} starred={starred} onStar={onStar} previewLang={LANG_NAME[language]}
          onSelect={(v) => setCast(cast.map(x => x.name === pickFor ? { ...x, voice: v } : x))}
          onClose={() => setPickFor(null)} />
      )}
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
          <input ref={fileRef} type="file" accept={FILE_ACCEPT} style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
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

const fmtVnd = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

function SettingsScreen({ lang, setLang, onPay, onMembers, pending = 0 }: { lang: Lang; setLang: (l: Lang) => void; onPay: () => void; onMembers?: () => void; pending?: number }) {
  const toast = useToast()
  const [me, setMe] = useState<api.MeInfo | null>(null)
  const [sub, setSub] = useState<api.Subscription | null>(null)
  const [plans, setPlans] = useState<api.Plan[]>([])
  const [cfg, setCfg] = useState<api.PaymentConfig | null>(null)
  const loadSub = () => api.getSubscription().then(setSub).catch(() => {})
  useEffect(() => {
    api.getMe().then(setMe).catch(() => {})
    if (!PAYMENTS_ENABLED) return
    api.getPlans().then(setPlans).catch(() => {})
    api.getPaymentConfig().then(setCfg).catch(() => {})
    loadSub()
  }, [])
  const studio = plans.find(p => p.id === 'studio_monthly')
  const active = !!sub?.active
  const price = studio ? fmtVnd(studio.amount) : '100.000đ'

  return (
    <div className="m-screen" style={{ paddingBottom: 120 }}>
      <div className="m-h1">{t(lang, 'nav_settings')}</div>

      {/* Account */}
      <div className="m-card">
        <div className="m-between" style={{ marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="m-label" style={{ margin: 0 }}><Icon name="user" size={14} />{t(lang, 'user')}</div>
            <div className="m-vname" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me?.email || t(lang, 'guest')}</div>
          </div>
          {cfg?.env === 'sandbox' && <span className="m-plan-pill" style={{ background: 'var(--warn)', color: '#1a1205' }}>SANDBOX</span>}
        </div>
        {me ? (
          <div className="m-row" style={{ gap: 8 }}>
            {PAYMENTS_ENABLED && <button className="m-btn subtle" onClick={() => { loadSub(); toast({ kind: 'info', title: t(lang, 'refresh') }) }}><Icon name="refresh" size={15} />{t(lang, 'refresh')}</button>}
            <button className="m-btn" style={{ color: 'var(--bad)' }} onClick={() => { window.location.href = '/logout' }}><Icon name="login" size={15} />{t(lang, 'logout_device')}</button>
          </div>
        ) : null}
        {me && onMembers ? (
          <button className="m-btn" style={{ marginTop: 8 }} onClick={onMembers}>
            <Icon name="users" size={15} />{t(lang, 'nav_members')}{pending > 0 ? ` (${pending})` : ''}
          </button>
        ) : null}
        {me ? null : (
          <button className="m-btn primary" onClick={() => { window.location.href = '/auth/login' }}><Icon name="login" size={15} />{t(lang, 'sign_in_google')}</button>
        )}
      </div>

      {PAYMENTS_ENABLED && <>
      {/* Subscription status */}
      <div className="m-card" style={{ borderColor: active ? 'var(--accent-line)' : 'var(--border)' }}>
        {active ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <Icon name="check" size={15} style={{ color: 'var(--good)', verticalAlign: '-2px', marginRight: 6 }} />
            <strong>{t(lang, 'plan_studio')}</strong> · {t(lang, 'sub_active')}<br />
            {t(lang, 'sub_expires')}: <strong>{fmtDate(sub!.expires_at)}</strong> ({t(lang, 'plan_days').replace('{n}', String(sub!.days_left))})
          </div>
        ) : (
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}><Icon name="info" size={15} style={{ color: 'var(--warn)', verticalAlign: '-2px', marginRight: 6 }} />{t(lang, 'sub_trial')}</div>
        )}
      </div>

      {/* Plans */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="m-card" style={{ textAlign: 'center', padding: '18px 12px' }}>
          <div className="m-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>{t(lang, 'plan_trial')}</div>
          <div style={{ fontSize: 20, fontWeight: 800, margin: '6px 0 12px' }}>{t(lang, 'free')}</div>
          <button className="m-btn subtle" disabled><Icon name="check" size={14} />{active ? t(lang, 'included') : t(lang, 'using_now')}</button>
        </div>
        <div className="m-card" style={{ textAlign: 'center', padding: '18px 12px', borderColor: 'var(--accent-line)', background: 'var(--grad-soft)' }}>
          <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--accent)' }}>{t(lang, 'plan_studio')}</div>
          <div style={{ margin: '6px 0 12px' }}><span style={{ fontSize: 18, fontWeight: 800 }}>{price}</span> <span className="m-muted" style={{ fontSize: 11 }}>{t(lang, 'per_days')}</span></div>
          {active
            ? <button className="m-btn subtle" disabled><Icon name="check" size={14} />{t(lang, 'using_now')}</button>
            : <button className="m-btn primary" onClick={onPay}><Icon name="bolt" size={15} />{t(lang, 'upgrade_now')}</button>}
        </div>
      </div>

      {/* Trial notes */}
      <div className="m-card">
        <div className="m-muted" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, lineHeight: 1.5 }}>
          <span><Icon name="info" size={13} style={{ color: 'var(--accent)', verticalAlign: '-2px', marginRight: 6 }} />{t(lang, 'trial_limit')}</span>
          <span><Icon name="warn" size={13} style={{ color: 'var(--warn)', verticalAlign: '-2px', marginRight: 6 }} />{t(lang, 'try_first')}</span>
          <span><Icon name="warn" size={13} style={{ color: 'var(--warn)', verticalAlign: '-2px', marginRight: 6 }} />{t(lang, 'no_refund')}</span>
        </div>
      </div>
      </>}

      {/* Preferences */}
      <div className="m-list">
        <div className="m-li"><span className="m-lic"><Icon name="globe" size={16} /></span><div className="grow"><div className="m-lit">{t(lang, 'interface_lang')}</div></div>
          <div className="m-seg" style={{ width: 120 }}>
            <button className={lang === 'vi' ? 'on' : ''} onClick={() => setLang('vi')}>VI</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
        <div className="m-li"><span className="m-lic"><Icon name="file" size={16} /></span><div className="grow"><div className="m-lit">{t(lang, 'file_naming')}</div><div className="m-lid">1_Xin_chao.wav</div></div><Icon name="chevright" size={15} className="faint" /></div>
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

/* Keep-alive tab pane: once visited, a screen stays mounted and is just hidden
   via `display:none` instead of unmounting. This preserves each screen's
   in-progress work (entered text, chosen file, generated rows + audio URLs)
   across tab switches — an unmount would wipe local state and revoke the audio
   object URLs (see useGenerator cleanup). Mirrors the desktop TabPane. */
function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, flexDirection: 'column', display: active ? 'flex' : 'none' }}>
      {children}
    </div>
  )
}

/* ---------- Shell ---------- */
export function MobileApp({ lang, setLang, onMembers, pending }: { lang: Lang; setLang: (l: Lang) => void; onMembers?: () => void; pending?: number }) {
  const [tab, setTab] = useState('clone')
  const [pay, setPay] = useState(false)
  const store = useVoices()
  // Mount a screen on first visit, then keep it alive (see Pane).
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['clone']))
  useEffect(() => { setVisited(v => (v.has(tab) ? v : new Set(v).add(tab))) }, [tab])

  // Settings lives in the top-right hamburger (frees a bottom-nav slot for
  // Dialogue). Tapping the burger opens settings; tapping it again returns to
  // the last content tab.
  const [lastTab, setLastTab] = useState('clone')
  const goSettings = () => { if (tab === 'settings') { setTab(lastTab) } else { setLastTab(tab); setTab('settings') } }

  const navItems: [string, string, string][] = [
    ['clone', 'mic', t(lang, 'nav_m_clone')],
    ['dialogue', 'message', t(lang, 'nav_m_dialogue')],
    ['tts', 'type', t(lang, 'nav_m_tts')],
    ['stt', 'filetext', t(lang, 'nav_m_stt')],
  ]

  return (
    <div className="m-app">
      <div className="m-top">
        <span className="m-mark"><Icon name="audio" size={18} style={{ color: 'var(--accent-ink)' }} /></span>
        <div><div className="m-ttl">Vonia<span style={{ color: 'var(--accent)' }}>.</span></div><div className="m-sub">VOICE STUDIO</div></div>
        <span className="grow" />
        <button className={'m-burger' + (tab === 'settings' ? ' on' : '')} onClick={goSettings} aria-label={t(lang, 'nav_settings')}>
          <Icon name="menu" size={20} />
        </button>
      </div>
      <ServerAnnouncementBanner lang={lang} compact />

      {visited.has('clone') && <Pane active={tab === 'clone'}><CloneScreen lang={lang} /></Pane>}
      {visited.has('dialogue') && <Pane active={tab === 'dialogue'}><DialogueScreen lang={lang} /></Pane>}
      {visited.has('tts') && <Pane active={tab === 'tts'}><TtsScreen lang={lang} /></Pane>}
      {visited.has('stt') && <Pane active={tab === 'stt'}><SttScreen lang={lang} /></Pane>}
      {visited.has('settings') && <Pane active={tab === 'settings'}><SettingsScreen lang={lang} setLang={setLang} onPay={() => setPay(true)} onMembers={onMembers} pending={pending} /></Pane>}

      <div className="m-nav">
        {navItems.map(([id, icon, label]) => (
          <button key={id} className={'m-navbtn' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
            <span className="m-nico"><Icon name={icon} size={21} /></span>{label}
          </button>
        ))}
      </div>

      {PAYMENTS_ENABLED && pay && <PaySheet lang={lang} onClose={() => setPay(false)} onPaid={() => store.refresh()} />}
    </div>
  )
}
