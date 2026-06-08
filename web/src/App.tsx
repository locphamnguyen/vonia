import React, { useCallback, useEffect, useState } from 'react'
import { AppCtx, ToastProvider, Icon, useToast } from './components/ui'
import { t, type Lang } from './lib/i18n'
import { VoicesProvider, useVoices } from './app/store'
import * as api from './lib/api'
import { CloneTab } from './tabs/CloneTab'
import { TtsTab } from './tabs/TtsTab'
import { DialogueTab } from './tabs/DialogueTab'
import { SttTab } from './tabs/SttTab'
import { EnvTab } from './tabs/EnvTab'
import { WebhookView } from './tabs/WebhookView'
import { SettingsModal } from './components/SettingsModal'
import { Onboarding } from './components/Onboarding'
import { MobileApp } from './mobile/MobileApp'

// Switch to the dedicated mobile layout on narrow viewports (phones).
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

function Sidebar({ lang, nav, setNav, onSettings, sub }: any) {
  const active = !!sub?.active
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Icon name="audio" size={20} style={{ color: 'var(--accent-ink)' }} /></span>
        <div>
          <div className="brand-name">Vonia<span className="dot">.</span></div>
          <div className="brand-sub">Voice Studio</div>
        </div>
      </div>
      <button className={'nav-item' + (nav === 'studio' ? ' active' : '')} onClick={() => setNav('studio')}>
        <Icon name="library" size={18} className="ico" />{t(lang, 'nav_studio')}
      </button>
      <button className={'nav-item' + (nav === 'webhook' ? ' active' : '')} onClick={() => setNav('webhook')}>
        <Icon name="webhook" size={18} className="ico" />{t(lang, 'nav_webhook')}
      </button>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <button className="nav-item" onClick={onSettings}>
          <Icon name="settings" size={18} className="ico" />{t(lang, 'nav_settings')}
        </button>
        <button className="plan-btn" onClick={onSettings} title={t(lang, 'nav_settings')}>
          <Icon name="bolt" size={14} />{active ? t(lang, 'plan_studio') : t(lang, 'plan_trial')}
        </button>
        <div className="social-row">
          <button className="social-btn" title="Discord" aria-label="Discord"><Icon name="discord" size={17} /></button>
          <button className="social-btn" title="YouTube" aria-label="YouTube"><Icon name="youtube" size={17} /></button>
          <button className="social-btn" title="Website" aria-label="Website"><Icon name="globe" size={17} /></button>
        </div>
      </div>
    </aside>
  )
}

// Handles the redirect back from SePay (success_url/error_url/cancel_url carry
// ?payment=<status>&inv=<invoice>). Lives inside ToastProvider so it can toast.
// On success it polls our backend order status (flipped to "paid" by the IPN, or
// reconciled via SePay's order API) before confirming, then refreshes the plan.
function PaymentReturn({ lang, onPaid }: { lang: Lang; onPaid: () => void }) {
  const toast = useToast()
  useEffect(() => {
    const url = new URL(window.location.href)
    const status = url.searchParams.get('payment')
    if (!status) return
    const inv = url.searchParams.get('inv')
    url.searchParams.delete('payment'); url.searchParams.delete('inv')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)

    if (status === 'cancel') { toast({ kind: 'info', title: t(lang, 'payment_cancelled') }); return }
    if (status === 'error') { toast({ kind: 'err', title: t(lang, 'payment_error') }); return }
    if (status !== 'success') return

    toast({ kind: 'info', title: t(lang, 'checking_payment') })
    let tries = 0
    const poll = async () => {
      tries++
      try {
        const o = inv ? await api.getOrder(inv) : null
        if (o && o.status === 'paid') { toast({ kind: 'good', title: t(lang, 'payment_success') }); onPaid(); return }
        if (o && (o.status === 'cancelled' || o.status === 'error')) { toast({ kind: 'err', title: t(lang, 'payment_error') }); return }
      } catch { /* keep polling */ }
      if (tries < 10) setTimeout(poll, 2000)
      else { toast({ kind: 'info', title: t(lang, 'payment_pending') }); onPaid() }
    }
    poll()
  }, [])  // run once on mount
  return null
}

function ConnectionBanner({ lang }: { lang: Lang }) {
  const { apiOk, apiChecked } = useVoices()
  if (!apiChecked || apiOk) return null
  return (
    <div className="conn-banner" role="alert">
      <Icon name="bolt" size={15} className="ico" />
      <span><strong>{t(lang, 'offline_title')}</strong> {t(lang, 'offline_hint')}</span>
    </div>
  )
}

function LangTheme({ lang, setLang, theme, setTheme }: any) {
  return (
    <div className="topbar-tools">
      <div className="seg">
        <button className={lang === 'vi' ? 'on' : ''} onClick={() => setLang('vi')}>VI</button>
        <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
      </div>
      <div className="seg icon">
        <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} title="Dark"><Icon name="moon" size={15} /></button>
        <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} title="Light"><Icon name="sun" size={15} /></button>
      </div>
    </div>
  )
}

function Topbar({ lang, setLang, theme, setTheme, tab, setTab }: any) {
  const tabs = [
    { id: 'clone', icon: 'mic', label: t(lang, 'tab_clone') },
    { id: 'tts', icon: 'type', label: t(lang, 'tab_tts') },
    { id: 'dialogue', icon: 'message', label: t(lang, 'tab_dialogue') },
    { id: 'stt', icon: 'filetext', label: t(lang, 'tab_stt') },
    { id: 'env', icon: 'sliders', label: t(lang, 'tab_env') },
  ]
  return (
    <div className="topbar">
      <div className="tabs">
        {tabs.map(tb => (
          <button key={tb.id} className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>
            <Icon name={tb.icon} size={16} className="ico" />{tb.label}
          </button>
        ))}
      </div>
      <LangTheme lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} />
    </div>
  )
}

// Keep-alive wrapper: once a tab has been opened it stays mounted, just hidden
// via CSS, instead of being unmounted. This preserves each tab's in-progress
// work (entered text, generated rows, audio blobs) across tab switches — an
// unmount would otherwise wipe the tab's local state and revoke its audio
// object URLs (see useGenerator cleanup). `flex:1 + display:flex column` mirrors
// `.content`'s layout so the inner `.workspace`/`.stage` (which rely on `flex:1`)
// fill the area exactly as they did when rendered directly.
function TabPane({ id, active, children }: { id: string; active: boolean; children: React.ReactNode }) {
  return (
    <div data-tab={id} style={{ flex: 1, minHeight: 0, flexDirection: 'column', display: active ? 'flex' : 'none' }}>
      {children}
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('vonia.theme') || 'dark')
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('vonia.lang') as Lang) || 'vi')
  const [nav, setNav] = useState('studio')
  const [tab, setTab] = useState('clone')
  // Track which studio tabs have been opened so we can keep them mounted (and
  // their work intact) without paying the mount cost for tabs never visited.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['clone']))
  useEffect(() => { setVisited(v => (v.has(tab) ? v : new Set(v).add(tab))) }, [tab])
  const [showSettings, setShowSettings] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('vonia.onboarded') !== '1')
  const [starred, setStarred] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('vonia.starred') || '[]')))
  const [sub, setSub] = useState<api.Subscription | null>(null)
  const refreshSub = useCallback(() => { api.getSubscription().then(setSub).catch(() => {}) }, [])
  useEffect(() => { refreshSub() }, [refreshSub])

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('vonia.theme', theme) }, [theme])
  useEffect(() => { document.documentElement.lang = lang; localStorage.setItem('vonia.lang', lang) }, [lang])
  useEffect(() => { localStorage.setItem('vonia.starred', JSON.stringify([...starred])) }, [starred])

  const onStar = useCallback((name: string) => setStarred(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n }), [])
  const closeOnboarding = () => { setShowOnboarding(false); localStorage.setItem('vonia.onboarded', '1') }

  const tabProps = { lang, starred, onStar }
  const isMobile = useIsMobile()

  return (
    <AppCtx.Provider value={{ lang, theme }}>
      <ToastProvider>
        <VoicesProvider>
          <PaymentReturn lang={lang} onPaid={refreshSub} />
          {isMobile ? (
            <MobileApp lang={lang} setLang={setLang} />
          ) : (
          <div className="app">
            <Sidebar lang={lang} nav={nav} setNav={setNav} onSettings={() => setShowSettings(true)} sub={sub} />
            <div className="main">
              <ConnectionBanner lang={lang} />
              {nav === 'studio' ? (
                <>
                  <Topbar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} tab={tab} setTab={setTab} />
                  <div className="content">
                    {visited.has('clone') && <TabPane id="clone" active={tab === 'clone'}><CloneTab {...tabProps} /></TabPane>}
                    {visited.has('tts') && <TabPane id="tts" active={tab === 'tts'}><TtsTab {...tabProps} /></TabPane>}
                    {visited.has('dialogue') && <TabPane id="dialogue" active={tab === 'dialogue'}><DialogueTab {...tabProps} /></TabPane>}
                    {visited.has('stt') && <TabPane id="stt" active={tab === 'stt'}><SttTab lang={lang} /></TabPane>}
                    {visited.has('env') && <TabPane id="env" active={tab === 'env'}><EnvTab lang={lang} /></TabPane>}
                  </div>
                </>
              ) : (
                <>
                  <div className="topbar">
                    <div className="tabs"><button className="tab active"><Icon name="webhook" size={16} className="ico" />Webhook</button></div>
                    <LangTheme lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} />
                  </div>
                  <div className="content"><WebhookView lang={lang} starred={starred} onStar={onStar} /></div>
                </>
              )}
            </div>
          </div>
          )}
          {showSettings && <SettingsModal lang={lang} setLang={setLang} onClose={() => setShowSettings(false)} />}
          {showOnboarding && <Onboarding lang={lang} onClose={closeOnboarding} />}
        </VoicesProvider>
      </ToastProvider>
    </AppCtx.Provider>
  )
}
