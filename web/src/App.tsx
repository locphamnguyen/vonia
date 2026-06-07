import React, { useCallback, useEffect, useState } from 'react'
import { AppCtx, ToastProvider, Icon } from './components/ui'
import { t, type Lang } from './lib/i18n'
import { VoicesProvider, useVoices } from './app/store'
import { CloneTab } from './tabs/CloneTab'
import { TtsTab } from './tabs/TtsTab'
import { DialogueTab } from './tabs/DialogueTab'
import { SttTab } from './tabs/SttTab'
import { EnvTab } from './tabs/EnvTab'
import { WebhookView } from './tabs/WebhookView'
import { SettingsModal } from './components/SettingsModal'
import { Onboarding } from './components/Onboarding'

function Sidebar({ lang, nav, setNav, onSettings }: any) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Icon name="audio" size={20} style={{ color: 'var(--accent-ink)' }} /></span>
        <div>
          <div className="brand-name">Vonia<span className="dot">.</span></div>
          <div className="brand-sub">Voice Studio</div>
        </div>
      </div>
      <div className="nav-section-label">Studio</div>
      <button className={'nav-item' + (nav === 'studio' ? ' active' : '')} onClick={() => setNav('studio')}>
        <Icon name="library" size={18} className="ico" />{t(lang, 'nav_studio')}
      </button>
      <button className={'nav-item' + (nav === 'webhook' ? ' active' : '')} onClick={() => setNav('webhook')}>
        <Icon name="webhook" size={18} className="ico" />{t(lang, 'nav_webhook')}
        <span className="nav-badge">Beta</span>
      </button>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <div className="plan-card">
          <div className="plan-top">
            <span className="plan-pill"><Icon name="bolt" size={12} />{t(lang, 'plan_studio')}</span>
            <span className="grow" />
            <span className="plan-meta" style={{ margin: 0 }}>{t(lang, 'plan_days')}</span>
          </div>
          <div className="plan-bar"><i style={{ width: '70%' }} /></div>
        </div>
        <button className="nav-item" onClick={onSettings}>
          <Icon name="settings" size={18} className="ico" />{t(lang, 'nav_settings')}
        </button>
        <div className="social-row">
          <button className="social-btn" title="Discord"><Icon name="discord" size={17} /></button>
          <button className="social-btn" title="YouTube"><Icon name="youtube" size={17} /></button>
          <button className="social-btn" title="Website"><Icon name="globe" size={17} /></button>
        </div>
      </div>
    </aside>
  )
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

export default function App() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('vonia.theme') || 'dark')
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('vonia.lang') as Lang) || 'vi')
  const [nav, setNav] = useState('studio')
  const [tab, setTab] = useState('clone')
  const [showSettings, setShowSettings] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('vonia.onboarded') !== '1')
  const [starred, setStarred] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('vonia.starred') || '[]')))

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('vonia.theme', theme) }, [theme])
  useEffect(() => { document.documentElement.lang = lang; localStorage.setItem('vonia.lang', lang) }, [lang])
  useEffect(() => { localStorage.setItem('vonia.starred', JSON.stringify([...starred])) }, [starred])

  const onStar = useCallback((name: string) => setStarred(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n }), [])
  const closeOnboarding = () => { setShowOnboarding(false); localStorage.setItem('vonia.onboarded', '1') }

  const tabProps = { lang, starred, onStar }

  return (
    <AppCtx.Provider value={{ lang, theme }}>
      <ToastProvider>
        <VoicesProvider>
          <div className="app">
            <Sidebar lang={lang} nav={nav} setNav={setNav} onSettings={() => setShowSettings(true)} />
            <div className="main">
              <ConnectionBanner lang={lang} />
              {nav === 'studio' ? (
                <>
                  <Topbar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} tab={tab} setTab={setTab} />
                  <div className="content">
                    {tab === 'clone' && <CloneTab {...tabProps} />}
                    {tab === 'tts' && <TtsTab {...tabProps} />}
                    {tab === 'dialogue' && <DialogueTab {...tabProps} />}
                    {tab === 'stt' && <SttTab lang={lang} />}
                    {tab === 'env' && <EnvTab lang={lang} />}
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
          {showSettings && <SettingsModal lang={lang} setLang={setLang} onClose={() => setShowSettings(false)} />}
          {showOnboarding && <Onboarding lang={lang} onClose={closeOnboarding} />}
        </VoicesProvider>
      </ToastProvider>
    </AppCtx.Provider>
  )
}
