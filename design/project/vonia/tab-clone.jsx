/* ============================================================
   VONIA — Tab: Sao chép giọng nói (Voice clone)
   ============================================================ */

function CloneTab({ lang, starred, onStar }) {
  const [s, set] = useSettings({ ...DEFAULTS });
  const [language, setLanguage] = useState('vi');
  const [sampleText, setSampleText] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [selVoice, setSelVoice] = useState('Achernar');
  const gen = useGenerator(lang);
  const toast = useToast();

  const start = () => {
    if (!text.trim()) { toast({kind:'err', title: lang==='en'?'Enter text to preview':'Hãy nhập nội dung để thử giọng'}); return; }
    const ok = gen.start([{ text: text.slice(0,350) }]);
    if (ok) toast({kind:'info', title: lang==='en'?'Cloning voice…':'Đang sao chép giọng…'});
  };

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          {/* sample audio */}
          <div>
            <div className="field-label">{t(lang,'sample_audio')}</div>
            <div className="input-with-btn">
              <div className={'input-file'+(fileName?'':' placeholder')} onClick={()=>setFileName('giong_mau_5s.wav')}>
                <Icon name="audio" size={15} className={fileName?'accent':'faint'} style={fileName?{color:'var(--accent)'}:null} />
                <span className="fname">{fileName || t(lang,'no_file')}</span>
              </div>
              <Btn variant="subtle" onClick={()=>setFileName('giong_mau_5s.wav')}>{t(lang,'choose')}</Btn>
            </div>
          </div>
          {/* sample text */}
          <div>
            <div className="field-label between" style={{justifyContent:'space-between',width:'100%'}}>
              <span>{t(lang,'sample_text')} <span className="req">({t(lang,'required')})</span></span>
              <button className="btn sm ghost" style={{padding:'4px 9px'}} onClick={()=>{ setSampleText('Xin chào, đây là giọng nói mẫu để Vonia học và sao chép.'); toast({kind:'info',title: lang==='en'?'AI filled sample text':'AI đã điền văn bản mẫu'}); }}>
                <Icon name="sparkles" size={14} style={{color:'var(--accent)'}} />{t(lang,'ai_suggest')}
              </button>
            </div>
            <textarea className="textarea" style={{minHeight:108}} value={sampleText} onChange={e=>setSampleText(e.target.value)} placeholder={t(lang,'sample_text_ph')} />
          </div>
          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <AdvancedSettings lang={lang} s={s} set={set} />
          <AudioTuning lang={lang} s={s} set={set} />
        </div>
        <div className="railfoot">
          <GenBar lang={lang} running={gen.running} status={gen.status} progress={gen.progress}
            onStart={start} onStop={gen.stop} disabled={!fileName} />
        </div>
      </div>

      <div className="stage">
        <div>
          <div className="stage-head">
            <span className="st-title"><Icon name="type" size={17} style={{color:'var(--accent)'}} />{t(lang,'text_content')}</span>
            <span className="charcount tnum">{text.length}/350</span>
          </div>
          <textarea className="bigtext" maxLength={350} value={text} onChange={e=>setText(e.target.value)} placeholder={t(lang,'text_ph')} />
        </div>

        <div className="results-wrap" style={{flex:'none'}}>
          {gen.hasResults ? (
            <div className="results-scroll"><ResultsTable rows={gen.rows} lang={lang} onRetry={()=>{}} /></div>
          ) : (
            <React.Fragment>
              <table className="rtable"><thead><tr>
                <th className="num">#</th><th>{t(lang,'col_content')}</th>
                <th style={{width:150}}>{t(lang,'col_status')}</th><th style={{width:120}}>{t(lang,'col_action')}</th>
              </tr></thead></table>
              <div className="empty" style={{minHeight:180}}>
              <div className="em-art"><Icon name="audio" size={34} /></div>
              <div className="em-title">{t(lang,'no_audio')}</div>
              <div className="em-sub">{lang==='en'?'Add a 5–10s sample, type the matching transcript, then preview with a short sentence above.':'Thêm mẫu 5–10 giây, gõ đúng văn bản tương ứng, rồi thử bằng một câu ngắn ở trên.'}</div>
              <div className="em-steps">
                <span className="em-step"><span className="n">1</span>{t(lang,'sample_audio').split('(')[0]}</span>
                <span className="em-step"><span className="n">2</span>{t(lang,'sample_text')}</span>
                <span className="em-step"><span className="n">3</span>{t(lang,'start')}</span>
              </div>
            </div>
            </React.Fragment>
          )}
        </div>

        <AudioPlayer hasAudio={gen.allDone} />

        <VoiceStore lang={lang} selected={selVoice} onSelect={setSelVoice} starred={starred} onStar={onStar} yourVoices={[]} />
      </div>
    </div>
  );
}

window.CloneTab = CloneTab;
