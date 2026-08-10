import React, { useState } from 'react'
import { Icon, Btn, Select, Panel, AccordionProvider, AudioPlayer, useToast } from '../components/ui'
import { LanguageField, AdvancedSettings, AudioTuning, BatchPanel, ExportPanel, useSettings, DEFAULTS } from '../components/panels'
import { ResultsTable, GenBar } from '../components/results'
import { VoicePickerOverlay } from '../components/voice-library'
import { PronunciationModal } from '../components/PronunciationModal'
import { useGenerator, fmtTime, type GenRow } from '../hooks/useGenerator'
import { useVoices } from '../app/store'
import { t, type Lang } from '../lib/i18n'
import { VOICES, LANG_NAME, avatarColor } from '../lib/data'
import { mergeWavBlobs, saveBlob } from '../lib/audio'
import { buildSrt } from '../lib/srt'
import { buildCastVoices, type CastVoice } from '../lib/dialogue'
import * as api from '../lib/api'

function measureDuration(url: string): Promise<number> {
  return new Promise(res => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0)
    a.onerror = () => res(0)
    a.src = url
  })
}

const SAMPLE_DIALOGUE = `Lan: Chào An, cậu đã thử Vonia chưa?
An: Rồi, mình vừa tạo một đoạn hội thoại hai giọng đấy.
Lan: Nghe tự nhiên không cậu?
An: Rất tự nhiên, mà lại chạy ngay trên máy mình, không cần internet.
Lan: Tuyệt thật, để mình thử ngay xem sao.`

interface CastEntry { name: string; voice: string }

function CastPanel({ lang, cast, setCast, starred, onStar, previewLang }:
  { lang: Lang; cast: CastEntry[]; setCast: (c: CastEntry[]) => void; starred: Set<string>; onStar: (n: string) => void; previewLang?: string }) {
  const store = useVoices()
  const allVoices = [...VOICES, ...store.userUIVoices]
  const [pickFor, setPickFor] = useState<string | null>(null)
  return (
    <Panel title={t(lang, 'cast')} icon="users" defaultOpen={true} tight>
      {cast.length === 0 ? (
        <div className="hint">{t(lang, 'no_chars_hint')}</div>
      ) : cast.map(c => (
        <div key={c.name} className="cast-row">
          <span className="cast-av" style={{ background: avatarColor(c.name) }}>{c.name[0]}</span>
          <span className="cast-name">{c.name}</span>
          <button className="cast-voice-btn" onClick={() => setPickFor(c.name)} title={c.voice}>
            <span className="av" style={{ background: avatarColor(c.voice) }}>{c.voice[0]}</span>
            <span className="cv-name">{c.voice}</span>
            <Icon name="chevdown" size={14} className="chev" />
          </button>
        </div>
      ))}
      {pickFor && (
        <VoicePickerOverlay lang={lang} title={pickFor} current={cast.find(c => c.name === pickFor)?.voice || ''}
          voices={allVoices} starred={starred} onStar={onStar} previewLang={previewLang}
          onSelect={(v) => setCast(cast.map(x => x.name === pickFor ? { ...x, voice: v } : x))}
          onClose={() => setPickFor(null)} />
      )}
    </Panel>
  )
}

export function DialogueTab({ lang, starred, onStar }: { lang: Lang; starred: Set<string>; onStar: (n: string) => void }) {
  const [s, set] = useSettings({ ...DEFAULTS })
  const [language, setLanguage] = useState('vi')
  const [text, setText] = useState('')
  const [cast, setCast] = useState<CastEntry[]>([])
  const [playSrc, setPlaySrc] = useState<string | null>(null)
  const [showPron, setShowPron] = useState(false)
  const gen = useGenerator()
  const store = useVoices()
  const toast = useToast()

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

  // Build generation items from a per-character voice map (anchor clip / clone /
  // instruct fallback) so every line of a character keeps the same voice.
  const buildItems = (rows: { char: string; text: string; time: string }[], sources: Record<string, CastVoice>) =>
    rows.map(r => {
      const sv = sources[r.char] || {}
      return {
        char: r.char, text: r.text, time: r.time,
        build: () => api.tts({
          text: r.text, language: LANG_NAME[language],
          voiceId: sv.voiceId, refAudioFile: sv.ref, refText: sv.refText, instruct: sv.instruct, seed: sv.seed,
          settings: s, format: 'wav',
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
    setPlaySrc(null)
    // Lock one voice per character (anchor-clone) before generating the lines.
    const voiceOf = (ch: string) => castList.find(x => x.name === ch)?.voice
    const chars = Array.from(new Set(rows.map(r => r.char)))
    toast({ kind: 'info', title: t(lang, 'preparing_voices') })
    const sources = await buildCastVoices(chars, voiceOf, store.resolve, LANG_NAME[language], language, s)
    gen.start(buildItems(rows, sources), s.concurrent)
    toast({ kind: 'info', title: t(lang, 'generating_dialogue') })
  }

  // Export the generated dialogue. Merge stitches each line's clip into one file
  // (client-side) so every character keeps its own voice — a single re-render
  // could only use one voice, which is wrong for a multi-speaker dialogue.
  const onExport = async (fmt: string, type: string, srt: boolean) => {
    const done = gen.rows.filter(r => r.state === 'done' && r.blob)
    if (!done.length) { toast({ kind: 'err', title: t(lang, 'generate_first') }); return }
    if (type === 'merge') {
      toast({ kind: 'info', title: t(lang, 'rendering_merged') })
      try { saveBlob(await mergeWavBlobs(done.map(r => r.blob!)), `vonia_dialogue.${fmt === 'mp3' ? 'wav' : fmt}`) }
      catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
    } else {
      done.forEach(r => saveBlob(r.blob!, `vonia_${String(r.id).padStart(2, '0')}.wav`))
    }
    if (srt && gen.rows.length) {
      const entries = await Promise.all(gen.rows.map(async r => ({
        text: r.char ? `${r.char}: ${r.text}` : r.text, dur: r.url ? await measureDuration(r.url) : 0,
      })))
      saveBlob(new Blob([buildSrt(entries)], { type: 'text/plain' }), 'vonia_dialogue.srt')
    }
  }

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <AccordionProvider initial={t(lang, 'cast')}>
            <CastPanel lang={lang} cast={cast} setCast={setCast} starred={starred} onStar={onStar} previewLang={LANG_NAME[language]} />
            <AdvancedSettings lang={lang} s={s} set={set} open={false} />
            <AudioTuning lang={lang} s={s} set={set} open={false} />
            <BatchPanel lang={lang} s={s} set={set} />
            <ExportPanel lang={lang} onExport={onExport} />
          </AccordionProvider>
        </div>
        <div className="railfoot">
          <GenBar lang={lang} running={gen.running} status={gen.status} progress={gen.progress} onStart={start} onStop={gen.stop} />
        </div>
      </div>

      <div className="stage">
        <div>
          <div className="stage-head">
            <span className="st-title"><Icon name="message" size={17} style={{ color: 'var(--accent)' }} />{t(lang, 'text_content')}</span>
            <Btn variant="subtle" size="sm" icon="list" onClick={() => setText(SAMPLE_DIALOGUE)}>{t(lang, 'dialogue_tpl')}</Btn>
          </div>
          <textarea className="bigtext" style={{ minHeight: 140 }} value={text} onChange={e => setText(e.target.value)} placeholder={t(lang, 'dialogue_text_ph')} />
        </div>

        <div className="row between wrap gap10">
          <div className="row gap10">
            <span className="field-label" style={{ margin: 0 }}>{t(lang, 'split_style')}</span>
            <Select width={200} value="auto" onChange={() => { }} options={[{ value: 'auto', label: t(lang, 'split_auto') }]} />
          </div>
          <div className="row gap10">
            <Btn variant="subtle" size="sm" icon="volume" onClick={() => setShowPron(true)}>{t(lang, 'speak')}</Btn>
            <Btn variant="subtle" size="sm" icon="users" onClick={analyze}>{t(lang, 'analyze')}</Btn>
          </div>
        </div>

        <div className="results-wrap">
          {gen.hasResults ? (
            <div className="results-scroll"><ResultsTable rows={gen.rows} lang={lang} cols="dialogue" onRetry={gen.retry} onPlay={(r: GenRow) => setPlaySrc(r.url || null)} /></div>
          ) : (
            <>
              <table className="rtable"><thead><tr>
                <th className="num">#</th><th style={{ width: 96 }}>{t(lang, 'col_time')}</th><th style={{ width: 130 }}>{t(lang, 'col_char')}</th>
                <th>{t(lang, 'col_content')}</th><th style={{ width: 150 }}>{t(lang, 'col_status')}</th><th style={{ width: 120 }}>{t(lang, 'col_action')}</th>
              </tr></thead></table>
              <div className="empty">
                <div className="em-art"><Icon name="message" size={34} /></div>
                <div className="em-title">{t(lang, 'dialogue_build_title')}</div>
                <div className="em-sub">{t(lang, 'dialogue_empty_sub')}</div>
                <div className="em-steps">
                  <span className="em-step"><span className="n">1</span>{t(lang, 'step_paste')}</span>
                  <span className="em-step"><span className="n">2</span>{t(lang, 'analyze')}</span>
                  <span className="em-step"><span className="n">3</span>{t(lang, 'start')}</span>
                </div>
                <div className="row gap10" style={{ marginTop: 4 }}>
                  <Btn variant="subtle" size="sm" icon="list" onClick={() => setText(SAMPLE_DIALOGUE)}>{t(lang, 'dialogue_tpl')}</Btn>
                </div>
              </div>
            </>
          )}
        </div>

        <AudioPlayer src={playSrc} />
      </div>
      {showPron && <PronunciationModal lang={lang} text={text} onClose={() => setShowPron(false)}
        onApply={() => toast({ kind: 'info', title: lang === 'en' ? 'Previewing…' : 'Đang phát thử…' })} />}
    </div>
  )
}
