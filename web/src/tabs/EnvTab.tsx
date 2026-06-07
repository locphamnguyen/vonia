import React, { useEffect, useState } from 'react'
import { Icon, Btn, Select } from '../components/ui'
import { t, type Lang } from '../lib/i18n'
import * as api from '../lib/api'

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
  const [health, setHealth] = useState<any>(null)
  const [info, setInfo] = useState<any>(null)
  const [accel, setAccel] = useState('auto')
  const [idle, setIdle] = useState('5')

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
    api.info().then(setInfo).catch(() => setInfo(null))
  }, [])

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
            <div className="hint mono">{t(lang, 'model_label')}: {info?.model || health?.model || 'k2-fsa/OmniVoice'} · {info?.sampling_rate || 24000} Hz</div>
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
          <Select width={220} value={idle} onChange={setIdle} options={[
            { value: '5', label: t(lang, 'min5') }, { value: '10', label: t(lang, 'min10') }, { value: '15', label: t(lang, 'min15') }, { value: 'never', label: t(lang, 'never') }]} />
        </div>
      </SectionCard>
    </div>
  )
}
