import React, { useRef, useState } from 'react'
import { Icon, Btn, Select, useToast } from '../components/ui'
import { GenBar } from '../components/results'
import { t, type Lang } from '../lib/i18n'
import { LANGUAGES, STT_MODELS } from '../lib/data'
import * as api from '../lib/api'

interface Seg { id: number; time: string; start: number | null; end: number | null; text: string }

function fmtClock(s: number | null) {
  if (s == null || !isFinite(s)) return '00:00'
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
function fmtSrt(s: number | null) {
  const x = s == null || !isFinite(s) ? 0 : s
  const ms = Math.floor((x % 1) * 1000)
  return `${String(Math.floor(x / 3600)).padStart(2, '0')}:${String(Math.floor((x % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

export function SttTab({ lang }: { lang: Lang }) {
  const [file, setFile] = useState<File | null>(null)
  const [model, setModel] = useState('turbo')
  const [audioLang, setAudioLang] = useState('auto')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [rows, setRows] = useState<Seg[]>([])
  const [exportFmt, setExportFmt] = useState('txt')
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const start = async () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_file_first') }); return }
    setRunning(true); setProgress(10); setRows([])
    toast({ kind: 'info', title: t(lang, 'transcribing'), desc: STT_MODELS.find(m => m.id === model)?.label })
    try {
      const r = await api.stt(file, model, audioLang)
      const segs: Seg[] = (r.segments || []).map((c, i) => ({
        id: i + 1, start: c.start, end: c.end,
        time: `${fmtClock(c.start)} → ${fmtClock(c.end)}`, text: c.text,
      }))
      setRows(segs.length ? segs : [{ id: 1, start: 0, end: null, time: '00:00', text: r.text }])
      setProgress(100)
      toast({ kind: 'good', title: t(lang, 'transcription_complete') })
    } catch (e: any) {
      toast({ kind: 'err', title: String(e?.message || e) })
    } finally { setRunning(false) }
  }

  const doExport = () => {
    if (!rows.length) { toast({ kind: 'err', title: t(lang, 'nothing_to_export') }); return }
    let content = '', ext = exportFmt
    if (exportFmt === 'txt') content = rows.map(r => r.text).join('\n')
    else if (exportFmt === 'json') content = JSON.stringify(rows.map(r => ({ start: r.start, end: r.end, text: r.text })), null, 2)
    else if (exportFmt === 'srt') content = rows.map((r, i) => `${i + 1}\n${fmtSrt(r.start)} --> ${fmtSrt(r.end)}\n${r.text}\n`).join('\n')
    else if (exportFmt === 'vtt') content = 'WEBVTT\n\n' + rows.map(r => `${fmtSrt(r.start).replace(',', '.')} --> ${fmtSrt(r.end).replace(',', '.')}\n${r.text}\n`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = `vonia_transcript.${ext}`; a.click(); URL.revokeObjectURL(u)
    toast({ kind: 'good', title: t(lang, 'export_result') })
  }

  const audioLangOpts = [{ value: 'auto', label: t(lang, 'auto_detect') }, ...LANGUAGES.map(l => ({ value: l.id, label: l.label, flag: l.flag }))]

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <div>
            <div className="field-label">{t(lang, 'audio_video')}</div>
            <input ref={fileRef} type="file" accept="audio/*,video/*" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
            <div className="input-with-btn">
              <div className={'input-file' + (file ? '' : ' placeholder')} onClick={() => fileRef.current?.click()}>
                <Icon name="audio" size={15} style={{ color: file ? 'var(--accent)' : 'var(--text-faint)' }} />
                <span className="fname mono" style={{ fontSize: 12 }}>{file ? file.name : t(lang, 'no_file')}</span>
              </div>
              <Btn variant="subtle" onClick={() => fileRef.current?.click()}>{t(lang, 'choose')}</Btn>
            </div>
          </div>

          <div>
            <div className="field-label">{t(lang, 'recog_model')}</div>
            <Select value={model} onChange={setModel} options={STT_MODELS.map(m => ({ value: m.id, label: `${m.label} · ${m.size} · ${m.vram}`, m }))}
              renderValue={(o: any) => <span>{o.m.label} <span className="faint mono" style={{ fontSize: 11.5 }}>· {o.m.size} · {o.m.vram}</span></span>}
              renderOption={(o: any) => <span className="row gap6">{o.m.label}<span className="faint mono" style={{ fontSize: 11.5 }}>· {o.m.size} · {o.m.vram}</span></span>} />
          </div>

          <div>
            <div className="field-label">{t(lang, 'audio_lang')}</div>
            <Select value={audioLang} onChange={setAudioLang} options={audioLangOpts}
              renderValue={(o: any) => <span>{o.flag ? <span className="flag" style={{ marginRight: 8 }}>{o.flag}</span> : null}{o.label}</span>}
              renderOption={(o: any) => <span className="row gap10">{o.flag ? <span className="flag">{o.flag}</span> : <Icon name="sparkles" size={14} style={{ color: 'var(--accent)' }} />}{o.label}</span>} />
          </div>

          <div className="banner info" style={{ marginTop: 'auto' }}><Icon name="info" size={16} className="bico" /><span>{t(lang, 'stt_model_hint')}</span></div>
        </div>
        <div className="railfoot stack gap10">
          <GenBar lang={lang} running={running} status={running ? 'run' : (rows.length ? 'done' : 'idle')} progress={progress} onStart={start} onStop={() => setRunning(false)} />
          <div className="row gap10">
            <Select width={110} value={exportFmt} onChange={setExportFmt} options={[{ value: 'txt', label: 'TXT' }, { value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'VTT' }, { value: 'json', label: 'JSON' }]} />
            <Btn variant="subtle" icon="save" onClick={doExport}>{t(lang, 'export_result')}</Btn>
          </div>
        </div>
      </div>

      <div className="stage">
        <div className="stage-head">
          <span className="st-title"><Icon name="filetext" size={17} style={{ color: 'var(--accent)' }} />{t(lang, 'extract_result')}</span>
          {rows.length > 0 && <Btn variant="ghost" size="sm" icon="copy" onClick={() => { navigator.clipboard?.writeText(rows.map(r => r.text).join('\n')); toast({ kind: 'good', title: t(lang, 'copied') }) }}>{t(lang, 'copy_all')}</Btn>}
        </div>
        <div className="results-wrap">
          {rows.length > 0 ? (
            <div className="results-scroll">
              <table className="rtable">
                <thead><tr><th className="num">#</th><th style={{ width: 150 }}>{t(lang, 'col_time')}</th><th>{t(lang, 'col_content')}</th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}><td className="num">{String(r.id).padStart(2, '0')}</td><td className="tcode">{r.time}</td><td>{r.text}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <table className="rtable"><thead><tr><th className="num">#</th><th style={{ width: 150 }}>{t(lang, 'col_time')}</th><th>{t(lang, 'col_content')}</th></tr></thead></table>
              <div className="empty">
                <div className="em-art"><Icon name="filetext" size={34} /></div>
                <div className="em-title">{t(lang, 'no_transcript')}</div>
                <div className="em-sub">{t(lang, 'stt_empty')}</div>
                <div className="em-steps">
                  <span className="em-step"><span className="n">1</span>{t(lang, 'step_file')}</span>
                  <span className="em-step"><span className="n">2</span>{t(lang, 'step_model')}</span>
                  <span className="em-step"><span className="n">3</span>{t(lang, 'start')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
