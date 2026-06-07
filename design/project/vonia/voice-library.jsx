/* ============================================================
   VONIA — Voice library (search / filter / favorites)
   ============================================================ */

function VoiceRow({ v, selected, onSelect, starred, onStar, playing, onPlay }) {
  return (
    <div className={'vrow'+(selected?' sel':'')} onClick={onSelect}>
      <span className={'star'+(starred?' on':'')} onClick={(e)=>{e.stopPropagation(); onStar();}} title="Gắn sao">
        <Icon name="star" size={16} fill={starred} />
      </span>
      <span className="av" style={{background:v.color+(document.documentElement.dataset.theme==='light'?'':'')}}>
        {v.name[0]}
      </span>
      <span className="vmeta">
        <div className="vname">{v.name}</div>
        <div className="vdesc">{v._lang==='en'?v.en:v.vi}</div>
      </span>
      <button className={'vplay'+(playing?' playing':'')} onClick={(e)=>{e.stopPropagation(); onPlay();}}>
        <Icon name={playing?'pause':'play'} size={14} fill={!playing} />
      </button>
    </div>
  );
}

function VoiceList({ voices, lang, selected, onSelect, starred, onStar, compact }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [playingName, setPlayingName] = useState(null);
  useEffect(()=>{ if(!playingName) return; const tm=setTimeout(()=>setPlayingName(null), 2600); return ()=>clearTimeout(tm); },[playingName]);

  const filtered = voices.filter(v => {
    if (filter==='M' && v.g!=='M') return false;
    if (filter==='F' && v.g!=='F') return false;
    if (filter==='star' && !starred.has(v.name)) return false;
    if (q) { const s=(v.name+' '+v.vi+' '+v.en).toLowerCase(); if(!s.includes(q.toLowerCase())) return false; }
    return true;
  });

  const chips = [
    {id:'all', label:t(lang,'all')},
    {id:'M', label:t(lang,'male')},
    {id:'F', label:t(lang,'female')},
    {id:'star', label:t(lang,'starred')},
  ];

  return (
    <div className="stack" style={{minWidth:0}}>
      <div className="vlib-toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder={t(lang,'search_voice')} />
          {q && <Icon name="x" size={14} className="faint" style={{cursor:'pointer'}} onClick={()=>setQ('')} />}
        </div>
      </div>
      <div className="filter-chips">
        {chips.map(c=>(
          <button key={c.id} className={'chip'+(filter===c.id?' on':'')} onClick={()=>setFilter(c.id)}>
            {c.id==='star' && <Icon name="star" size={12} fill style={{marginRight:4, verticalAlign:'-1px'}} />}
            {c.label}
          </button>
        ))}
      </div>
      {filtered.length ? (
        <div className="vlist">
          {filtered.map(v=>(
            <VoiceRow key={v.name} v={{...v,_lang:lang}}
              selected={selected===v.name} onSelect={()=>onSelect(v.name)}
              starred={starred.has(v.name)} onStar={()=>onStar(v.name)}
              playing={playingName===v.name} onPlay={()=>setPlayingName(v.name)} />
          ))}
        </div>
      ) : (
        <div className="vempty">
          <div className="ve-icon"><Icon name="search" size={22} /></div>
          <div className="ve-text">{t(lang,'no_voice_found')}</div>
        </div>
      )}
    </div>
  );
}

/* Full voice store card used in Clone tab (two columns) */
function VoiceStore({ lang, selected, onSelect, starred, onStar, yourVoices }) {
  const [backupOpen, setBackupOpen] = useState(false);
  const bref = useRef(null);
  const toast = useToast();
  useEffect(()=>{
    function d(e){ if(bref.current && !bref.current.contains(e.target)) setBackupOpen(false); }
    document.addEventListener('mousedown', d); return ()=>document.removeEventListener('mousedown', d);
  },[]);
  const backupItems = [
    {icon:'layers', label:t(lang,'backup_all')},
    {icon:'download', label:t(lang,'backup_load')},
    {icon:'folder', label:t(lang,'backup_open')},
  ];
  return (
    <div className="vlib">
      <div className="vlib-head">
        <span className="vh-title"><Icon name="library" size={16} />{t(lang,'voice_store')}</span>
        <span className="grow" />
      </div>
      <div className="vlib-cols">
        <div className="vlib-col">
          <div className="row between" style={{marginBottom:10}}>
            <span className="section-title">{t(lang,'available')} <span className="muted">({VOICES.length} {t(lang,'samples')})</span></span>
          </div>
          <VoiceList voices={VOICES} lang={lang} selected={selected} onSelect={onSelect} starred={starred} onStar={onStar} />
        </div>
        <div className="vlib-col">
          <div className="row between" style={{marginBottom:10}}>
            <span className="section-title">{t(lang,'your_voices')} <span className="muted">({yourVoices.length} {t(lang,'samples')})</span></span>
            <div className="row gap6">
              <button className="btn sm subtle" onClick={()=>toast({kind:'good', title: lang==='en'?'Voice saved':'Đã lưu giọng', desc: lang==='en'?'Added to your voices.':'Đã thêm vào Giọng của bạn.'})}>
                <Icon name="save" size={14} />{t(lang,'save')}
              </button>
              <div className="select" ref={bref} style={{position:'relative'}}>
                <button className="btn sm subtle" onClick={()=>setBackupOpen(o=>!o)}>
                  <Icon name="layers" size={14} />{t(lang,'backup')}<Icon name="chevdown" size={13} />
                </button>
                {backupOpen && (
                  <div className="select-menu" style={{right:0, left:'auto', width:260}}>
                    {backupItems.map((it,i)=>(
                      <div key={i} className="opt" onClick={()=>{ setBackupOpen(false); toast({kind:'info', title: it.label}); }}>
                        <Icon name={it.icon} size={15} />{it.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {yourVoices.length ? (
            <div className="vlist">
              {yourVoices.map(v=>(
                <VoiceRow key={v.name} v={{...v,_lang:lang}} selected={selected===v.name} onSelect={()=>onSelect(v.name)}
                  starred={starred.has(v.name)} onStar={()=>onStar(v.name)} playing={false} onPlay={()=>{}} />
              ))}
            </div>
          ) : (
            <div className="vempty">
              <div className="ve-icon"><Icon name="mic" size={22} /></div>
              <div className="ve-text">{t(lang,'your_voices_empty')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VoiceList, VoiceStore, VoiceRow });
