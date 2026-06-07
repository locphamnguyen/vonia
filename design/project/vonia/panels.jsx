/* ============================================================
   VONIA — shared setting panels
   ============================================================ */

function useSettings(initial) {
  const [s, setS] = useState(initial);
  const set = useCallback((k, v) => setS(prev => ({ ...prev, [k]: v })), []);
  return [s, set];
}

const DEFAULTS = { detail:32, adherence:2.0, speed:1.0, pause:300, proc:'broadcast', normalize:true, concurrent:1 };

function LanguageField({ lang, value, onChange }) {
  return (
    <div>
      <div className="field-label"><Icon name="globe" size={14} />{t(lang,'language')}</div>
      <Select value={value} onChange={onChange}
        options={LANGUAGES.map(l=>({value:l.id, label:l.label, flag:l.flag, native:l.native}))}
        renderValue={(o)=><span><span className="flag" style={{marginRight:8}}>{o.flag}</span>{o.label}</span>}
        renderOption={(o)=><span className="row gap10"><span className="flag">{o.flag}</span><span>{o.label}</span><span className="faint" style={{fontSize:12}}>{o.native}</span></span>}
      />
    </div>
  );
}

function AdvancedSettings({ lang, s, set, open=true }) {
  return (
    <Panel title={t(lang,'adv_settings')} icon="sliders" defaultOpen={open} tight>
      <Slider label={t(lang,'detail')} value={s.detail} min={0} max={100} step={1} defaultValue={DEFAULTS.detail} onChange={v=>set('detail',v)} />
      <Slider label={t(lang,'adherence')} value={s.adherence} min={0.5} max={5} step={0.05} defaultValue={DEFAULTS.adherence} onChange={v=>set('adherence',v)} format={v=>v.toFixed(2)} />
      <Slider label={t(lang,'speed')} value={s.speed} min={0.5} max={2} step={0.05} defaultValue={DEFAULTS.speed} onChange={v=>set('speed',v)} format={v=>v.toFixed(2)+'x'} />
      {s.pause!==undefined && <Slider label={t(lang,'pause')} value={s.pause} min={0} max={1000} step={50} defaultValue={DEFAULTS.pause} onChange={v=>set('pause',v)} format={v=>v+'ms'} />}
    </Panel>
  );
}

function AudioTuning({ lang, s, set, open=true }) {
  const modes = PROC_MODES[lang] || PROC_MODES.vi;
  const cur = modes.find(m=>m.id===s.proc) || modes[0];
  return (
    <Panel title={t(lang,'audio_tune')} icon="wave2" defaultOpen={open} tight>
      <div>
        <div className="field-label">{t(lang,'proc_mode')}</div>
        <Select value={s.proc} onChange={v=>set('proc',v)}
          options={modes.map(m=>({value:m.id, label:m.label, icon:m.icon}))}
          renderValue={(o)=><span className="row gap6"><Icon name={o.icon} size={14} className="accent" style={{color:'var(--accent)'}} />{o.label}</span>}
          renderOption={(o)=><span className="row gap10"><Icon name={o.icon} size={15} />{o.label}</span>}
        />
        <div className="hint" style={{marginTop:8}}>{cur.desc}</div>
      </div>
      <Toggle on={s.normalize} onChange={v=>set('normalize',v)}>{t(lang,'normalize')}</Toggle>
    </Panel>
  );
}

function BatchPanel({ lang, s, set }) {
  return (
    <Panel title={t(lang,'batch')} icon="layers" defaultOpen={false} tight>
      <Slider label={t(lang,'concurrent')} value={s.concurrent} min={1} max={8} step={1} defaultValue={1} onChange={v=>set('concurrent',v)} />
      <Slider label={t(lang,'pause')} value={s.pause||300} min={0} max={1000} step={50} defaultValue={300} onChange={v=>set('pause',v)} format={v=>v+'ms'} />
    </Panel>
  );
}

function ExportPanel({ lang }) {
  const [fmt, setFmt] = useState('wav');
  const [type, setType] = useState('merge');
  const [srt, setSrt] = useState(true);
  const toast = useToast();
  return (
    <Panel title={t(lang,'export_sec')} icon="download" defaultOpen={false} tight>
      <div>
        <div className="field-label">{t(lang,'format')}</div>
        <Select value={fmt} onChange={setFmt} options={[
          {value:'wav',label:'WAV'},{value:'mp3',label:'MP3'},{value:'flac',label:'FLAC'},{value:'ogg',label:'OGG'}]} />
      </div>
      <div>
        <div className="field-label">{t(lang,'export_type')}</div>
        <Select value={type} onChange={setType} options={[
          {value:'merge',label:t(lang,'export_merge')},{value:'split',label:t(lang,'export_split')}]} />
      </div>
      <div>
        <div className="field-label">{t(lang,'save_folder')}</div>
        <div className="input-file"><Icon name="folder" size={15} className="faint" /><span className="fname mono" style={{fontSize:12}}>…/Vonia Voice Studio/output</span></div>
      </div>
      <Toggle on={srt} onChange={setSrt}>{t(lang,'export_srt')}</Toggle>
      <Btn variant="primary" icon="save" block onClick={()=>toast({kind:'good',title:lang==='en'?'Audio exported':'Đã xuất âm thanh'})}>{t(lang,'export')}</Btn>
    </Panel>
  );
}

Object.assign(window, { useSettings, DEFAULTS, LanguageField, AdvancedSettings, AudioTuning, BatchPanel, ExportPanel });
