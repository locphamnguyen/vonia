/* ============================================================
   VONIA — System settings modal (License / General / Logs)
   ============================================================ */

function LicenseTab({ lang }) {
  const toast = useToast();
  const [signedIn, setSignedIn] = useState(false);
  return (
    <div className="stack gap18">
      <div className="row between wrap gap10">
        <div className="row gap10 wrap">
          {signedIn ?
          <React.Fragment>
            <span className="badge muted" style={{ padding: '8px 12px' }}><Icon name="user" size={15} />{t(lang, 'user')}: <strong>locphamnguyen@gmail.com</strong></span>
            <span className="badge accent" style={{ padding: '8px 12px' }}>ID: 494130</span>
          </React.Fragment> :
          <span className="badge muted" style={{ padding: '8px 12px' }}><Icon name="user" size={15} />{t(lang, 'user')}: <strong>{t(lang, 'guest')}</strong></span>}
        </div>
        <div className="row gap10">
          {signedIn ?
          <React.Fragment>
            <Btn variant="subtle" icon="refresh" onClick={() => toast({ kind: 'info', title: t(lang, 'refresh') })}>{t(lang, 'refresh')}</Btn>
            <Btn variant="danger" icon="x" onClick={() => { setSignedIn(false); toast({ kind: 'info', title: t(lang, 'signed_out_toast') }); }}>{t(lang, 'logout_device')}</Btn>
          </React.Fragment> :
          <Btn variant="danger" icon="login" onClick={() => { setSignedIn(true); toast({ kind: 'good', title: t(lang, 'signed_in_toast') }); }}>{t(lang, 'sign_in_google')}</Btn>}
        </div>
      </div>
      {signedIn ?
      <div className="banner info"><Icon name="info" size={16} className="bico" /><span>{t(lang, 'license_note')}</span></div> :
      <div className="banner warn"><Icon name="warn" size={16} className="bico" /><span>{t(lang, 'hw_note')}</span></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: '22px 20px', textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>{t(lang, 'plan_trial')}</div>
          <div style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 16px' }}>{t(lang, 'free')}</div>
          <Btn variant="good" block icon="check" disabled>{t(lang, 'using_now')}</Btn>
        </div>
        <div className="card" style={{ padding: '22px 20px', textAlign: 'center', borderColor: 'var(--accent-line)', background: 'var(--grad-soft)' }}>
          <div style={{ fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--accent)' }}>{t(lang, 'plan_studio')}</div>
          <div style={{ margin: '8px 0 16px' }}><span style={{ fontSize: 24, fontWeight: 800 }}>100.000đ</span> <span className="muted" style={{ fontSize: 13 }}>{t(lang, 'per_days')}</span></div>
          <Btn variant="primary" block icon="bolt" onClick={() => toast({ kind: 'good', title: lang === 'en' ? 'Opening checkout…' : 'Đang mở thanh toán…' })}>{t(lang, 'upgrade_now')}</Btn>
        </div>
      </div>
      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="hint" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span><Icon name="info" size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--accent)' }} />{t(lang, 'trial_limit')}</span>
          <span><Icon name="warn" size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--warn)' }} />{t(lang, 'try_first')}</span>
          <span><Icon name="warn" size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--warn)' }} />{t(lang, 'no_refund')}</span>
        </div>
      </div>
    </div>);

}

function GeneralTab({ lang, setLang }) {
  const [naming, setNaming] = useState('default');
  const [sep, setSep] = useState('underscore');
  const langs = [
  { id: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' }, { id: 'en', flag: '🇺🇸', label: 'English' },
  { id: 'bn', flag: '🇧🇩', label: 'বাংলা' }, { id: 'hi', flag: '🇮🇳', label: 'हिन्दी' }, { id: 'pt', flag: '🇵🇹', label: 'Português' },
  { id: 'ru', flag: '🇷🇺', label: 'Русский' }, { id: 'tr', flag: '🇹🇷', label: 'Türkçe' }, { id: 'ur', flag: '🇵🇰', label: 'اردو' }, { id: 'zh', flag: '🇨🇳', label: '简体中文' }];

  return (
    <div className="stack gap18">
      <div>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="globe" size={14} />{t(lang, 'interface_lang')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {langs.map((l) =>
          <button key={l.id} className={'btn' + (l.id === lang || l.id === 'en' && lang === 'en' || l.id === 'vi' && lang === 'vi' ? ' ' : ' ghost')}
          onClick={() => {if (l.id === 'vi' || l.id === 'en') setLang(l.id);}}
          style={{ justifyContent: 'flex-start', padding: '12px 14px', borderColor: l.id === lang ? 'var(--accent)' : 'var(--border)', color: l.id === lang ? 'var(--accent)' : 'var(--text)' }}>
              <span style={{ fontSize: 18 }}>{l.flag}</span>{l.label}
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="file" size={14} />{t(lang, 'file_naming')}</div>
        <div className="card" style={{ padding: 18 }}>
          <div className="stack gap14">
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'naming_style')}</span>
              <Select value={naming} onChange={setNaming} options={[{ value: 'default', label: lang === 'en' ? 'Default ({row}_{prompt})' : 'Mặc định ({row}_{prompt})' }, { value: 'date', label: lang === 'en' ? 'Date + index' : 'Ngày + số thứ tự' }, { value: 'voice', label: lang === 'en' ? 'Voice + index' : 'Tên giọng + số' }]} /></div>
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'prefix')}</span><input className="input" placeholder={lang === 'en' ? 'Enter prefix' : 'Nhập tiền tố'} /></div>
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'separator')}</span>
              <Select value={sep} onChange={setSep} options={[{ value: 'underscore', label: lang === 'en' ? 'Underscore (_)' : 'Gạch dưới (_)' }, { value: 'dash', label: 'Dash (-)' }, { value: 'space', label: lang === 'en' ? 'Space' : 'Khoảng trắng' }]} /></div>
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'min_digits')}</span><input className="input" defaultValue="1" style={{ width: 90 }} /></div>
            <div className="row between gap14"><span className="field-label" style={{ margin: 0, width: 160 }}>{t(lang, 'max_len')}</span><input className="input" defaultValue="30" style={{ width: 90 }} /></div>
            <div className="divider" />
            <div className="row gap10"><span className="muted" style={{ fontSize: 13 }}>{t(lang, 'preview')}:</span>
              <span className="badge good mono" style={{ padding: '7px 12px' }}><Icon name="file" size={13} />1_Xin_chao_cac_ban.wav</span></div>
            <Btn variant="subtle" block icon="rotate">{t(lang, 'restore_default')}</Btn>
          </div>
        </div>
      </div>

      <div>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="user" size={14} />{t(lang, 'author')}</div>
        <div className="card" style={{ padding: 18 }}>
          <div className="stack gap10">
            <div className="row gap10"><span className="muted" style={{ width: 90, fontSize: 13 }}>{t(lang, 'name')}:</span><strong>Vonia Team</strong></div>
            <div className="row gap10"><span className="muted" style={{ width: 90, fontSize: 13 }}>Nickname:</span><span className="muted">@vonia.studio</span></div>
            <div className="row gap10"><span className="muted" style={{ width: 90, fontSize: 13 }}>{t(lang, 'website')}:</span><a href="#" style={{ color: 'var(--accent)', textDecoration: 'none' }}>https://vonia.studio</a></div>
          </div>
        </div>
      </div>
    </div>);

}

function LogsTab({ lang }) {
  const toast = useToast();
  return (
    <div className="stack gap14">
      <div className="card" style={{ minHeight: 340, background: 'var(--inset)', padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-muted)' }}>
        <div className="vempty" style={{ padding: '80px 16px' }}>
          <div className="ve-icon"><Icon name="filetext" size={22} /></div>
          <div className="ve-text">{t(lang, 'no_logs')}</div>
        </div>
      </div>
      <div className="row gap10">
        <Btn variant="good" icon="copy" onClick={() => toast({ kind: 'good', title: t(lang, 'copy_all') })}>{t(lang, 'copy_all')}</Btn>
        <Btn variant="danger" icon="trash">{t(lang, 'clear')}</Btn>
      </div>
    </div>);

}

function SettingsModal({ lang, setLang, onClose }) {
  const [tab, setTab] = useState('license');
  return (
    <Modal onClose={onClose} className="modal-lg">
      <div className="modal-head" data-comment-anchor="9aad302bc1-div-122-7">
        <span className="badge accent" style={{ padding: '6px 10px' }}><Icon name="settings" size={15} /></span>
        <span className="mt">{t(lang, 'sys_settings')}</span>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>
      <div className="modal-tabs">
        {[['license', t(lang, 'tab_license')], ['general', t(lang, 'tab_general')], ['logs', t(lang, 'tab_logs')]].map(([id, label]) =>
        <button key={id} className={'modal-tab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>{label}</button>
        )}
      </div>
      <div className="modal-body">
        {tab === 'license' && <LicenseTab lang={lang} />}
        {tab === 'general' && <GeneralTab lang={lang} setLang={setLang} />}
        {tab === 'logs' && <LogsTab lang={lang} />}
      </div>
    </Modal>);

}

window.SettingsModal = SettingsModal;