/* ============================================================
   VONIA — Tab: Giọng nói sang văn bản (Speech to text)
   ============================================================ */

const STT_SAMPLE = [
  '00:00 → 00:04 · Xin chào và chào mừng bạn đến với Vonia Voice Studio.',
  '00:04 → 00:09 · Đây là công cụ tạo và xử lý giọng nói chạy ngay trên máy của bạn.',
  '00:09 → 00:14 · Bạn có thể sao chép giọng, chuyển văn bản thành giọng nói và ngược lại.',
  '00:14 → 00:19 · Toàn bộ quá trình diễn ra cục bộ, bảo mật và không cần kết nối mạng.',
  '00:19 → 00:24 · Hãy thử ngay và cảm nhận sự khác biệt.',
];

function SttTab({ lang }) {
  const [fileName, setFileName] = useState('MiniMax_First_one.mp3');
  const [model, setModel] = useState('turbo');
  const [audioLang, setAudioLang] = useState('auto');
  const [downloaded, setDownloaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState([]);
  const [exportFmt, setExportFmt] = useState('txt');
  const timers = useRef([]);
  const toast = useToast();

  const start = () => {
    if (!fileName) { toast({kind:'err', title:lang==='en'?'Choose a file first':'Hãy chọn tệp trước'}); return; }
    timers.current.forEach(clearTimeout); timers.current=[];
    setRunning(true); setProgress(0); setRows([]);
    if (!downloaded) toast({kind:'info', title:lang==='en'?'Downloading model…':'Đang tải model…', desc: STT_MODELS.find(m=>m.id===model).label});
    const total = STT_SAMPLE.length;
    STT_SAMPLE.forEach((line,i)=>{
      timers.current.push(setTimeout(()=>{
        const [time, ...rest] = line.split(' · ');
        setRows(rs => [...rs, { id:i+1, time, text: rest.join(' · ') }]);
        setProgress(Math.round(((i+1)/total)*100));
        if (i===total-1) { setRunning(false); setDownloaded(true); toast({kind:'good', title:lang==='en'?'Transcription complete':'Đã trích xuất xong'}); }
      }, 500 + i*600));
    });
  };
  const stop = () => { timers.current.forEach(clearTimeout); setRunning(false); };
  useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);

  const modelObj = STT_MODELS.find(m=>m.id===model);
  const audioLangOpts = [{value:'auto', label:t(lang,'auto_detect')}, ...LANGUAGES.map(l=>({value:l.id,label:l.label,flag:l.flag}))];

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <div>
            <div className="field-label">{t(lang,'audio_video')}</div>
            <div className="input-with-btn">
              <div className={'input-file'+(fileName?'':' placeholder')} onClick={()=>setFileName('MiniMax_First_one.mp3')}>
                <Icon name="audio" size={15} style={{color: fileName?'var(--accent)':'var(--text-faint)'}} />
                <span className="fname mono" style={{fontSize:12}}>{fileName || t(lang,'no_file')}</span>
              </div>
              <Btn variant="subtle" onClick={()=>setFileName('MiniMax_First_one.mp3')}>{t(lang,'choose')}</Btn>
            </div>
          </div>

          <div>
            <div className="field-label">{t(lang,'recog_model')}</div>
            <div className="input-with-btn">
              <Select value={model} onChange={setModel} options={STT_MODELS.map(m=>({value:m.id, label:`${m.label} · ${m.size} · ${m.vram}`, m}))}
                renderValue={(o)=><span>{o.m.label} <span className="faint mono" style={{fontSize:11.5}}>· {o.m.size} · {o.m.vram}</span></span>}
                renderOption={(o)=><span className="row gap6">{o.m.label}<span className="faint mono" style={{fontSize:11.5}}>· {o.m.size} · {o.m.vram}</span></span>} />
              <Btn variant="subtle" icon="download" onClick={()=>{ setDownloaded(true); toast({kind:'good', title:lang==='en'?'Model downloaded':'Đã tải model'}); }}>{t(lang,'download')}</Btn>
            </div>
            <div className="row gap6" style={{marginTop:8}}>
              <span className={'status-pill '+(downloaded?'done':'idle')}><span className="d" />{downloaded? t(lang,'on_device'): t(lang,'not_downloaded')}</span>
            </div>
          </div>

          <div>
            <div className="field-label">{t(lang,'audio_lang')}</div>
            <Select value={audioLang} onChange={setAudioLang} options={audioLangOpts}
              renderValue={(o)=><span>{o.flag?<span className="flag" style={{marginRight:8}}>{o.flag}</span>:null}{o.label}</span>}
              renderOption={(o)=><span className="row gap10">{o.flag?<span className="flag">{o.flag}</span>:<Icon name="sparkles" size={14} style={{color:'var(--accent)'}}/>}{o.label}</span>} />
          </div>

          <div className="banner info"><Icon name="info" size={16} className="bico" /><span>{lang==='en'?'Larger models are more accurate but need more VRAM and time. Turbo is a great balance for most machines.':'Model lớn hơn cho độ chính xác cao hơn nhưng cần nhiều VRAM và thời gian hơn. Turbo cân bằng tốt cho đa số máy.'}</span></div>
        </div>
        <div className="railfoot stack gap10">
          <GenBar lang={lang} running={running} status={running?'run':(rows.length?'done':'idle')} progress={progress} onStart={start} onStop={stop} />
          <div className="row gap10">
            <Select width={110} value={exportFmt} onChange={setExportFmt} options={[{value:'txt',label:'TXT'},{value:'srt',label:'SRT'},{value:'vtt',label:'VTT'},{value:'json',label:'JSON'}]} />
            <Btn variant="subtle" icon="save" onClick={()=>toast({kind:'good',title:t(lang,'export_result')})}>{t(lang,'export_result')}</Btn>
          </div>
        </div>
      </div>

      <div className="stage">
        <div className="stage-head">
          <span className="st-title"><Icon name="filetext" size={17} style={{color:'var(--accent)'}} />{t(lang,'extract_result')}</span>
          {rows.length>0 && <Btn variant="ghost" size="sm" icon="copy" onClick={()=>toast({kind:'good',title:lang==='en'?'Copied':'Đã sao chép'})}>{t(lang,'copy_all')}</Btn>}
        </div>
        <div className="results-wrap">
          {rows.length>0 ? (
            <div className="results-scroll">
              <table className="rtable">
                <thead><tr>
                  <th className="num">#</th><th style={{width:150}}>{t(lang,'col_time')}</th><th>{t(lang,'col_content')}</th>
                </tr></thead>
                <tbody>
                {rows.map(r=>(
                  <tr key={r.id}><td className="num">{String(r.id).padStart(2,'0')}</td>
                  <td className="tcode">{r.time}</td><td>{r.text}</td></tr>
                ))}
                </tbody>
              </table>
            </div>
          ) : (
            <React.Fragment>
              <table className="rtable"><thead><tr>
                <th className="num">#</th><th style={{width:150}}>{t(lang,'col_time')}</th><th>{t(lang,'col_content')}</th>
              </tr></thead></table>
              <div className="empty">
                <div className="em-art"><Icon name="filetext" size={34} /></div>
                <div className="em-title">{lang==='en'?'No transcript yet':'Chưa có kết quả'}</div>
                <div className="em-sub">{t(lang,'stt_empty')}</div>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

window.SttTab = SttTab;
