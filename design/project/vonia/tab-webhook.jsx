/* ============================================================
   VONIA — Webhook API screen
   ============================================================ */

function presetId(name){
  let h = 0x811c9dc5;
  for (const c of name){ h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return 'fac_' + (h>>>0).toString(16).padStart(8,'0');
}

const WH_LANGS = [
  ['Vietnamese','vi'],['English','en'],['Chinese','zh'],['Japanese','ja'],['Korean','ko'],
  ['French','fr'],['Spanish','es'],['German','de'],['Portuguese','pt'],['Russian','ru'],
  ['Hindi','hi'],['Arabic','ar'],['Thai','th'],['Indonesian','id'],['Turkish','tr'],
  ['Italian','it'],['Dutch','nl'],['Polish','pl'],['Ukrainian','uk'],['Bengali','bn'],
  ['Tamil','ta'],['Telugu','te'],['Filipino','fil'],['Malay','ms'],['Swahili','sw'],
];

function randKey(){
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s=''; for(let i=0;i<4;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  let e=''; for(let i=0;i<4;i++) e+=chars[Math.floor(Math.random()*chars.length)];
  return s+'*'.repeat(32)+e;
}

function CodeBlock({ children, onCopy }) {
  return (
    <div className="codeblock">
      <button className="code-copy" onClick={onCopy} title="Copy"><Icon name="copy" size={14} /></button>
      <pre>{children}</pre>
    </div>
  );
}

function WebhookView({ lang, starred, onStar }) {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState('8767');
  const [autostart, setAutostart] = useState(false);
  const [apiKey, setApiKey] = useState(randKey());
  const [vq, setVq] = useState('');
  const [lq, setLq] = useState('');
  const [log, setLog] = useState([]);
  const logTimer = useRef(null);

  // simulate incoming requests while running
  useEffect(()=>{
    if(!running) return;
    logTimer.current = setInterval(()=>{
      const id = 'task_'+Math.random().toString(36).slice(2,8);
      const now = new Date();
      const time = now.toLocaleTimeString('vi-VN',{hour12:false});
      setLog(l => [{ id, time, endpoint:'POST /api/voice/design', status:'queued' }, ...l].slice(0,40));
      setTimeout(()=> setLog(l => l.map(r => r.id===id ? {...r, status:'completed'} : r)), 1400);
    }, 2600);
    return ()=>clearInterval(logTimer.current);
  },[running]);

  const voices = VOICES.filter(v=>{ if(!vq) return true; const s=(v.name+' '+presetId(v.name)).toLowerCase(); return s.includes(vq.toLowerCase()); });
  const langs = WH_LANGS.filter(([n,c])=> !lq || (n+' '+c).toLowerCase().includes(lq.toLowerCase()));
  const en = lang==='en';

  const copy = (text, label) => { try{ navigator.clipboard && navigator.clipboard.writeText(text); }catch(e){} toast({kind:'good', title: label}); };

  const jsonBody = `{
  "preset_id": "fac_9bce14b9",
  "script": "Hello world. This is a sample sentence.",
  "language": "english",
  "speed": 1.0,
  "output_format": "wav"
}`;
  const curl = `# 1. ${en?'List available voice presets':'Liệt kê preset giọng'}
curl http://127.0.0.1:${port}/api/voices \\
  -H "X-API-Key: <your-api-key>"

# 2. ${en?'Submit a voice generation job':'Gửi job tạo giọng'}
curl -X POST http://127.0.0.1:${port}/api/voice/design \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: <your-api-key>" \\
  -d '{"preset_id": "YOUR_PRESET_ID", "script": "Hello world.", "language": "english"}'`;

  return (
    <div className="stage" style={{maxWidth:1180, margin:'0 auto', width:'100%'}}>
      <div>
        <div className="row gap10" style={{marginBottom:4}}>
          <span className="brand-mark" style={{width:30,height:30,borderRadius:9}}><Icon name="webhook" size={16} style={{color:'var(--accent-ink)'}} /></span>
          <span className="st-title" style={{fontSize:17,fontWeight:800,letterSpacing:'-0.01em'}}>Webhook API Voice</span>
          <span className="badge accent">Beta</span>
        </div>
        <div className="hint" style={{fontSize:13}}>{en?'Let external tools (n8n, Zapier, scripts…) generate voices via a local REST API.':'Cho phép công cụ ngoài (n8n, Zapier, script…) tạo giọng nói qua REST API cục bộ.'}</div>
      </div>

      {/* server control */}
      <div className="card" style={{padding:'18px 20px'}}>
        <div className="badge accent" style={{padding:'5px 11px', marginBottom:16}}><Icon name="zap" size={14} />{en?'Server control':'Điều khiển server'}</div>
        <div className="row between wrap gap14">
          <div className="row wrap gap14" style={{flex:1, minWidth:280}}>
            <span className="row gap8" style={{fontWeight:600, fontSize:13.5}}>
              <span className={'server-dot '+(running?'on':'off')} />
              {running ? (en?'Server running':'Server đang chạy') : (en?'Server stopped':'Server đã tắt')}
            </span>
            <div className="row gap8">
              <span className="muted" style={{fontSize:13}}>{en?'Port':'Cổng'}:</span>
              <input className="input mono" value={port} onChange={e=>setPort(e.target.value.replace(/\D/g,''))} style={{width:92, padding:'7px 10px'}} />
            </div>
            <a href="#" onClick={e=>e.preventDefault()} className="mono" style={{color:'var(--accent)', textDecoration:'none', fontSize:13}}>http://127.0.0.1:{port}</a>
          </div>
          <Btn variant={running?'danger':'good'} icon={running?'stop':'play'} onClick={()=>{ setRunning(r=>!r); toast({kind: running?'info':'good', title: running?(en?'Server stopped':'Đã tắt server'):(en?'Server started':'Đã khởi động server')}); }}>
            {running ? (en?'Stop server':'Dừng server') : (en?'Start':'Khởi động')}
          </Btn>
        </div>
        <div className="divider" style={{margin:'14px 0'}} />
        <Toggle on={autostart} onChange={setAutostart}>{en?'Auto-start server when app opens':'Tự khởi động server khi mở app'}</Toggle>
      </div>

      {/* api key */}
      <div className="card" style={{padding:'18px 20px'}}>
        <div className="badge accent" style={{padding:'5px 11px', marginBottom:16}}><Icon name="bolt" size={14} />{en?'API Key':'Khóa API'}</div>
        <div className="row gap10 wrap">
          <input className="input mono grow" value={apiKey} readOnly style={{minWidth:240, letterSpacing:'1px'}} />
          <Btn variant="subtle" icon="wand" onClick={()=>{ setApiKey(randKey()); toast({kind:'good', title:en?'New key generated':'Đã tạo khóa mới'}); }}>{en?'Generate':'Tạo'}</Btn>
          <Btn variant="subtle" icon="copy" onClick={()=>copy(apiKey, en?'API key copied':'Đã sao chép khóa API')}>{en?'Copy':'Sao chép'}</Btn>
        </div>
      </div>

      {/* guide */}
      <div className="card" style={{padding:'18px 20px'}}>
        <div className="badge accent" style={{padding:'5px 11px', marginBottom:16}}><Icon name="info" size={14} />{en?'How to use':'Hướng dẫn sử dụng'}</div>
        <div className="steps" style={{marginBottom:16}}>
          {(en ? [
            <span key="1">Click <b>Start</b> to boot the server. The first request loads the AI model (~30–60s); later requests run instantly.</span>,
            <span key="2">Copy the API key with <b>Copy</b>. Send it as header <span className="inline-code">X-API-Key: &lt;key&gt;</span> on every request.</span>,
            <span key="3">In <b>Voice store</b> below, double-click a preset to copy its <span className="inline-code">preset_id</span>.</span>,
            <span key="4">POST <span className="inline-code">/api/voice/design</span> with the JSON body below (see <b>Languages</b> for the <span className="inline-code">language</span> value).</span>,
            <span key="5">Poll <span className="inline-code">/api/status/{'{task_id}'}</span> until <span className="inline-code">status=completed</span>, then download the audio from <span className="inline-code">results[0]</span>.</span>,
          ] : [
            <span key="1">Bấm <b>Khởi động</b> để bật server. Request đầu tiên sẽ tự load AI model (~30–60 giây) — các request sau xử lý ngay.</span>,
            <span key="2">Copy API key bằng nút <b>Sao chép</b>. Gửi kèm header <span className="inline-code">X-API-Key: &lt;key&gt;</span> trong mọi request.</span>,
            <span key="3">Trong panel <b>Kho giọng</b> bên dưới: nháy đúp 1 preset để copy <span className="inline-code">preset_id</span>.</span>,
            <span key="4">Gửi POST <span className="inline-code">/api/voice/design</span> kèm JSON body theo mẫu (xem panel <b>Ngôn ngữ</b> để chọn giá trị <span className="inline-code">language</span>).</span>,
            <span key="5">Dùng <span className="inline-code">task_id</span> trả về để poll <span className="inline-code">/api/status/{'{task_id}'}</span> đến khi <span className="inline-code">status=completed</span>, rồi tải audio từ <span className="inline-code">results[0]</span>.</span>,
          ]).map((s,i)=>(
            <div className="step-item" key={i}><span className="sn">{i+1}</span><span>{s}</span></div>
          ))}
        </div>
        <div className="banner info" style={{marginBottom:16}}><Icon name="info" size={16} className="bico" /><span>{en?'Concurrency = the "Concurrent lines" slider in the Text-to-speech tab. Works with n8n, Make.com, Zapier, Python/cURL or any HTTP client.':'Số request xử lý cùng lúc = thanh "Số câu đồng thời" ở tab Văn bản sang giọng nói. Tích hợp được với n8n, Make.com, Zapier, Python/cURL hoặc bất kỳ HTTP client nào.'}</span></div>
        <div className="stack gap14">
          <div>
            <div className="field-label">Body Request (JSON)</div>
            <CodeBlock onCopy={()=>copy(jsonBody, en?'JSON copied':'Đã copy JSON')}>{jsonBody}</CodeBlock>
          </div>
          <div>
            <div className="field-label">{en?'cURL example':'Ví dụ cURL'}</div>
            <CodeBlock onCopy={()=>copy(curl, en?'cURL copied':'Đã copy cURL')}>{curl}</CodeBlock>
          </div>
        </div>
      </div>

      {/* voice store + languages */}
      <div className="wh-grid">
        <div className="card" style={{padding:'16px 18px'}}>
          <div className="badge accent" style={{padding:'5px 11px', marginBottom:12}}><Icon name="mic" size={14} />{en?'Voice store':'Kho giọng'}</div>
          <div className="search" style={{marginBottom:10}}><Icon name="search" size={15} /><input value={vq} onChange={e=>setVq(e.target.value)} placeholder={en?'Search by name, tag or ID…':'Tìm theo tên, tag hoặc ID…'} /></div>
          <div className="wh-table-wrap">
            <table className="rtable">
              <thead><tr><th style={{width:130}}>ID</th><th>{en?'Name':'Tên'}</th><th style={{width:60}}>{en?'Fav':'Loại'}</th></tr></thead>
              <tbody>
                {voices.map(v=>(
                  <tr key={v.name} className="copyrow" onDoubleClick={()=>copy(presetId(v.name), (en?'Copied ':'Đã copy ')+presetId(v.name))}>
                    <td className="tcode" style={{color:'var(--accent)'}}>{presetId(v.name)}</td>
                    <td><span className="row gap8"><span className="av" style={{width:22,height:22,fontSize:10,background:v.color}}>{v.name[0]}</span>{v.name}</span></td>
                    <td><span className={'star'+(starred.has(v.name)?' on':'')} style={{display:'inline-flex'}} onClick={(e)=>{e.stopPropagation(); onStar(v.name);}}><Icon name="star" size={15} fill={starred.has(v.name)} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{marginTop:8}}>💡 {en?'Double-click a row to copy its preset_id.':'Nháy đúp 1 dòng để copy preset_id.'}</div>
        </div>

        <div className="card" style={{padding:'16px 18px'}}>
          <div className="badge accent" style={{padding:'5px 11px', marginBottom:12}}><Icon name="globe" size={14} />{en?'Languages':'Ngôn ngữ'}</div>
          <div className="search" style={{marginBottom:10}}><Icon name="search" size={15} /><input value={lq} onChange={e=>setLq(e.target.value)} placeholder={en?'Search name or ISO code…':'Tìm theo tên hoặc mã ISO…'} /></div>
          <div className="wh-table-wrap">
            <table className="rtable">
              <thead><tr><th>{en?'Name (use this value)':'Tên (dùng giá trị này)'}</th><th style={{width:90}}>{en?'ISO':'Mã ISO'}</th></tr></thead>
              <tbody>
                {langs.map(([n,c])=>(
                  <tr key={c} className="copyrow" onDoubleClick={()=>copy(n.toLowerCase(), (en?'Copied ':'Đã copy ')+n.toLowerCase())}>
                    <td className="mono" style={{fontSize:12.5}}>{n.toLowerCase()}</td>
                    <td className="tcode" style={{color:'var(--accent)'}}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{marginTop:8}}>💡 {en?'Double-click a name or ISO to copy — both work for the language field.':'Nháy đúp tên hoặc mã ISO để copy — cả hai đều dùng được cho field language.'}</div>
        </div>
      </div>

      {/* request log */}
      <div className="card" style={{padding:'16px 18px'}}>
        <div className="row between" style={{marginBottom:12}}>
          <div className="row gap10">
            <span className="badge accent" style={{padding:'5px 11px'}}><Icon name="list" size={14} />{en?'Request log':'Nhật ký Request'}</span>
            <span className="muted" style={{fontSize:12.5}}>{log.length} {en?'requests':'yêu cầu'}</span>
          </div>
          <Btn variant="ghost" size="sm" icon="trash" onClick={()=>setLog([])} disabled={!log.length}>{en?'Clear':'Xoá'}</Btn>
        </div>
        <div className="results-wrap" style={{minHeight:160}}>
          {log.length ? (
            <div className="results-scroll" style={{maxHeight:280}}>
              <table className="rtable">
                <thead><tr><th style={{width:110}}>{en?'Time':'Thời gian'}</th><th>Endpoint</th><th style={{width:130}}>{en?'Status':'Trạng thái'}</th><th style={{width:120}}>Task ID</th></tr></thead>
                <tbody>
                  {log.map(r=>(
                    <tr key={r.id}>
                      <td className="tcode">{r.time}</td>
                      <td className="mono" style={{fontSize:12}}>{r.endpoint}</td>
                      <td><span className={'status-pill '+(r.status==='completed'?'done':'run')}>{r.status==='completed'?<span className="d"/>:<Icon name="loader" size={13} style={{animation:'spin 1s linear infinite'}}/>}{r.status==='completed'?(en?'completed':'hoàn tất'):(en?'queued':'trong hàng đợi')}</span></td>
                      <td className="tcode">{r.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty" style={{minHeight:150}}>
              <div className="em-art" style={{width:72,height:72,borderRadius:20}}><Icon name="list" size={26} /></div>
              <div className="em-title" style={{fontSize:14}}>{en?'No requests yet':'Chưa có yêu cầu nào'}</div>
              <div className="em-sub">{running ? (en?'Waiting for incoming requests on the API…':'Đang chờ request đến API…') : (en?'Start the server and send a request to see it logged here.':'Khởi động server và gửi request để xem nhật ký tại đây.')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.WebhookView = WebhookView;
