import React, { useEffect, useState } from 'react'
import { Icon, Btn, Select, Modal, useToast } from './ui'
import { PaymentModal } from './PaymentModal'
import { t, type Lang } from '../lib/i18n'
import * as api from '../lib/api'

const fmtVnd = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

function LicenseTab({ lang }: { lang: Lang }) {
  const toast = useToast()
  const [me, setMe] = useState<api.MeInfo | null>(null)
  const [cfg, setCfg] = useState<api.PaymentConfig | null>(null)
  const [sub, setSub] = useState<api.Subscription | null>(null)
  const [plans, setPlans] = useState<api.Plan[]>([])
  const [showPay, setShowPay] = useState(false)

  const loadSub = () => api.getSubscription().then(setSub).catch(() => {})
  useEffect(() => {
    api.getMe().then(setMe).catch(() => {})
    api.getPaymentConfig().then(setCfg).catch(() => {})
    api.getPlans().then(setPlans).catch(() => {})
    loadSub()
  }, [])

  const studio = plans.find(p => p.id === 'studio_monthly')
  const active = !!sub?.active

  return (
    <div className="stack gap18">
      <div className="row between wrap gap10">
        <div className="row gap10 wrap">
          {me ? (
            <>
              <span className="badge muted" style={{ padding: '8px 12px' }}><Icon name="user" size={15} />{t(lang, 'user')}: <strong>{me.email}</strong></span>
              {me.sub && <span className="badge accent" style={{ padding: '8px 12px' }}>ID: {me.sub}</span>}
            </>
          ) : <span className="badge muted" style={{ padding: '8px 12px' }}><Icon name="user" size={15} />{t(lang, 'user')}: <strong>{t(lang, 'guest')}</strong></span>}
          {cfg?.env === 'sandbox' && <span className="badge warn" style={{ padding: '8px 12px' }}><Icon name="warn" size={13} />{t(lang, 'sandbox_badge')}</span>}
        </div>
        <div className="row gap10">
          {me ? (
            <>
              <Btn variant="subtle" icon="refresh" onClick={() => { loadSub(); toast({ kind: 'info', title: t(lang, 'refresh') }) }}>{t(lang, 'refresh')}</Btn>
              <Btn variant="danger" icon="login" onClick={() => { window.location.href = '/logout' }}>{t(lang, 'logout_device')}</Btn>
            </>
          ) : <Btn variant="danger" icon="login" onClick={() => { window.location.href = '/auth/login' }}>{t(lang, 'sign_in_google')}</Btn>}
        </div>
      </div>

      {active
        ? <div className="banner info"><Icon name="check" size={16} className="bico" /><span>{t(lang, 'plan_studio')} · {t(lang, 'sub_active')} — {t(lang, 'sub_expires')}: <strong>{fmtDate(sub!.expires_at)}</strong> ({t(lang, 'plan_days').replace('{n}', String(sub!.days_left))})</span></div>
        : <div className="banner warn"><Icon name="info" size={16} className="bico" /><span>{t(lang, 'sub_trial')}</span></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: '22px 20px', textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>{t(lang, 'plan_trial')}</div>
          <div style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 16px' }}>{t(lang, 'free')}</div>
          <Btn variant={active ? 'subtle' : 'good'} block icon="check" disabled>{active ? t(lang, 'included') : t(lang, 'using_now')}</Btn>
        </div>
        <div className="card" style={{ padding: '22px 20px', textAlign: 'center', borderColor: 'var(--accent-line)', background: 'var(--grad-soft)' }}>
          <div style={{ fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--accent)' }}>{t(lang, 'plan_studio')}</div>
          <div style={{ margin: '8px 0 16px' }}><span style={{ fontSize: 24, fontWeight: 800 }}>{studio ? fmtVnd(studio.amount) : '100.000đ'}</span> <span className="muted" style={{ fontSize: 13 }}>{t(lang, 'per_days')}</span></div>
          {active
            ? <Btn variant="good" block icon="check" disabled>{t(lang, 'using_now')}</Btn>
            : <Btn variant="primary" block icon="bolt" onClick={() => setShowPay(true)}>{t(lang, 'upgrade_now')}</Btn>}
        </div>
      </div>

      {showPay && <PaymentModal lang={lang} onClose={() => setShowPay(false)} onPaid={loadSub} />}

      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span><Icon name="info" size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--accent)' }} />{t(lang, 'trial_limit')}</span>
          <span><Icon name="warn" size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--warn)' }} />{t(lang, 'try_first')}</span>
          <span><Icon name="warn" size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--warn)' }} />{t(lang, 'no_refund')}</span>
        </div>
      </div>
    </div>
  )
}

function GeneralTab({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [naming, setNaming] = useState('default')
  const [sep, setSep] = useState('underscore')
  const langs = [
    { id: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' }, { id: 'en', flag: '🇺🇸', label: 'English' },
    { id: 'bn', flag: '🇧🇩', label: 'বাংলা' }, { id: 'hi', flag: '🇮🇳', label: 'हिन्दी' }, { id: 'pt', flag: '🇵🇹', label: 'Português' },
    { id: 'ru', flag: '🇷🇺', label: 'Русский' }, { id: 'tr', flag: '🇹🇷', label: 'Türkçe' }, { id: 'ur', flag: '🇵🇰', label: 'اردو' }, { id: 'zh', flag: '🇨🇳', label: '简体中文' }]
  return (
    <div className="stack gap18">
      <div>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="globe" size={14} />{t(lang, 'interface_lang')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {langs.map((l) => {
            const ready = l.id === 'vi' || l.id === 'en'  // only VI/EN are translated today
            return (
              <button key={l.id} className={'btn' + (l.id === lang ? ' ' : ' ghost')}
                disabled={!ready}
                title={ready ? l.label : t(lang, 'coming_soon')}
                onClick={() => { if (ready) setLang(l.id as Lang) }}
                style={{ justifyContent: 'flex-start', padding: '12px 14px', position: 'relative',
                  borderColor: l.id === lang ? 'var(--accent)' : 'var(--border)',
                  color: l.id === lang ? 'var(--accent)' : 'var(--text)',
                  opacity: ready ? 1 : 0.45, cursor: ready ? 'pointer' : 'not-allowed' }}>
                <span style={{ fontSize: 18 }}>{l.flag}</span>{l.label}
                {!ready && <span className="badge" style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 6px' }}>{t(lang, 'coming_soon')}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="file" size={14} />{t(lang, 'file_naming')}</div>
        <div className="card" style={{ padding: 18 }}>
          <div className="stack gap14">
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'naming_style')}</span>
              <Select value={naming} onChange={setNaming} options={[{ value: 'default', label: t(lang, 'naming_default') }, { value: 'date', label: t(lang, 'naming_date') }, { value: 'voice', label: t(lang, 'naming_voice') }]} /></div>
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'prefix')}</span><input className="input" placeholder={t(lang, 'enter_prefix')} /></div>
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'separator')}</span>
              <Select value={sep} onChange={setSep} options={[{ value: 'underscore', label: t(lang, 'sep_underscore') }, { value: 'dash', label: 'Dash (-)' }, { value: 'space', label: t(lang, 'sep_space') }]} /></div>
            <div className="divider" />
            <div className="row gap10"><span className="muted" style={{ fontSize: 13 }}>{t(lang, 'preview')}:</span>
              <span className="badge good mono" style={{ padding: '7px 12px' }}><Icon name="file" size={13} />1_Xin_chao_cac_ban.wav</span></div>
          </div>
        </div>
      </div>
      <div>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="user" size={14} />{t(lang, 'author')}</div>
        <div className="card" style={{ padding: 18 }}>
          <div className="stack gap10">
            <div className="row gap10"><span className="muted" style={{ width: 90, fontSize: 13 }}>{t(lang, 'name')}:</span><strong>Vonia Team</strong></div>
            <div className="row gap10"><span className="muted" style={{ width: 90, fontSize: 13 }}>{t(lang, 'website')}:</span><a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>https://vonia.studio</a></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LogsTab({ lang }: { lang: Lang }) {
  return (
    <div className="stack gap14">
      <div className="card" style={{ minHeight: 340, background: 'var(--inset)', padding: 16 }}>
        <div className="vempty" style={{ padding: '80px 16px' }}>
          <div className="ve-icon"><Icon name="filetext" size={22} /></div>
          <div className="ve-text">{t(lang, 'no_logs')}</div>
        </div>
      </div>
    </div>
  )
}

export function SettingsModal({ lang, setLang, onClose }: { lang: Lang; setLang: (l: Lang) => void; onClose: () => void }) {
  const [tab, setTab] = useState('license')
  return (
    <Modal onClose={onClose} className="modal-lg">
      <div className="modal-head">
        <span className="badge accent" style={{ padding: '6px 10px' }}><Icon name="settings" size={15} /></span>
        <span className="mt">{t(lang, 'sys_settings')}</span>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>
      <div className="modal-tabs">
        {[['license', t(lang, 'tab_license')], ['general', t(lang, 'tab_general')], ['logs', t(lang, 'tab_logs')]].map(([id, label]) => (
          <button key={id} className={'modal-tab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="modal-body">
        {tab === 'license' && <LicenseTab lang={lang} />}
        {tab === 'general' && <GeneralTab lang={lang} setLang={setLang} />}
        {tab === 'logs' && <LogsTab lang={lang} />}
      </div>
    </Modal>
  )
}
