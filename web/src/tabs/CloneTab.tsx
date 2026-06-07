import React, { useRef, useState } from 'react'
import { Icon, Btn, AudioPlayer, useToast } from '../components/ui'
import { LanguageField, AdvancedSettings, AudioTuning, useSettings, DEFAULTS } from '../components/panels'
import { VoiceStore } from '../components/voice-library'
import { ResultsTable, GenBar } from '../components/results'
import { useGenerator, type GenRow } from '../hooks/useGenerator'
import { useVoices } from '../app/store'
import { t, type Lang } from '../lib/i18n'
import { LANG_NAME } from '../lib/data'
import * as api from '../lib/api'

export function CloneTab({ lang, starred, onStar }: { lang: Lang; starred: Set<string>; onStar: (n: string) => void }) {
  const [s, set] = useSettings({ ...DEFAULTS })
  const [language, setLanguage] = useState('vi')
  const [sampleText, setSampleText] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [selVoice, setSelVoice] = useState('Achernar')
  const [playSrc, setPlaySrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const gen = useGenerator()
  const store = useVoices()
  const toast = useToast()

  const start = () => {
    if (!file) { toast({ kind: 'err', title: lang === 'en' ? 'Choose a sample audio' : 'Hãy chọn tệp âm thanh mẫu' }); return }
    if (!text.trim()) { toast({ kind: 'err', title: lang === 'en' ? 'Enter text to preview' : 'Hãy nhập nội dung để thử giọng' }); return }
    setPlaySrc(null)
    gen.start([{
      text: text.slice(0, 350),
      build: () => api.tts({
        text: text.slice(0, 350), language: LANG_NAME[language],
        refAudioFile: file, refText: sampleText || undefined, settings: s, format: 'wav',
      }),
    }], 1)
    toast({ kind: 'info', title: lang === 'en' ? 'Cloning voice…' : 'Đang sao chép giọng…' })
  }

  const aiSuggest = async () => {
    if (!file) { toast({ kind: 'err', title: lang === 'en' ? 'Choose a sample audio first' : 'Hãy chọn tệp mẫu trước' }); return }
    toast({ kind: 'info', title: lang === 'en' ? 'Transcribing sample…' : 'Đang nhận dạng mẫu…' })
    try {
      const r = await api.stt(file, 'turbo', language)
      setSampleText(r.text)
      toast({ kind: 'good', title: lang === 'en' ? 'Transcript filled' : 'Đã điền văn bản mẫu' })
    } catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
  }

  const onSave = async () => {
    if (!file) { toast({ kind: 'err', title: lang === 'en' ? 'Choose a sample audio first' : 'Hãy chọn tệp mẫu trước' }); return }
    const name = window.prompt(lang === 'en' ? 'Voice name:' : 'Tên giọng:')
    if (!name) return
    try {
      await api.registerVoice(name, file, sampleText || undefined)
      await store.refresh()
      toast({ kind: 'good', title: lang === 'en' ? 'Voice saved' : 'Đã lưu giọng', desc: name })
    } catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
  }

  return (
    <div className="workspace">
      <div className="leftcol">
        <div className="rail">
          <div>
            <div className="field-label">{t(lang, 'sample_audio')}</div>
            <input ref={fileRef} type="file" accept="audio/*,video/*" style={{ display: 'none' }}
              onChange={e => setFile(e.target.files?.[0] || null)} />
            <div className="input-with-btn">
              <div className={'input-file' + (file ? '' : ' placeholder')} onClick={() => fileRef.current?.click()}>
                <Icon name="audio" size={15} style={{ color: file ? 'var(--accent)' : 'var(--text-faint)' }} />
                <span className="fname">{file ? file.name : t(lang, 'no_file')}</span>
              </div>
              <Btn variant="subtle" onClick={() => fileRef.current?.click()}>{t(lang, 'choose')}</Btn>
            </div>
          </div>
          <div>
            <div className="field-label between" style={{ justifyContent: 'space-between', width: '100%' }}>
              <span>{t(lang, 'sample_text')} <span className="req">({t(lang, 'required')})</span></span>
              <button className="btn sm ghost" style={{ padding: '4px 9px' }} onClick={aiSuggest}>
                <Icon name="sparkles" size={14} style={{ color: 'var(--accent)' }} />{t(lang, 'ai_suggest')}
              </button>
            </div>
            <textarea className="textarea" style={{ minHeight: 108 }} value={sampleText} onChange={e => setSampleText(e.target.value)} placeholder={t(lang, 'sample_text_ph')} />
          </div>
          <LanguageField lang={lang} value={language} onChange={setLanguage} />
          <AdvancedSettings lang={lang} s={s} set={set} />
          <AudioTuning lang={lang} s={s} set={set} />
        </div>
        <div className="railfoot">
          <GenBar lang={lang} running={gen.running} status={gen.status} progress={gen.progress}
            onStart={start} onStop={gen.stop} disabled={!file} />
        </div>
      </div>

      <div className="stage">
        <div>
          <div className="stage-head">
            <span className="st-title"><Icon name="type" size={17} style={{ color: 'var(--accent)' }} />{t(lang, 'text_content')}</span>
            <span className="charcount tnum">{text.length}/350</span>
          </div>
          <textarea className="bigtext" maxLength={350} value={text} onChange={e => setText(e.target.value)} placeholder={t(lang, 'text_ph')} />
        </div>

        <div className="results-wrap" style={{ flex: 'none' }}>
          {gen.hasResults ? (
            <div className="results-scroll"><ResultsTable rows={gen.rows} lang={lang} onRetry={gen.retry} onPlay={(r: GenRow) => setPlaySrc(r.url || null)} /></div>
          ) : (
            <>
              <table className="rtable"><thead><tr>
                <th className="num">#</th><th>{t(lang, 'col_content')}</th>
                <th style={{ width: 150 }}>{t(lang, 'col_status')}</th><th style={{ width: 120 }}>{t(lang, 'col_action')}</th>
              </tr></thead></table>
              <div className="empty" style={{ minHeight: 180 }}>
                <div className="em-art"><Icon name="audio" size={34} /></div>
                <div className="em-title">{t(lang, 'no_audio')}</div>
                <div className="em-sub">{lang === 'en' ? 'Add a 5–10s sample, type the matching transcript, then preview with a short sentence above.' : 'Thêm mẫu 5–10 giây, gõ đúng văn bản tương ứng, rồi thử bằng một câu ngắn ở trên.'}</div>
                <div className="em-steps">
                  <span className="em-step"><span className="n">1</span>{t(lang, 'sample_audio').split('(')[0]}</span>
                  <span className="em-step"><span className="n">2</span>{t(lang, 'sample_text')}</span>
                  <span className="em-step"><span className="n">3</span>{t(lang, 'start')}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <AudioPlayer src={playSrc} />

        <VoiceStore lang={lang} selected={selVoice} onSelect={setSelVoice} starred={starred} onStar={onStar}
          yourVoices={store.userUIVoices} onSave={onSave}
          onDeleteVoice={async (v) => { if (v.id) { try { await api.deleteVoice(v.id); await store.refresh(); toast({ kind: 'info', title: lang === 'en' ? 'Voice deleted' : 'Đã xóa giọng' }) } catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) } } }} />
      </div>
    </div>
  )
}
