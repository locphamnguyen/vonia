/* ============================================================
   VONIA — App shell (sidebar, tabs, theme/lang, routing)
   ============================================================ */

function Sidebar({ lang, nav, setNav, onSettings, onDemoGate }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Icon name="audio" size={20} style={{color:'var(--accent-ink)'}} /></span>
        <div>
          <div className="brand-name">Vonia<span className="dot">.</span></div>
          <div className="brand-sub">Voice Studio</div>
        </div>
      </div>

      <div className="nav-section-label">Studio</div>
      <button className={'nav-item'+(nav==='studio'?' active':'')} onClick={()=>setNav('studio')}>
        <Icon name="library" size={18} className="ico" />{t(lang,'nav_studio')}
      </button>
      <button className={'nav-item'+(nav==='webhook'?' active':'')} onClick={()=>setNav('webhook')}>
        <Icon name="webhook" size={18} className="ico" />{t(lang,'nav_webhook')}
        <span className="nav-badge">Beta</span>
      </button>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <div className="plan-card">
          <div className="plan-top">
            <span className="plan-pill"><Icon name="bolt" size={12} />{t(lang,'plan_studio')}</span>
            <span className="grow" />
            <span className="plan-meta" style={{margin:0}}>{t(lang,'plan_days')}</span>
          </div>
          <div className="plan-bar"><i style={{width:'70%'}} /></div>
        </div>
        <button className="nav-item" onClick={onSettings}>
          <Icon name="settings" size={18} className="ico" />{t(lang,'nav_settings')}
        </button>
        {onDemoGate && (
          <button className="nav-item" onClick={onDemoGate}
            style={{ color: 'var(--bad)', borderColor: 'var(--bad-soft)' }}>
            <Icon name="warn" size={18} className="ico" />Demo: License hết hạn
          </button>
        )}
        <div className="social-row">
          <button className="social-btn" title="Discord"><Icon name="discord" size={17} /></button>
          <button className="social-btn" title="YouTube"><Icon name="youtube" size={17} /></button>
          <button className="social-btn" title="Website"><Icon name="globe" size={17} /></button>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ lang, setLang, theme, setTheme, tab, setTab }) {
  const tabs = [
    { id:'clone', icon:'mic', label:t(lang,'tab_clone') },
    { id:'tts', icon:'type', label:t(lang,'tab_tts') },
    { id:'dialogue', icon:'message', label:t(lang,'tab_dialogue') },
    { id:'stt', icon:'filetext', label:t(lang,'tab_stt') },
    { id:'env', icon:'sliders', label:t(lang,'tab_env') },
  ];
  return (
    <div className="topbar">
      <div className="tabs">
        {tabs.map(tb=>(
          <button key={tb.id} className={'tab'+(tab===tb.id?' active':'')} onClick={()=>setTab(tb.id)}>
            <Icon name={tb.icon} size={16} className="ico" />{tb.label}
          </button>
        ))}
      </div>
      <div className="topbar-tools">
        <div className="seg">
          <button className={lang==='vi'?'on':''} onClick={()=>setLang('vi')}>VI</button>
          <button className={lang==='en'?'on':''} onClick={()=>setLang('en')}>EN</button>
        </div>
        <div className="seg icon">
          <button className={theme==='dark'?'on':''} onClick={()=>setTheme('dark')} title="Dark"><Icon name="moon" size={15} /></button>
          <button className={theme==='light'?'on':''} onClick={()=>setTheme('light')} title="Light"><Icon name="sun" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('vonia.theme') || 'dark');
  const [lang, setLang] = useState(() => localStorage.getItem('vonia.lang') || 'vi');
  const [nav, setNav] = useState('studio');
  const [tab, setTab] = useState('clone');
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('vonia.onboarded') !== '1');
  const [showLicenseGate, setShowLicenseGate] = useState(false);
  const [starred, setStarred] = useState(() => new Set(JSON.parse(localStorage.getItem('vonia.starred')||'[]')));

  useEffect(()=>{ document.documentElement.dataset.theme = theme; localStorage.setItem('vonia.theme', theme); },[theme]);
  useEffect(()=>{ localStorage.setItem('vonia.lang', lang); },[lang]);
  useEffect(()=>{ localStorage.setItem('vonia.starred', JSON.stringify([...starred])); },[starred]);

  const onStar = useCallback((name)=> setStarred(s=>{ const n=new Set(s); n.has(name)?n.delete(name):n.add(name); return n; }), []);
  const closeOnboarding = ()=>{ setShowOnboarding(false); localStorage.setItem('vonia.onboarded','1'); };

  return (
    <AppCtx.Provider value={{ lang, theme }}>
      <ToastProvider>
        <div className="app">
          <Sidebar lang={lang} nav={nav} setNav={setNav} onSettings={()=>setShowSettings(true)}
            onDemoGate={()=>setShowLicenseGate(true)} />
          <div className="main">
            {nav==='studio' ? (
              <React.Fragment>
                <Topbar lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} tab={tab} setTab={setTab} />
                <div className="content">
                  {tab==='clone' && <CloneTab lang={lang} starred={starred} onStar={onStar} />}
                  {tab==='tts' && <TtsTab lang={lang} starred={starred} onStar={onStar} />}
                  {tab==='dialogue' && <DialogueTab lang={lang} starred={starred} onStar={onStar} />}
                  {tab==='stt' && <SttTab lang={lang} />}
                  {tab==='env' && <EnvTab lang={lang} />}
                </div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="topbar"><div className="tabs"><button className="tab active"><Icon name="webhook" size={16} className="ico" />Webhook</button></div>
                  <div className="topbar-tools">
                    <div className="seg"><button className={lang==='vi'?'on':''} onClick={()=>setLang('vi')}>VI</button><button className={lang==='en'?'on':''} onClick={()=>setLang('en')}>EN</button></div>
                    <div className="seg icon"><button className={theme==='dark'?'on':''} onClick={()=>setTheme('dark')}><Icon name="moon" size={15} /></button><button className={theme==='light'?'on':''} onClick={()=>setTheme('light')}><Icon name="sun" size={15} /></button></div>
                  </div>
                </div>
                <div className="content"><WebhookView lang={lang} starred={starred} onStar={onStar} /></div>
              </React.Fragment>
            )}
          </div>
        </div>
        {showSettings && <SettingsModal lang={lang} setLang={setLang} onClose={()=>setShowSettings(false)} />}
        {showOnboarding && <Onboarding lang={lang} onClose={closeOnboarding} onGoTo={setTab} />}
        {showLicenseGate && (
          <LicenseGate
            expiresAt="2026-06-01"
            plan="Hàng tháng"
            onRenew={() => {}}
            onLogout={() => setShowLicenseGate(false)}
          />
        )}
      </ToastProvider>
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
