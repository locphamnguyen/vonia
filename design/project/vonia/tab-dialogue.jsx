/* ============================================================
   VONIA — Tab: Hội thoại nhiều giọng (Multi-voice dialogue)
   ============================================================ */

const SAMPLE_DIALOGUE = `Lan: Chào An, cậu đã thử Vonia chưa?
An: Rồi, mình vừa tạo một đoạn hội thoại hai giọng đấy.
Lan: Nghe tự nhiên không cậu?
An: Rất tự nhiên, mà lại chạy ngay trên máy mình, không cần internet.
Lan: Tuyệt thật, để mình thử ngay xem sao.`;

function CastPanel({ lang, cast, setCast, starred, onStar }) {
  const voiceOpts = VOICES.map(v=>({value:v.name, label:v.name, color:v.color, g:v.g}));
  return (
    <Panel title={t(lang,'cast')} icon="users" defaultOpen={true} tight>
      {cast.length === 0 ? (
        <div className="hint">{lang==='en'?'No characters yet. Click "Analyze dialogue" to detect speakers automatically.':'Chưa có nhân vật. Bấm "Phân tích hội thoại" để tự nhận diện người nói.'}</div>
      ) : cast.map((c,i)=>(
        <div key={c.name} className="row gap10">
          <span className="av" style={{width:30,height:30,fontSize:12,background:avatarColor(c.name),flexShrink:0}}>{c.name[0]}</span>
          <span className="grow" style={{fontWeight:600,fontSize:13.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</span>
          <Select width={140} value={c.voice} onChange={(v)=>setCast(cast.map(x=>x.name===c.name?{...x,voice:v}:x))}
            options={voiceOpts}
            renderValue={(o)=><span className="row gap6"><span className="av" style={{width:18,height:18,fontSize:10,background:o.color}}>{o.label[0]}</span>{o.label}</span>}
            renderOption={(o)=><span className="row gap6"><span className="av" style={{width:18,height:18,fontSize:10,background:o.color}}>{o.label[0]}</span>{o.label}</span>} />
        </div>
      ))}
    </Panel>
  );
}

function DialogueTab({ lang, starred, onStar }) {
  const [s, set] = useSettings({ ...DEFAULTS });
  const [language, setLanguage] = useState('vi');
  const [text, setText] = useState('');
  const [cast, setCast] = useState([]);
  const gen = useGenerator(lang);
  const toast = useToast();

  const parse = () => {
    const lines = text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const rows = []; const chars = {};
    const pal = VOICES.map(v=>v.name);
    lines.forEach((l,i)=>{
      const m = l.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
      const char = m ? m[1].trim() : (lang==='en'?'Narrator':'Người dẫn');
      const body = m ? m[2].trim() : l;
      if (!chars[char]) chars[char] = pal[Object.keys(chars).length % pal.length];
      rows.push({ char, text: body, time: fmtTime(i*3.6) });
    });
    return { rows, cast: Object.keys(chars).map(name=>({name, voice:chars[name]})) };
  };

  const analyze = () => {
    if (!text.trim()) { toast({kind:'err', title:lang==='en'?'Paste a dialogue first':'Hãy dán kịch bản hội thoại'}); return; }
    const { rows, cast:c } = parse();
    setCast(c); gen.reset();
    gen.start(rows.map(r=>({ ...r, _hold:true })).map(r=>({char:r.char,text:r.text,time:r.time})));
    toast({kind:'good', title:lang==='en'?`Detected ${c.length} speakers`:`Đã nhận diện ${c.length} nhân vật`});
  };
  const start = () => {
    if (!text.trim()) { toast({kind:'err', title:lang==='en'?'Paste a dialogue first':'Hãy dán kịch bản hội thoại'}); return; }
    const { rows, cast:c } = parse();
    if (!cast.length) setCast(c);
    gen.start(rows);
    toast({kind:'info', title:lang==='en'?'Generating dialogue…':'Đang tạo hội thoại…'});
  };

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <CastPanel lang={lang} cast={cast} setCast={setCast} starred={starred} onStar={onStar} />
          <AdvancedSettings lang={lang} s={s} set={set} open={false} />
          <AudioTuning lang={lang} s={s} set={set} open={false} />
          <BatchPanel lang={lang} s={s} set={set} />
        </div>
        <div className="railfoot">
          <GenBar lang={lang} running={gen.running} status={gen.status} progress={gen.progress} onStart={start} onStop={gen.stop} />
        </div>
      </div>

      <div className="stage">
        <div>
          <div className="stage-head">
            <span className="st-title"><Icon name="message" size={17} style={{color:'var(--accent)'}} />{t(lang,'text_content')}</span>
            <Btn variant="subtle" size="sm" icon="list" onClick={()=>setText(SAMPLE_DIALOGUE)}>{t(lang,'dialogue_tpl')}</Btn>
          </div>
          <textarea className="bigtext" style={{minHeight:140}} value={text} onChange={e=>setText(e.target.value)} placeholder={t(lang,'dialogue_text_ph')} />
        </div>

        <div className="row between wrap gap10">
          <div className="row gap10">
            <span className="field-label" style={{margin:0}}>{t(lang,'split_style')}</span>
            <Select width={200} value="auto" onChange={()=>{}} options={[{value:'auto',label:t(lang,'split_auto')}]} />
          </div>
          <div className="row gap10">
            <Btn variant="subtle" size="sm" icon="volume" onClick={()=>toast({kind:'info',title:lang==='en'?'Previewing…':'Đang phát thử…'})}>{t(lang,'speak')}</Btn>
            <Btn variant="subtle" size="sm" icon="users" onClick={analyze}>{t(lang,'analyze')}</Btn>
            <Btn variant="subtle" size="sm" icon="upload" onClick={()=>toast({kind:'info',title:t(lang,'import_file')})}>{t(lang,'import_file')}</Btn>
          </div>
        </div>

        <div className="results-wrap">
          {gen.hasResults ? (
            <div className="results-scroll"><ResultsTable rows={gen.rows} lang={lang} cols="dialogue" onRetry={()=>{}} /></div>
          ) : (
            <React.Fragment>
              <table className="rtable"><thead><tr>
                <th className="num">#</th><th style={{width:96}}>{t(lang,'col_time')}</th><th style={{width:130}}>{t(lang,'col_char')}</th>
                <th>{t(lang,'col_content')}</th><th style={{width:150}}>{t(lang,'col_status')}</th><th style={{width:120}}>{t(lang,'col_action')}</th>
              </tr></thead></table>
              <div className="empty">
                <div className="em-art"><Icon name="message" size={34} /></div>
                <div className="em-title">{lang==='en'?'Build a multi-voice scene':'Dựng cảnh nhiều giọng'}</div>
                <div className="em-sub">{lang==='en'?'Paste a script as "Name: line", click Analyze to auto-assign voices, then Generate.':'Dán kịch bản dạng "Tên: lời thoại", bấm Phân tích để tự gán giọng, rồi Bắt đầu tạo.'}</div>
                <div className="row gap10" style={{marginTop:4}}>
                  <Btn variant="subtle" size="sm" icon="list" onClick={()=>setText(SAMPLE_DIALOGUE)}>{t(lang,'dialogue_tpl')}</Btn>
                </div>
              </div>
            </React.Fragment>
          )}
        </div>

        <AudioPlayer hasAudio={gen.allDone} />
      </div>
    </div>
  );
}

window.DialogueTab = DialogueTab;
