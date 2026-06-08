/* Shared setting panels — ported from panels.jsx. */
import React, { useCallback, useState } from 'react'
import { Icon, Select, Slider, Toggle, Panel, Btn, useToast } from './ui'
import { t, type Lang } from '../lib/i18n'
import { LANGUAGES, PROC_MODES } from '../lib/data'

export interface Settings {
  detail: number; adherence: number; speed: number; pause: number
  proc: string; normalize: boolean; concurrent: number
}
export const DEFAULTS: Settings = {
  detail: 32, adherence: 2.0, speed: 1.0, pause: 300, proc: 'broadcast', normalize: true, concurrent: 1,
}

export function useSettings(initial: Settings): [Settings, (k: keyof Settings, v: any) => void] {
  const [s, setS] = useState<Settings>(initial)
  const set = useCallback((k: keyof Settings, v: any) => setS(prev => ({ ...prev, [k]: v })), [])
  return [s, set]
}

export function LanguageField({ lang, value, onChange }: { lang: Lang; value: string; onChange: (v: string) => void }) {
  return (
    <div className="row between gap10">
      <div className="field-label" style={{ marginBottom: 0 }}><Icon name="globe" size={14} />{t(lang, 'language')}</div>
      <Select value={value} onChange={onChange} width={190}
        options={LANGUAGES.map(l => ({ value: l.id, label: l.label, flag: l.flag, native: l.native }))}
        renderValue={(o: any) => <span><span className="flag" style={{ marginRight: 8 }}>{o.flag}</span>{o.label}</span>}
        renderOption={(o: any) => <span className="row gap10"><span className="flag">{o.flag}</span><span>{o.label}</span><span className="faint" style={{ fontSize: 12 }}>{o.native}</span></span>}
      />
    </div>
  )
}

export function AdvancedSettings({ lang, s, set, open = true }: any) {
  return (
    <Panel title={t(lang, 'adv_settings')} icon="sliders" defaultOpen={open} tight>
      <Slider label={t(lang, 'detail')} value={s.detail} min={0} max={100} step={1} defaultValue={DEFAULTS.detail} onChange={(v: number) => set('detail', v)} />
      <Slider label={t(lang, 'adherence')} value={s.adherence} min={0.5} max={5} step={0.05} defaultValue={DEFAULTS.adherence} onChange={(v: number) => set('adherence', v)} format={(v: number) => v.toFixed(2)} />
      <Slider label={t(lang, 'speed')} value={s.speed} min={0.5} max={2} step={0.05} defaultValue={DEFAULTS.speed} onChange={(v: number) => set('speed', v)} format={(v: number) => v.toFixed(2) + 'x'} />
      {s.pause !== undefined && <Slider label={t(lang, 'pause')} value={s.pause} min={0} max={1000} step={50} defaultValue={DEFAULTS.pause} onChange={(v: number) => set('pause', v)} format={(v: number) => v + 'ms'} />}
    </Panel>
  )
}

export function AudioTuning({ lang, s, set, open = true }: any) {
  const modes = PROC_MODES[lang] || PROC_MODES.vi
  const cur = modes.find(m => m.id === s.proc) || modes[0]
  return (
    <Panel title={t(lang, 'audio_tune')} icon="wave2" defaultOpen={open} tight>
      <div>
        <div className="field-label">{t(lang, 'proc_mode')}</div>
        <Select value={s.proc} onChange={(v: string) => set('proc', v)}
          options={modes.map(m => ({ value: m.id, label: m.label, icon: m.icon }))}
          renderValue={(o: any) => <span className="row gap6"><Icon name={o.icon} size={14} style={{ color: 'var(--accent)' }} />{o.label}</span>}
          renderOption={(o: any) => <span className="row gap10"><Icon name={o.icon} size={15} />{o.label}</span>}
        />
        <div className="hint" style={{ marginTop: 8 }}>{cur.desc}</div>
      </div>
      <Toggle on={s.normalize} onChange={(v: boolean) => set('normalize', v)}>{t(lang, 'normalize')}</Toggle>
    </Panel>
  )
}

export function BatchPanel({ lang, s, set }: any) {
  return (
    <Panel title={t(lang, 'batch')} icon="layers" defaultOpen={false} tight>
      <Slider label={t(lang, 'concurrent')} value={s.concurrent} min={1} max={8} step={1} defaultValue={1} onChange={(v: number) => set('concurrent', v)} />
      <Slider label={t(lang, 'pause')} value={s.pause || 300} min={0} max={1000} step={50} defaultValue={300} onChange={(v: number) => set('pause', v)} format={(v: number) => v + 'ms'} />
    </Panel>
  )
}

export function ExportPanel({ lang, onExport }: { lang: Lang; onExport?: (fmt: string, type: string, srt: boolean) => void }) {
  const [fmt, setFmt] = useState('wav')
  const [type, setType] = useState('merge')
  const [srt, setSrt] = useState(true)
  const toast = useToast()
  return (
    <Panel title={t(lang, 'export_sec')} icon="download" defaultOpen={false} tight>
      <div>
        <div className="field-label">{t(lang, 'format')}</div>
        <Select value={fmt} onChange={setFmt} options={[
          { value: 'wav', label: 'WAV' }, { value: 'mp3', label: 'MP3' }]} />
      </div>
      <div>
        <div className="field-label">{t(lang, 'export_type')}</div>
        <Select value={type} onChange={setType} options={[
          { value: 'merge', label: t(lang, 'export_merge') }, { value: 'split', label: t(lang, 'export_split') }]} />
      </div>
      <Toggle on={srt} onChange={setSrt}>{t(lang, 'export_srt')}</Toggle>
      <Btn variant="primary" icon="save" block onClick={() => {
        if (onExport) onExport(fmt, type, srt)
        else toast({ kind: 'good', title: t(lang, 'audio_exported') })
      }}>{t(lang, 'export')}</Btn>
    </Panel>
  )
}
