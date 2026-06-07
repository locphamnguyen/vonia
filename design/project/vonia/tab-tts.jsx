/* ============================================================
   VONIA — Tab: Văn bản sang giọng nói (Text to speech)
   ============================================================ */

function VoicePanel({ lang, mode, setMode, selVoice, onSelect, starred, onStar, random, setRandom }) {
  const autoOpts = [
    {value:'auto',label:t(lang,'auto')},{value:'low',label:lang==='en'?'Low':'Thấp'},
    {value:'mid',label:lang==='en'?'Mid':'Trung'},{value:'high',label:lang==='en'?'High':'Cao'}];
  const genderOpts = [{value:'auto',label:t(lang,'auto')},{value:'M',label:t(lang,'male')},{value:'F',label:t(lang,'female')}];
  return (
    <Panel title={t(lang,'voice')} icon="mic" defaultOpen={true} tight>
      <Segmented value={mode} onChange={setMode} options={[
        {value:'preset', label:t(lang,'preset_voice'), icon:'library'},
        {value:'random', label:t(lang,'random_voice'), icon:'wand'}]} />
      {mode==='preset' ? (
        <div>
          <div className="row between" style={{margin:'2px 0 4px'}}>
            <span className="section-title">{t(lang,'pick_from_store')} <span className="muted">({VOICES.length} {t(lang,'samples')})</span></span>
          </div>
          <VoiceList voices={VOICES} lang={lang} selected={selVoice} onSelect={onSelect} starred={starred} onStar={onStar} />
        </div>
      ) : (
        <div className="stack gap14">
          <div className="row between"><span className="sl-label">{t(lang,'gender')}</span><Select width={150} value={random.gender} onChange={v=>setRandom({...random,gender:v})} options={genderOpts} /></div>
          <div className="row between"><span className="sl-label">{t(lang,'age')}</span><Select width={150} value={random.age} onChange={v=>setRandom({...random,age:v})} options={autoOpts} /></div>
          <div className="row between"><span className="sl-label">{t(lang,'pitch')}</span><Select width={150} value={random.pitch} onChange={v=>setRandom({...random,pitch:v})} options={autoOpts} /></div>
          <div className="row between"><span className="sl-label">{t(lang,'accent')}</span><Select width={150} value={random.accent} onChange={v=>setRandom({...random,accent:v})} options={autoOpts} /></div>
        </div>
      )}
    </Panel>
  );
}

function TtsTab({ lang, starred, onStar }) {
  const [s, set] = useSettings({ ...DEFAULTS });
  const [language, setLanguage] = useState('vi');
  const [mode, setMode] = useState('preset');
  const [selVoice, setSelVoice] = useState('Achird');
  const [random, setRandom] = useState({gender:'auto',age:'auto',pitch:'auto',accent:'auto'});
  const [text, setText] = useState('');
  const [split, setSplit] = useState('period');
  const gen = useGenerator(lang);
  const toast = useToast();

  const splitText = () => text.split(/(?<=[.!?…])\s+|\n+/).map(x=>x.trim()).filter(Boolean);

  const toTable = () => {
    const lines = splitText();
    if (!lines.length) { toast({kind:'err', title: lang==='en'?'Nothing to split':'Chưa có nội dung'}); return; }
    gen.reset();
    gen.start(lines.map((l,i)=>({ text:l, time: fmtTime(i*4.2) })));
  };
  const start = () => {
    const lines = splitText();
    if (!lines.length) { toast({kind:'err', title: lang==='en'?'Enter text first':'Hãy nhập nội dung'}); return; }
    gen.start(lines.map((l,i)=>({ text:l, time: fmtTime(i*4.2) })));
    toast({kind:'info', title: lang==='en'?`Generating ${lines.length} lines…`:`Đang tạo ${lines.length} dòng…`});
  };

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <VoicePanel lang={lang} mode={mode} setMode={setMode} selVoice={selVoice} onSelect={setSelVoice}
            starred={starred} onStar={onStar} random={random} setRandom={setRandom} />
          <AdvancedSettings lang={lang} s={s} set={set} open={false} />
          <AudioTuning lang={lang} s={s} set={set} open={false} />
          <BatchPanel lang={lang} s={s} set={set} />
          <ExportPanel lang={lang} />
        </div>
        <div className="railfoot">
          <GenBar lang={lang} running={gen.running} status={gen.status} progress={gen.progress}
            onStart={start} onStop={gen.stop} />
        </div>
      </div>

      <div className="stage">
        <div>
          <div className="stage-head">
            <span className="st-title"><Icon name="type" size={17} style={{color:'var(--accent)'}} />{t(lang,'text_content')}</span>
            <span className="charcount tnum">{text.length} {lang==='en'?'chars':'ký tự'}</span>
          </div>
          <textarea className="bigtext" value={text} onChange={e=>setText(e.target.value)} placeholder={t(lang,'tts_text_ph')} />
        </div>

        <div className="row between wrap gap10">
          <div className="row gap10">
            <span className="field-label" style={{margin:0}}>{t(lang,'split_style')}</span>
            <Select width={200} value={split} onChange={setSplit} options={[
              {value:'period',label:t(lang,'split_auto')},
              {value:'newline',label:lang==='en'?'By line break':'Theo dòng'},
              {value:'comma',label:lang==='en'?'By comma':'Theo dấu phẩy'},
              {value:'none',label:lang==='en'?'No split':'Không tách'}]} />
          </div>
          <div className="row gap10">
            <Btn variant="subtle" size="sm" icon="volume" onClick={()=>toast({kind:'info',title:lang==='en'?'Previewing…':'Đang phát thử…'})}>{t(lang,'speak')}</Btn>
            <Btn variant="subtle" size="sm" icon="table" onClick={toTable}>{t(lang,'input_table')}</Btn>
            <Btn variant="subtle" size="sm" icon="upload" onClick={()=>toast({kind:'info',title:t(lang,'import_file')})}>{t(lang,'import_file')}</Btn>
          </div>
        </div>

        <div className="results-wrap">
          {gen.hasResults ? (
            <div className="results-scroll"><ResultsTable rows={gen.rows} lang={lang} cols="time" onRetry={()=>{}} /></div>
          ) : (
            <React.Fragment>
              <table className="rtable"><thead><tr>
                <th className="num">#</th><th style={{width:96}}>{t(lang,'col_time')}</th><th>{t(lang,'col_content')}</th>
                <th style={{width:150}}>{t(lang,'col_status')}</th><th style={{width:120}}>{t(lang,'col_action')}</th>
              </tr></thead></table>
              <div className="empty">
                <div className="em-art"><Icon name="type" size={34} /></div>
                <div className="em-title">{lang==='en'?'No audio yet':'Chưa có âm thanh'}</div>
                <div className="em-sub">{lang==='en'?'Type or import text, choose a voice, then Generate. Each line becomes a row you can play, retry or export.':'Nhập hoặc nhập tệp văn bản, chọn giọng rồi bấm Bắt đầu tạo. Mỗi dòng là một hàng để phát, thử lại hoặc xuất.'}</div>
              </div>
            </React.Fragment>
          )}
        </div>

        <AudioPlayer hasAudio={gen.allDone} />
      </div>
    </div>
  );
}

function fmtTime(sec){ const m=Math.floor(sec/60), s=Math.floor(sec%60); return `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`.slice(3); }
window.fmtTime = fmtTime;
window.TtsTab = TtsTab;
window.VoicePanel = VoicePanel;
