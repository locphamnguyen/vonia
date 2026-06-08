import React, { useRef, useState } from 'react'
import { Icon, Btn, Modal, AccordionProvider, AudioPlayer, useToast } from '../components/ui'
import { LanguageField, AdvancedSettings, AudioTuning, useSettings, DEFAULTS } from '../components/panels'
import { VoiceStore } from '../components/voice-library'
import { ResultsTable, GenBar } from '../components/results'
import { useGenerator, type GenRow } from '../hooks/useGenerator'
import { useVoices } from '../app/store'
import { t, type Lang } from '../lib/i18n'
import { LANG_NAME } from '../lib/data'
import * as api from '../lib/api'

/* Pre-clone check: the sample text must match the sample audio exactly, or the
   clone learns the wrong voice. Shown before generation. */
function CloneWarnModal({ lang, sampleText, onClose, onConfirm }:
  { lang: Lang; sampleText: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal onClose={onClose} className="modal-warn">
      <div className="modal-body">
        <div className="row gap14" style={{ alignItems: 'flex-start' }}>
          <span className="warn-ico"><Icon name="warn" size={26} /></span>
          <div className="stack gap12" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t(lang, 'clone_warn_title')}</div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-soft)' }}>
              <Icon name="warn" size={14} style={{ color: 'var(--warn)', verticalAlign: '-2px', marginRight: 5 }} />{t(lang, 'clone_warn_body')}
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{t(lang, 'clone_warn_current')}</div>
              <div className="warn-sample">{sampleText && sampleText.trim() ? sampleText : <span className="faint">{t(lang, 'clone_warn_empty')}</span>}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="subtle" icon="rotate" onClick={onClose}>{t(lang, 'clone_warn_back')}</Btn>
        <Btn variant="primary" icon="bolt" onClick={onConfirm}>{t(lang, 'clone_warn_confirm')}</Btn>
      </div>
    </Modal>
  )
}

/* Post-clone nudge: offer to save the voice to the store for reuse. */
function SaveVoiceModal({ lang, onClose, onSave }:
  { lang: Lang; onClose: () => void; onSave: () => void }) {
  return (
    <Modal onClose={onClose} className="modal-warn">
      <div className="modal-body">
        <div className="row gap14" style={{ alignItems: 'flex-start' }}>
          <span className="ask-ico"><Icon name="help" size={26} /></span>
          <div className="stack gap10" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t(lang, 'save_q_title')}</div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-soft)' }}>{t(lang, 'save_q_body')}</div>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="subtle" onClick={onClose}>{t(lang, 'save_later')}</Btn>
        <Btn variant="primary" icon="save" onClick={onSave}>{t(lang, 'save_to_store')}</Btn>
      </div>
    </Modal>
  )
}

export function CloneTab({ lang, starred, onStar }: { lang: Lang; starred: Set<string>; onStar: (n: string) => void }) {
  const [s, set] = useSettings({ ...DEFAULTS })
  const [language, setLanguage] = useState('vi')
  const [sampleText, setSampleText] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [selVoice, setSelVoice] = useState('Achernar')
  const [playSrc, setPlaySrc] = useState<string | null>(null)
  const [showWarn, setShowWarn] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [savePromptSeen, setSavePromptSeen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const gen = useGenerator()
  const store = useVoices()
  const toast = useToast()

  // Generate is gated by the sample-text check modal.
  const requestStart = () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_sample_audio') }); return }
    if (!text.trim()) { toast({ kind: 'err', title: t(lang, 'enter_preview_text') }); return }
    setShowWarn(true)
  }

  const start = async () => {
    setShowWarn(false)
    setPlaySrc(null)
    toast({ kind: 'info', title: t(lang, 'cloning_voice') })
    const ok = await gen.start([{
      text: text.slice(0, 350),
      build: () => api.tts({
        text: text.slice(0, 350), language: LANG_NAME[language],
        refAudioFile: file!, refText: sampleText || undefined, settings: s, format: 'wav',
      }),
    }], 1)
    // After the first successful clone, nudge once to save the voice.
    if (ok && !savePromptSeen) { setSavePromptSeen(true); setShowSave(true) }
  }

  const aiSuggest = async () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_sample_first') }); return }
    toast({ kind: 'info', title: t(lang, 'transcribing_sample') })
    try {
      // Auto-detect the sample's language (do NOT force the synthesis language —
      // the reference audio may be spoken in a different language than the target).
      const r = await api.stt(file, 'turbo')
      setSampleText(r.text)
      toast({ kind: 'good', title: t(lang, 'transcript_filled') })
    } catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) }
  }

  const onSave = async () => {
    if (!file) { toast({ kind: 'err', title: t(lang, 'choose_sample_first') }); return }
    const name = window.prompt(t(lang, 'voice_name_prompt'))
    if (!name) return
    try {
      await api.registerVoice(name, file, sampleText || undefined)
      await store.refresh()
      toast({ kind: 'good', title: t(lang, 'voice_saved_toast'), desc: name })
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
          <AccordionProvider initial={t(lang, 'adv_settings')}>
            <AdvancedSettings lang={lang} s={s} set={set} />
            <AudioTuning lang={lang} s={s} set={set} />
          </AccordionProvider>
        </div>
        <div className="railfoot">
          <GenBar lang={lang} running={gen.running} status={gen.status} progress={gen.progress}
            onStart={requestStart} onStop={gen.stop} disabled={!file} />
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
            <div className="results-scroll"><ResultsTable rows={gen.rows} lang={lang} showNum={false} onRetry={gen.retry} onPlay={(r: GenRow) => setPlaySrc(r.url || null)} /></div>
          ) : (
            <>
              <table className="rtable"><thead><tr>
                <th>{t(lang, 'col_content')}</th>
                <th style={{ width: 150 }}>{t(lang, 'col_status')}</th><th style={{ width: 158 }}>{t(lang, 'col_action')}</th>
              </tr></thead></table>
              <div className="empty" style={{ minHeight: 96, padding: '22px 24px', gap: 6 }}>
                <div className="em-title">{t(lang, 'no_audio')}</div>
                <div className="em-sub">{t(lang, 'clone_empty_sub')}</div>
              </div>
            </>
          )}
        </div>

        <AudioPlayer src={playSrc} />

        <VoiceStore lang={lang} selected={selVoice} onSelect={setSelVoice} starred={starred} onStar={onStar}
          yourVoices={store.userUIVoices} onSave={onSave}
          onDeleteVoice={async (v) => { if (v.id) { try { await api.deleteVoice(v.id); await store.refresh(); toast({ kind: 'info', title: t(lang, 'voice_deleted') }) } catch (e: any) { toast({ kind: 'err', title: String(e?.message || e) }) } } }} />
      </div>
      {showWarn && <CloneWarnModal lang={lang} sampleText={sampleText} onClose={() => setShowWarn(false)} onConfirm={start} />}
      {showSave && <SaveVoiceModal lang={lang} onClose={() => setShowSave(false)} onSave={() => { setShowSave(false); onSave() }} />}
    </div>
  )
}
