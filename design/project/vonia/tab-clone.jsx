/* ============================================================
   VONIA — Tab: Sao chép giọng nói (Voice clone)
   ============================================================ */

/* ── 3-step progress bar ────────────────────────────────────── */
function CloneSteps({ step, lang }) {
  const labels = lang === 'en'
    ? ['Audio sample', 'Transcript', 'Test voice']
    : ['Mẫu âm thanh', 'Văn bản mẫu', 'Thử giọng'];

  return (
    <div className="clone-steps">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <React.Fragment key={n}>
            <div className={['clone-step', done ? 'done' : '', active ? 'active' : ''].filter(Boolean).join(' ')}>
              <div className="csn">
                {done ? <Icon name="check" size={11} /> : n}
              </div>
              <span className="csl">{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={`clone-step-line${done ? ' done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Audio dropzone ─────────────────────────────────────────── */
function AudioDropzone({ lang, fileName, onFile }) {
  const [dragging, setDragging] = useState(false);
  const waveBars = useRef(Array.from({ length: 38 }, () => 10 + Math.random() * 90));

  if (fileName) {
    return (
      <div className="clone-dz clone-dz--loaded">
        <div className="cdz-wave">
          {waveBars.current.map((h, i) => <i key={i} style={{ height: h + '%' }} />)}
        </div>
        <div className="cdz-info">
          <Icon name="audio" size={14} style={{ color: 'var(--accent)' }} />
          <span className="cdz-fname">{fileName}</span>
          <button
            className="cdz-change"
            onClick={() => onFile('')}
            title={lang === 'en' ? 'Remove file' : 'Xóa file'}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`clone-dz${dragging ? ' clone-dz--drag' : ''}`}
      onDragEnter={() => setDragging(true)}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); setDragging(false); onFile('giong_mau_5s.wav'); }}
      onClick={() => onFile('giong_mau_5s.wav')}
    >
      <div className="cdz-icon">
        <Icon name="mic" size={22} />
      </div>
      <div className="cdz-title">
        {lang === 'en' ? 'Drag audio here' : 'Kéo file âm thanh vào đây'}
      </div>
      <div className="cdz-sub">
        {lang === 'en' ? 'WAV / MP3 · 5–10 sec · quiet room' : 'WAV / MP3 · 5–10 giây · không có tiếng ồn'}
      </div>
      <button
        className="btn sm subtle cdz-btn"
        onClick={e => { e.stopPropagation(); onFile('giong_mau_5s.wav'); }}
      >
        <Icon name="folder" size={14} />
        {lang === 'en' ? 'Choose file' : 'Chọn file'}
      </button>
    </div>
  );
}

/* ── Clone Tab ──────────────────────────────────────────────── */
function CloneTab({ lang, starred, onStar }) {
  const [s, set] = useSettings({ ...DEFAULTS });
  const [language, setLanguage] = useState('vi');
  const [sampleText, setSampleText] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [selVoice, setSelVoice] = useState('Achernar');
  const gen = useGenerator(lang);
  const toast = useToast();

  // step 1 = needs audio, 2 = needs transcript, 3 = ready
  const step = !fileName ? 1 : !sampleText.trim() ? 2 : 3;

  const start = () => {
    if (!text.trim()) {
      toast({ kind: 'err', title: lang === 'en' ? 'Enter text to preview' : 'Hãy nhập nội dung để thử giọng' });
      return;
    }
    const ok = gen.start([{ text: text.slice(0, 350) }]);
    if (ok) toast({ kind: 'info', title: lang === 'en' ? 'Cloning voice…' : 'Đang sao chép giọng…' });
  };

  return (
    <div className="workspace">
      <div className="leftcol">

        {/* 3-step progress */}
        <CloneSteps step={step} lang={lang} />

        <div className="rail">

          {/* Step 1 — audio sample */}
          <div>
            <div className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icon name="mic" size={14} style={{ color: step >= 1 ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{t(lang, 'sample_audio')}</span>
              {fileName && (
                <span className="badge good" style={{ fontSize: 11, padding: '2px 7px', marginLeft: 4 }}>
                  <Icon name="check" size={11} />OK
                </span>
              )}
            </div>
            <AudioDropzone lang={lang} fileName={fileName} onFile={setFileName} />
          </div>

          {/* Step 2 — transcript */}
          <div>
            <div className="field-label between" style={{ justifyContent: 'space-between', width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="filetext" size={14} style={{ color: step >= 2 ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0 }} />
                {t(lang, 'sample_text')}
                <span className="req">({t(lang, 'required')})</span>
              </span>
              <button
                className="btn sm ghost"
                style={{ padding: '4px 9px' }}
                onClick={() => {
                  setSampleText('Xin chào, đây là giọng nói mẫu để Vonia học và sao chép.');
                  toast({ kind: 'info', title: lang === 'en' ? 'AI filled sample text' : 'AI đã điền văn bản mẫu' });
                }}
              >
                <Icon name="sparkles" size={14} style={{ color: 'var(--accent)' }} />
                {t(lang, 'ai_suggest')}
              </button>
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 96 }}
              value={sampleText}
              onChange={e => setSampleText(e.target.value)}
              placeholder={t(lang, 'sample_text_ph')}
            />
          </div>

          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <AdvancedSettings lang={lang} s={s} set={set} />
          <AudioTuning lang={lang} s={s} set={set} />
        </div>

        <div className="railfoot">
          <GenBar
            lang={lang}
            running={gen.running}
            status={gen.status}
            progress={gen.progress}
            onStart={start}
            onStop={gen.stop}
            disabled={!fileName}
          />
        </div>
      </div>

      {/* Right stage */}
      <div className="stage">

        {/* Preview text */}
        <div>
          <div className="stage-head">
            <span className="st-title">
              <Icon name="type" size={17} style={{ color: 'var(--accent)' }} />
              {t(lang, 'text_content')}
            </span>
            <span className="charcount tnum">{text.length}/350</span>
          </div>
          <textarea
            className="bigtext"
            maxLength={350}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t(lang, 'text_ph')}
          />
        </div>

        {/* Results */}
        <div className="results-wrap" style={{ flex: 'none' }}>
          {gen.hasResults ? (
            <div className="results-scroll">
              <ResultsTable rows={gen.rows} lang={lang} onRetry={() => {}} />
            </div>
          ) : (
            <React.Fragment>
              <table className="rtable">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>{t(lang, 'col_content')}</th>
                    <th style={{ width: 150 }}>{t(lang, 'col_status')}</th>
                    <th style={{ width: 120 }}>{t(lang, 'col_action')}</th>
                  </tr>
                </thead>
              </table>
              <div className="empty" style={{ minHeight: 180 }}>
                <div className="em-art"><Icon name="audio" size={34} /></div>
                <div className="em-title">{t(lang, 'no_audio')}</div>
                <div className="em-sub">
                  {lang === 'en'
                    ? 'Add a 5–10s sample, type the matching transcript, then preview with a short sentence above.'
                    : 'Thêm mẫu 5–10 giây, gõ đúng văn bản tương ứng, rồi thử bằng một câu ngắn ở trên.'}
                </div>
                <div className="em-steps">
                  <span className="em-step"><span className="n">1</span>{t(lang, 'sample_audio').split('(')[0]}</span>
                  <span className="em-step"><span className="n">2</span>{t(lang, 'sample_text')}</span>
                  <span className="em-step"><span className="n">3</span>{t(lang, 'start')}</span>
                </div>
              </div>
            </React.Fragment>
          )}
        </div>

        <AudioPlayer hasAudio={gen.allDone} />

        <VoiceStore
          lang={lang}
          selected={selVoice}
          onSelect={setSelVoice}
          starred={starred}
          onStar={onStar}
          yourVoices={[]}
        />
      </div>
    </div>
  );
}

window.CloneTab = CloneTab;
