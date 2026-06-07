import React, { useState } from 'react'
import { Icon, Btn, Select, Panel, AudioPlayer, useToast } from '../components/ui'
import { LanguageField, AdvancedSettings, AudioTuning, BatchPanel, useSettings, DEFAULTS } from '../components/panels'
import { ResultsTable, GenBar } from '../components/results'
import { useGenerator, fmtTime, type GenRow } from '../hooks/useGenerator'
import { useVoices } from '../app/store'
import { t, type Lang } from '../lib/i18n'
import { VOICES, LANG_NAME, avatarColor } from '../lib/data'
import * as api from '../lib/api'

const SAMPLE_DIALOGUE = `Lan: Chào An, cậu đã thử Vonia chưa?
An: Rồi, mình vừa tạo một đoạn hội thoại hai giọng đấy.
Lan: Nghe tự nhiên không cậu?
An: Rất tự nhiên, mà lại chạy ngay trên máy mình, không cần internet.
Lan: Tuyệt thật, để mình thử ngay xem sao.`

interface CastEntry { name: string; voice: string }

function CastPanel({ lang, cast, setCast }: { lang: Lang; cast: CastEntry[]; setCast: (c: CastEntry[]) => void }) {
  const voiceOpts = VOICES.map(v => ({ value: v.name, label: v.name, color: v.color }))
  return (
    <Panel title={t(lang, 'cast')} icon="users" defaultOpen={true} tight>
      {cast.length === 0 ? (
        <div className="hint">{t(lang, 'no_chars_hint')}</div>
      ) : cast.map(c => (
        <div key={c.name} className="row gap10">
          <span className="av" style={{ width: 30, height: 30, fontSize: 12, background: avatarColor(c.name), flexShrink: 0 }}>{c.name[0]}</span>
          <span className="grow" style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
          <Select width={140} value={c.voice} onChange={(v: string) => setCast(cast.map(x => x.name === c.name ? { ...x, voice: v } : x))}
            options={voiceOpts}
            renderValue={(o: any) => <span className="row gap6"><span className="av" style={{ width: 18, height: 18, fontSize: 10, background: o.color }}>{o.label[0]}</span>{o.label}</span>}
            renderOption={(o: any) => <span className="row gap6"><span className="av" style={{ width: 18, height: 18, fontSize: 10, background: o.color }}>{o.label[0]}</span>{o.label}</span>} />
        </div>
      ))}
    </Panel>
  )
}

export function DialogueTab({ lang }: { lang: Lang; starred: Set<string>; onStar: (n: string) => void }) {
  const [s, set] = useSettings({ ...DEFAULTS })
  const [language, setLanguage] = useState('vi')
  const [text, setText] = useState('')
  const [cast, setCast] = useState<CastEntry[]>([])
  const [playSrc, setPlaySrc] = useState<string | null>(null)
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

  const buildItems = (rows: { char: string; text: string; time: string }[], castList: CastEntry[]) => {
    const voiceOf = (char: string) => castList.find(c => c.name === char)?.voice
    return rows.map(r => {
      const vname = voiceOf(r.char) || 'Achird'
      const va = store.resolve(vname)
      return {
        char: r.char, text: r.text, time: r.time,
        build: () => api.tts({ text: r.text, language: LANG_NAME[language], voiceId: va.voiceId, instruct: va.instruct, settings: s, format: 'wav' }),
      }
    })
  }

  const analyze = () => {
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'paste_dialogue_first') }); return }
    const { cast: c } = parse()
    setCast(c)
    toast({ kind: 'good', title: t(lang, 'detected_speakers').replace('{n}', String(c.length)) })
  }
  const start = () => {
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'paste_dialogue_first') }); return }
    const { rows, cast: c } = parse()
    const castList = cast.length ? cast : c
    if (!cast.length) setCast(c)
    setPlaySrc(null)
    gen.start(buildItems(rows, castList), s.concurrent)
    toast({ kind: 'info', title: t(lang, 'generating_dialogue') })
  }

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <CastPanel lang={lang} cast={cast} setCast={setCast} />
          <AdvancedSettings lang={lang} s={s} set={set} open={false} />
          <AudioTuning lang={lang} s={s} set={set} open={false} />
          <BatchPanel lang={lang} s={s} set={set} />
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
    </div>
  )
}
