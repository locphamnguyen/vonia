import React, { useState } from 'react'
import { Icon, Btn, Modal } from './ui'
import { t, type Lang } from '../lib/i18n'

export function Onboarding({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const steps = [
    { icon: 'mic', title: t(lang, 'ob1_title'), body: t(lang, 'ob1_body') },
    { icon: 'audio', title: t(lang, 'ob2_title'), body: t(lang, 'ob2_body') },
    { icon: 'layers', title: t(lang, 'ob3_title'), body: t(lang, 'ob3_body') },
    { icon: 'cpu', title: t(lang, 'ob4_title'), body: t(lang, 'ob4_body') },
  ]
  const cur = steps[step]
  const last = step === steps.length - 1
  return (
    <Modal onClose={onClose} className="ob">
      <div className="ob-hero">
        <span className="ob-mark"><Icon name="audio" size={30} style={{ color: 'var(--accent-ink)' }} /></span>
        <div className="ob-illus"><Icon name={cur.icon} size={56} /></div>
        <div className="ob-steps">{steps.map((_, i) => <span key={i} className={'ob-dot' + (i === step ? ' on' : '')} />)}</div>
      </div>
      <div className="modal-body" style={{ textAlign: 'center', paddingTop: 8 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 8 }}>{cur.title}</div>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.65, maxWidth: 420, margin: '0 auto 22px' }}>{cur.body}</div>
        <div className="row between">
          <Btn variant="ghost" onClick={onClose}>{t(lang, 'ob_skip')}</Btn>
          <div className="row gap10">
            {step > 0 && <Btn variant="subtle" icon="chevleft" onClick={() => setStep(s => s - 1)}>{t(lang, 'ob_back')}</Btn>}
            <Btn variant="primary" icon={last ? 'check' : 'chevright'} iconRight={!last} onClick={() => last ? onClose() : setStep(s => s + 1)}>
              {last ? t(lang, 'ob_done') : t(lang, 'ob_next')}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
