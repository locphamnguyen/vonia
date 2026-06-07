/* ============================================================
   VONIA — Tab: Cài đặt môi trường (Environment)
   ============================================================ */

function SectionCard({ title, icon, children }) {
  return (
    <div className="card" style={{padding:'18px 20px'}}>
      <div className="row gap10" style={{marginBottom:16}}>
        <span className="badge accent" style={{padding:'5px 11px'}}><Icon name={icon} size={14} />{title}</span>
      </div>
      {children}
    </div>
  );
}

function EnvTab({ lang }) {
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const [accel, setAccel] = useState('auto');
  const [idle, setIdle] = useState('5');
  const toast = useToast();
  const timer = useRef(null);

  const autoDownload = () => {
    if (downloading) return;
    setDownloading(true); setDlProgress(0);
    timer.current = setInterval(()=>{
      setDlProgress(p=>{
        if (p>=100){ clearInterval(timer.current); setDownloading(false); setDownloaded(true); toast({kind:'good', title:lang==='en'?'Model ready on device':'Model đã sẵn sàng trên máy'}); return 100; }
        return p+4;
      });
    }, 90);
  };
  useEffect(()=>()=>clearInterval(timer.current),[]);

  return (
    <div className="stage" style={{maxWidth:1100, margin:'0 auto', width:'100%'}}>
      <SectionCard title={t(lang,'model_mgmt')} icon="layers">
        <div className="row between wrap gap14">
          <div className="stack gap10" style={{flex:1, minWidth:280}}>
            <div className="row gap10">
              <span className="muted" style={{fontSize:13}}>{t(lang,'status')}:</span>
              <span className={'status-pill '+(downloaded?'done':downloading?'run':'idle')}>
                <span className="d" />{downloaded? t(lang,'on_device') : downloading? (lang==='en'?'Downloading…':'Đang tải…') : t(lang,'not_on_device')}
                {downloading?` · ${dlProgress}%`:''}
              </span>
            </div>
            <div className="hint mono">{t(lang,'path')}: ~/Library/Application Support/Vonia/voice_studio/model</div>
            {downloading && <div className="progress" style={{maxWidth:360}}><i style={{width:dlProgress+'%'}} /></div>}
          </div>
          <div className="row gap10">
            <Btn variant="ghost" icon="folder">{t(lang,'open_folder')}</Btn>
          </div>
        </div>
        <div className="divider" style={{margin:'16px 0'}} />
        <div className="row gap10">
          <Btn variant="primary" icon="download" onClick={autoDownload} disabled={downloading||downloaded}>{t(lang,'auto_download')}</Btn>
          <Btn variant="subtle" icon="upload">{t(lang,'manual_download')}</Btn>
        </div>
      </SectionCard>

      <SectionCard title={t(lang,'hardware')} icon="cpu">
        <div className="card" style={{background:'var(--grad-soft)', border:'1px solid var(--accent-line)', padding:'16px 18px', marginBottom:16}}>
          <div className="row between">
            <div className="stack gap6">
              <div className="row gap10"><span className="muted" style={{fontSize:13}}>{t(lang,'gpu')}:</span><strong style={{fontSize:14.5}}>Apple Silicon (arm)</strong></div>
              <span className="status-pill done"><Icon name="sparkles" size={14} />{t(lang,'good_support')}</span>
            </div>
            <Icon name="cpu" size={40} style={{color:'var(--accent)', opacity:.65}} />
          </div>
        </div>
        <div className="row between wrap gap14" style={{marginBottom:16}}>
          <span className="field-label" style={{margin:0}}>{t(lang,'hw_accel')}</span>
          <Select width={220} value={accel} onChange={setAccel} options={[
            {value:'auto',label:'Auto'},{value:'cuda',label:'CUDA (NVIDIA)'},{value:'metal',label:'Metal (Apple)'},{value:'cpu',label:'CPU'}]} />
        </div>
        <div className="banner warn"><Icon name="warn" size={16} className="bico" /><span>{t(lang,'hw_note')}</span></div>
      </SectionCard>

      <SectionCard title={t(lang,'auto_vram')} icon="zap">
        <div className="row between wrap gap14">
          <span className="field-label" style={{margin:0}}>{t(lang,'when_idle')}</span>
          <Select width={220} value={idle} onChange={setIdle} options={[
            {value:'5',label:t(lang,'min5')},{value:'10',label:t(lang,'min10')},{value:'15',label:t(lang,'min15')},{value:'never',label:t(lang,'never')}]} />
        </div>
      </SectionCard>
    </div>
  );
}

window.EnvTab = EnvTab;
