import React, { useEffect, useState } from 'react'
import { Icon, Btn, Select, useToast } from '../components/ui'
import { t, type Lang } from '../lib/i18n'
import * as api from '../lib/api'

// UI idle option <-> minutes (0 = "never"). After this long with no generation
// the model is moved off the GPU, freeing VRAM until the next request.
const idleToMinutes = (v: string) => (v === 'never' ? 0 : parseInt(v, 10))
const minutesToIdle = (m: number) => (m === 0 ? 'never' : String(m))

// Brand the model name for display only — the backend keeps its real model_id
// (used to load weights / OpenAI-compat APIs); we just relabel it in the UI.
const brandModel = (m?: string | null) =>
  (m && m.trim() ? m : 'Vonia').replace(/(?:[\w./-]*\/)?omnivoice/gi, 'Vonia')

function SectionCard({ title, icon, children }: any) {
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div className="row gap10" style={{ marginBottom: 16 }}>
        <span className="badge accent" style={{ padding: '5px 11px' }}><Icon name={icon} size={14} />{title}</span>
      </div>
      {children}
    </div>
  )
}

export function EnvTab({ lang }: { lang: Lang }) {
  const toast = useToast()
  const [health, setHealth] = useState<any>(null)
  const [info, setInfo] = useState<any>(null)
  const [accel, setAccel] = useState('auto')
  const [vramCfg, setVramCfg] = useState<api.VramStatus | null>(null)
  const [savingIdle, setSavingIdle] = useState(false)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
    api.info().then(setInfo).catch(() => setInfo(null))
    api.getVram().then(setVramCfg).catch(() => setVramCfg(null))
  }, [])

  const idle = vramCfg ? minutesToIdle(vramCfg.idle_minutes) : '5'
  const changeIdle = async (v: string) => {
    setSavingIdle(true)
    try {
      const next = await api.setVramIdle(idleToMinutes(v))
      setVramCfg(next)
      toast({ kind: 'good', title: t(lang, 'vram_saved') })
    } catch (e: any) {
      toast({ kind: 'err', title: String(e?.message || e) })
    } finally { setSavingIdle(false) }
  }

  const vram = health?.vram
  const device = health?.device || '—'
  const ready = !!health

  return (
    <div className="stage" style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <SectionCard title={t(lang, 'model_mgmt')} icon="layers">
        <div className="row between wrap gap14">
          <div className="stack gap10" style={{ flex: 1, minWidth: 280 }}>
            <div className="row gap10">
              <span className="muted" style={{ fontSize: 13 }}>{t(lang, 'status')}:</span>
              <span className={'status-pill ' + (ready ? 'done' : 'err')}>
                <span className="d" />{ready ? t(lang, 'on_device') : t(lang, 'not_on_device')}
              </span>
            </div>
            <div className="hint mono">{t(lang, 'model_label')}: {brandModel(info?.model || health?.model)} · {info?.sampling_rate || 24000} Hz</div>
          </div>
          <div className="row gap10">
            <Btn variant="ghost" icon="refresh" onClick={() => { api.health().then(setHealth).catch(() => {}); api.info().then(setInfo).catch(() => {}) }}>{t(lang, 'refresh')}</Btn>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t(lang, 'hardware')} icon="cpu">
        <div className="card" style={{ background: 'var(--grad-soft)', border: '1px solid var(--accent-line)', padding: '16px 18px', marginBottom: 16 }}>
          <div className="row between">
            <div className="stack gap6">
              <div className="row gap10"><span className="muted" style={{ fontSize: 13 }}>{t(lang, 'gpu')}:</span><strong style={{ fontSize: 14.5 }}>{device}</strong></div>
              <span className="status-pill done"><Icon name="sparkles" size={14} />{t(lang, 'good_support')}</span>
            </div>
            <Icon name="cpu" size={40} style={{ color: 'var(--accent)', opacity: .65 }} />
          </div>
          {vram && (
            <div style={{ marginTop: 14 }}>
              <div className="row between" style={{ fontSize: 12.5, marginBottom: 6 }}>
                <span className="muted">VRAM</span>
                <span className="mono">{vram.used_mb} / {vram.total_mb} MB</span>
              </div>
              <div className="progress"><i style={{ width: (100 * vram.used_mb / vram.total_mb) + '%' }} /></div>
            </div>
          )}
        </div>
        <div className="row between wrap gap14" style={{ marginBottom: 16 }}>
          <span className="field-label" style={{ margin: 0 }}>{t(lang, 'hw_accel')}</span>
          <Select width={220} value={accel} onChange={setAccel} options={[
            { value: 'auto', label: 'Auto' }, { value: 'cuda', label: 'CUDA (NVIDIA)' }, { value: 'metal', label: 'Metal (Apple)' }, { value: 'cpu', label: 'CPU' }]} />
        </div>
        <div className="banner warn"><Icon name="warn" size={16} className="bico" /><span>{t(lang, 'hw_note')}</span></div>
      </SectionCard>

      <SectionCard title={t(lang, 'auto_vram')} icon="zap">
        <div className="row between wrap gap14">
          <span className="field-label" style={{ margin: 0 }}>{t(lang, 'when_idle')}</span>
          <Select width={220} value={idle} onChange={changeIdle} disabled={savingIdle || (vramCfg ? !vramCfg.supported : false)} options={[
            { value: '5', label: t(lang, 'min5') }, { value: '10', label: t(lang, 'min10') }, { value: '15', label: t(lang, 'min15') }, { value: 'never', label: t(lang, 'never') }]} />
        </div>
        {vramCfg && (
          <div className="stack gap10" style={{ marginTop: 14 }}>
            <div className="row gap10">
              <span className="muted" style={{ fontSize: 13 }}>{t(lang, 'status')}:</span>
              {!vramCfg.supported ? (
                <span className="status-pill"><span className="d" />{t(lang, 'vram_cpu_status')}</span>
              ) : vramCfg.offloaded ? (
                <span className="status-pill idle"><span className="d" />{t(lang, 'vram_released')}</span>
              ) : (
                <span className="status-pill done"><span className="d" />{t(lang, 'vram_resident')}</span>
              )}
            </div>
            <div className="hint" style={{ display: 'flex', gap: 6 }}>
              <Icon name="info" size={13} style={{ flex: 'none', marginTop: 2, color: 'var(--accent)' }} />
              <span>
                {!vramCfg.supported
                  ? t(lang, 'vram_cpu_note')
                  : vramCfg.idle_minutes === 0
                    ? t(lang, 'vram_off_hint')
                    : t(lang, 'vram_on_hint').replace('{n}', String(vramCfg.idle_minutes))}
              </span>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
