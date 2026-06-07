import React, { useState } from 'react'
import { Icon, Btn, Select, Segmented, Panel, AudioPlayer, useToast } from '../components/ui'
import { LanguageField, AdvancedSettings, AudioTuning, BatchPanel, ExportPanel, useSettings, DEFAULTS } from '../components/panels'
import { VoiceList } from '../components/voice-library'
import { ResultsTable, GenBar } from '../components/results'
import { useGenerator, fmtTime, type GenRow } from '../hooks/useGenerator'
import { useVoices } from '../app/store'
import { t, type Lang } from '../lib/i18n'
import { VOICES, LANG_NAME } from '../lib/data'
import { splitText as splitTextLines, type SplitMode } from '../lib/text'
import * as api from '../lib/api'

function randInstruct(r: any): string {
  const parts: string[] = []
  if (r.gender === 'M') parts.push('male'); else if (r.gender === 'F') parts.push('female')
  const pitch: any = { low: 'low pitch', mid: 'moderate pitch', high: 'high pitch' }
  if (pitch[r.pitch]) parts.push(pitch[r.pitch])
  if (r.accent && r.accent !== 'auto') parts.push(r.accent + ' accent')
  return parts.join(', ')
}

function VoicePanel({ lang, mode, setMode, selVoice, onSelect, starred, onStar, random, setRandom, voices, previewLang }: any) {
  const autoOpts = [
    { value: 'auto', label: t(lang, 'auto') }, { value: 'low', label: lang === 'en' ? 'Low' : 'Thấp' },
    { value: 'mid', label: lang === 'en' ? 'Mid' : 'Trung' }, { value: 'high', label: lang === 'en' ? 'High' : 'Cao' }]
  const genderOpts = [{ value: 'auto', label: t(lang, 'auto') }, { value: 'M', label: t(lang, 'male') }, { value: 'F', label: t(lang, 'female') }]
  return (
    <Panel title={t(lang, 'voice')} icon="mic" defaultOpen={true} tight>
      <Segmented value={mode} onChange={setMode} options={[
        { value: 'preset', label: t(lang, 'preset_voice'), icon: 'library' },
        { value: 'random', label: t(lang, 'random_voice'), icon: 'wand' }]} />
      {mode === 'preset' ? (
        <div>
          <div className="row between" style={{ margin: '2px 0 4px' }}>
            <span className="section-title">{t(lang, 'pick_from_store')} <span className="muted">({voices.length} {t(lang, 'samples')})</span></span>
          </div>
          <VoiceList voices={voices} lang={lang} selected={selVoice} onSelect={onSelect} starred={starred} onStar={onStar} mixedCloned previewLang={previewLang} />
        </div>
      ) : (
        <div className="stack gap14">
          <div className="row between"><span className="sl-label">{t(lang, 'gender')}</span><Select width={150} value={random.gender} onChange={(v: any) => setRandom({ ...random, gender: v })} options={genderOpts} /></div>
          <div className="row between"><span className="sl-label">{t(lang, 'age')}</span><Select width={150} value={random.age} onChange={(v: any) => setRandom({ ...random, age: v })} options={autoOpts} /></div>
          <div className="row between"><span className="sl-label">{t(lang, 'pitch')}</span><Select width={150} value={random.pitch} onChange={(v: any) => setRandom({ ...random, pitch: v })} options={autoOpts} /></div>
          <div className="row between"><span className="sl-label">{t(lang, 'accent')}</span><Select width={150} value={random.accent} onChange={(v: any) => setRandom({ ...random, accent: v })} options={autoOpts} /></div>
        </div>
      )}
    </Panel>
  )
}

export function TtsTab({ lang, starred, onStar }: { lang: Lang; starred: Set<string>; onStar: (n: string) => void }) {
  const [s, set] = useSettings({ ...DEFAULTS })
  const [language, setLanguage] = useState('vi')
  const [mode, setMode] = useState('preset')
  const [selVoice, setSelVoice] = useState('Achird')
  const [random, setRandom] = useState({ gender: 'auto', age: 'auto', pitch: 'auto', accent: 'auto' })
  const [text, setText] = useState('')
  const [split, setSplit] = useState('period')
  const [playSrc, setPlaySrc] = useState<string | null>(null)
  const gen = useGenerator()
  const store = useVoices()
  const toast = useToast()

  const splitText = () => splitTextLines(text, split as SplitMode)

  const voiceArgs = () => {
    if (mode === 'random') return { instruct: randInstruct(random) || undefined }
    return store.resolve(selVoice)
  }

  const buildItems = (lines: string[]) => {
    const va = voiceArgs()
    return lines.map((l, i) => ({
      text: l, time: fmtTime(i * 4.2),
      build: () => api.tts({
        text: l, language: LANG_NAME[language], voiceId: va.voiceId, instruct: va.instruct,
        settings: s, format: 'wav',
      }),
    }))
  }

  const start = () => {
    const lines = splitText()
    if (!lines.length) { toast({ kind: 'err', title: lang === 'en' ? 'Enter text first' : 'Hãy nhập nội dung' }); return }
    setPlaySrc(null)
    gen.start(buildItems(lines), s.concurrent)
    toast({ kind: 'info', title: lang === 'en' ? `Generating ${lines.length} lines…` : `Đang tạo ${lines.length} dòng…` })
  }
  const toTable = () => {
    const lines = splitText()
    if (!lines.length) { toast({ kind: 'err', title: lang === 'en' ? 'Nothing to split' : 'Chưa có nội dung' }); return }
    gen.reset(); gen.start(buildItems(lines), s.concurrent)
  }

  const onExport = async (fmt: string, type: string, srt: boolean) => {
    const dl = (blob: Blob, name: string) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }
    if (type === 'merge') {
      const lines = splitText()
      if (!lines.length) { toast({ kind: 'err', title: lang === 'en' ? 'Nothing to export' : 'Chưa có nội dung' }); return }
      const va = voiceArgs()
      toast({ kind: 'info', title: lang === 'en' ? 'Rendering merged audio…' : 'Đang dựng file gộp…' })
      try {
        const blob = await api.tts({ text: lines.join(' '), language: LANG_NAME[language], voiceId: va.voiceId, instruct: va.instruct, settings: s, format: fmt as any })
        dl(blob, `vonia_merged.${fmt}`)
      } catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
    } else {
      const done = gen.rows.filter(r => r.state === 'done' && r.blob)
      if (!done.length) { toast({ kind: 'err', title: lang === 'en' ? 'Generate first' : 'Hãy tạo trước' }); return }
      done.forEach(r => dl(r.blob!, `vonia_${String(r.id).padStart(2, '0')}.wav`))
    }
    if (srt && gen.rows.length) {
      // Use fmtTime (MM:SS with rollover) so batches >=15 lines stay valid SRT;
      // prefix "00:" for the hours field. (Timing is a fixed 4s/line estimate.)
      const srtText = gen.rows.map((r, i) => `${i + 1}\n00:${fmtTime(i * 4)},000 --> 00:${fmtTime(i * 4 + 4)},000\n${r.text}\n`).join('\n')
      dl(new Blob([srtText], { type: 'text/plain' }), 'vonia.srt')
    }
  }

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <VoicePanel lang={lang} mode={mode} setMode={setMode} selVoice={selVoice} onSelect={setSelVoice}
            starred={starred} onStar={onStar} random={random} setRandom={setRandom}
            voices={[...VOICES, ...store.userUIVoices]} previewLang={LANG_NAME[language]} />
          <AdvancedSettings lang={lang} s={s} set={set} open={false} />
          <AudioTuning lang={lang} s={s} set={set} open={false} />
          <BatchPanel lang={lang} s={s} set={set} />
          <ExportPanel lang={lang} onExport={onExport} />
        </div>
        <div className="railfoot">
          <GenBar lang={lang} running={gen.running} status={gen.status} progress={gen.progress} onStart={start} onStop={gen.stop} />
        </div>
      </div>

      <div className="stage">
        <div>
          <div className="stage-head">
            <span className="st-title"><Icon name="type" size={17} style={{ color: 'var(--accent)' }} />{t(lang, 'text_content')}</span>
            <span className="charcount tnum">{text.length} {lang === 'en' ? 'chars' : 'ký tự'}</span>
          </div>
          <textarea className="bigtext" value={text} onChange={e => setText(e.target.value)} placeholder={t(lang, 'tts_text_ph')} />
        </div>

        <div className="row between wrap gap10">
          <div className="row gap10">
            <span className="field-label" style={{ margin: 0 }}>{t(lang, 'split_style')}</span>
            <Select width={200} value={split} onChange={setSplit} options={[
              { value: 'period', label: t(lang, 'split_auto') },
              { value: 'newline', label: lang === 'en' ? 'By line break' : 'Theo dòng' },
              { value: 'comma', label: lang === 'en' ? 'By comma' : 'Theo dấu phẩy' },
              { value: 'none', label: lang === 'en' ? 'No split' : 'Không tách' }]} />
          </div>
          <div className="row gap10">
            <Btn variant="subtle" size="sm" icon="table" onClick={toTable}>{t(lang, 'input_table')}</Btn>
          </div>
        </div>

        <div className="results-wrap">
          {gen.hasResults ? (
            <div className="results-scroll"><ResultsTable rows={gen.rows} lang={lang} cols="time" onRetry={gen.retry} onPlay={(r: GenRow) => setPlaySrc(r.url || null)} /></div>
          ) : (
            <>
              <table className="rtable"><thead><tr>
                <th className="num">#</th><th style={{ width: 96 }}>{t(lang, 'col_time')}</th><th>{t(lang, 'col_content')}</th>
                <th style={{ width: 150 }}>{t(lang, 'col_status')}</th><th style={{ width: 120 }}>{t(lang, 'col_action')}</th>
              </tr></thead></table>
              <div className="empty">
                <div className="em-art"><Icon name="type" size={34} /></div>
                <div className="em-title">{lang === 'en' ? 'No audio yet' : 'Chưa có âm thanh'}</div>
                <div className="em-sub">{lang === 'en' ? 'Type or import text, choose a voice, then Generate. Each line becomes a row you can play, retry or export.' : 'Nhập hoặc nhập tệp văn bản, chọn giọng rồi bấm Bắt đầu tạo. Mỗi dòng là một hàng để phát, thử lại hoặc xuất.'}</div>
                <div className="em-steps">
                  <span className="em-step"><span className="n">1</span>{t(lang, 'step_text')}</span>
                  <span className="em-step"><span className="n">2</span>{t(lang, 'step_voice')}</span>
                  <span className="em-step"><span className="n">3</span>{t(lang, 'start')}</span>
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
