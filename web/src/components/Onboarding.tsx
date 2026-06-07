import React, { useState } from 'react'
import { Icon, Btn, Modal } from './ui'
import { t, type Lang } from '../lib/i18n'

export function Onboarding({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const steps = lang === 'en' ? [
    { icon: 'mic', title: 'Welcome to Vonia', body: 'A local voice studio: clone voices, turn text into speech, build multi-voice dialogue and transcribe audio — all running privately on your machine.' },
    { icon: 'audio', title: 'Clone a voice in seconds', body: 'Drop a 5–10s sample, type the matching transcript, and Vonia learns the voice. Save it to “Your voices” to reuse anywhere.' },
    { icon: 'layers', title: 'Generate at scale', body: 'Paste long text or a full script. Vonia splits it into lines, runs them as a queue with clear progress, and lets you retry any failed line.' },
    { icon: 'cpu', title: 'Runs on your hardware', body: 'Models run locally on NVIDIA or Apple Silicon GPUs. Download the model once from Environment, then work fully offline.' },
  ] : [
    { icon: 'mic', title: 'Chào mừng đến với Vonia', body: 'Studio giọng nói cục bộ: sao chép giọng, chuyển văn bản thành giọng nói, dựng hội thoại nhiều giọng và bóc băng — tất cả chạy riêng tư trên máy bạn.' },
    { icon: 'audio', title: 'Sao chép giọng trong vài giây', body: 'Thả mẫu 5–10 giây, gõ đúng văn bản tương ứng, Vonia sẽ học giọng đó. Bấm Lưu để dùng lại ở mọi nơi.' },
    { icon: 'layers', title: 'Tạo hàng loạt', body: 'Dán văn bản dài hoặc cả kịch bản. Vonia tách thành từng dòng, chạy theo hàng đợi với tiến trình rõ ràng, và cho phép thử lại dòng bị lỗi.' },
    { icon: 'cpu', title: 'Chạy trên phần cứng của bạn', body: 'Mô hình chạy cục bộ trên GPU NVIDIA hoặc Apple Silicon. Tải model một lần ở tab Cài đặt môi trường rồi làm việc hoàn toàn offline.' },
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
