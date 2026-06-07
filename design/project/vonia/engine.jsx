/* ============================================================
   VONIA — generation engine: queue, progress, results
   ============================================================ */

function useGenerator(lang) {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | run | done | err
  const timers = useRef([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const start = useCallback((items) => {
    clearTimers();
    if (!items || !items.length) return false;
    const seeded = items.map((it, i) => ({ id:i+1, ...it, state:'queued' }));
    setRows(seeded); setRunning(true); setStatus('run'); setProgress(0);
    const per = 900; // ms per item
    items.forEach((_, i) => {
      timers.current.push(setTimeout(()=>{
        setRows(rs => rs.map(r => r.id===i+1 ? {...r, state:'processing'} : r));
        setProgress(Math.round(((i+0.4)/items.length)*100));
      }, i*per + 120));
      timers.current.push(setTimeout(()=>{
        // occasional simulated failure on the 3rd item if many
        const fail = items.length>=4 && i===2;
        setRows(rs => rs.map(r => r.id===i+1 ? {...r, state: fail?'error':'done'} : r));
        setProgress(Math.round(((i+1)/items.length)*100));
        if (i === items.length-1) {
          setRunning(false); setStatus('done');
        }
      }, i*per + per));
    });
    return true;
  }, []);

  const stop = useCallback(()=>{ clearTimers(); setRunning(false); setStatus(rows.length?'idle':'idle'); setRows(rs=>rs.map(r=> r.state==='processing'||r.state==='queued' ? {...r, state:'idle'} : r)); }, [rows.length]);
  const reset = useCallback(()=>{ clearTimers(); setRows([]); setProgress(0); setStatus('idle'); setRunning(false); }, []);
  useEffect(()=>()=>clearTimers(),[]);

  return { rows, running, progress, status, start, stop, reset, hasResults: rows.length>0, allDone: rows.length>0 && rows.every(r=>r.state==='done'||r.state==='error') };
}

function StatusCell({ state, lang }) {
  const map = {
    queued:   ['idle', lang==='en'?'Queued':'Trong hàng đợi'],
    processing:['run', t(lang,'processing')],
    done:     ['done', t(lang,'done_status')],
    error:    ['err', t(lang,'failed')],
    idle:     ['idle', '—'],
  };
  const [cls, label] = map[state] || map.idle;
  return (
    <span className={'status-pill '+cls}>
      {state==='processing' ? <Icon name="loader" size={13} style={{animation:'spin 1s linear infinite'}} /> : <span className="d" />}
      {label}
    </span>
  );
}

function ResultsTable({ rows, lang, cols='content', onRetry, scrollRef }) {
  // cols: 'content' (TTS/clone) | 'dialogue' (with character)
  return (
    <table className="rtable">
      <thead>
        <tr>
          <th className="num">#</th>
          {(cols==='dialogue'||cols==='time') && <th style={{width:96}}>{t(lang,'col_time')}</th>}
          {cols==='dialogue' && <th style={{width:130}}>{t(lang,'col_char')}</th>}
          <th>{t(lang,'col_content')}</th>
          <th style={{width:150}}>{t(lang,'col_status')}</th>
          <th style={{width:120}}>{t(lang,'col_action')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r=>(
          <tr key={r.id}>
            <td className="num">{String(r.id).padStart(2,'0')}</td>
            {(cols==='dialogue'||cols==='time') && <td className="tcode">{r.time||'00:00'}</td>}
            {cols==='dialogue' && <td>
              <span className="row gap6">
                <span className="av" style={{width:24,height:24,fontSize:11,background:avatarColor(r.char||'?')}}>{(r.char||'?')[0]}</span>
                <span style={{fontWeight:600,fontSize:13}}>{r.char}</span>
              </span>
            </td>}
            <td style={{maxWidth:0}}>
              <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.text}</div>
            </td>
            <td><StatusCell state={r.state} lang={lang} /></td>
            <td>
              <div className="row-actions">
                <button className="mini-btn accent" disabled={r.state!=='done'} title="Phát"><Icon name="play" size={14} fill /></button>
                <button className="mini-btn accent" disabled={r.state!=='done'} title="Tải"><Icon name="download" size={14} /></button>
                {r.state==='error'
                  ? <button className="mini-btn" title="Thử lại" onClick={()=>onRetry&&onRetry(r.id)}><Icon name="refresh" size={14} /></button>
                  : <button className="mini-btn danger" disabled={r.state==='processing'} title="Xóa"><Icon name="trash" size={14} /></button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* Bottom action bar: Start / Stop + status + progress */
function GenBar({ lang, running, status, progress, onStart, onStop, startLabel, disabled }) {
  const statusText = running ? t(lang,'generating')
    : status==='done' ? (lang==='en'?'Completed':'Đã hoàn tất')
    : status==='err' ? t(lang,'failed') : t(lang,'ready');
  return (
    <div className="stack gap10">
      <div className="row gap6">
        <span className={'status-pill '+(running?'run':status==='done'?'done':status==='err'?'err':'idle')}>
          <span className="d" />{statusText}
        </span>
        <span className="grow" />
        {running && progress>0 && <span className="faint tnum" style={{fontSize:12, fontWeight:600}}>{progress}%</span>}
      </div>
      <div className={'progress'+(running&&progress<6?' indet':'')}><i style={{width:progress+'%'}} /></div>
      <div className="row gap8" style={{gap:8}}>
        <Btn variant="primary" icon="play" block onClick={onStart} disabled={disabled||running}>{startLabel||t(lang,'start')}</Btn>
        <Btn variant="ghost" icon="stop" onClick={onStop} disabled={!running} title={t(lang,'stop')} />
      </div>
    </div>
  );
}

Object.assign(window, { useGenerator, ResultsTable, StatusCell, GenBar });
