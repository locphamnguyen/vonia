/* Pronunciation normalization modal — "Sửa phát âm cho ký tự đặc biệt".
   The UI for the `normalize` parameter: opens from the Speak button in the TTS
   and Dialogue tabs before audio renders, lets the user give a reading for tokens
   the model would mis-read (8,6% / GDP / ₫ / acronyms). See lib/pronounce.ts for
   detection. onApply receives the {token -> reading} dictionary. */
import React, { useRef, useState } from 'react'
import { Modal, Icon, Btn, useToast } from './ui'
import { t, type Lang } from '../lib/i18n'
import { scanUnknowns } from '../lib/pronounce'

export function PronunciationModal({ lang, text, onClose, onApply }:
  { lang: Lang; text: string; onClose: () => void; onApply?: (dict: Record<string, string>) => void }) {
  const items = useRef(scanUnknowns(text)).current
  const [readings, setReadings] = useState<string[]>(() => items.map(() => ''))
  const toast = useToast()
  const heading = t(lang, 'pron_found').replace('{n}', String(items.length))

  const apply = () => {
    const dict: Record<string, string> = {}
    items.forEach((it, i) => { if (readings[i].trim()) dict[it.orig] = readings[i].trim() })
    toast({ kind: 'good', title: t(lang, 'pron_saved') })
    onApply && onApply(dict)
    onClose()
  }

  return (
    <Modal onClose={onClose} className="modal-pron">
      <div className="modal-head">
        <span className="badge accent" style={{ padding: '6px 10px' }}><Icon name="type" size={15} /></span>
        <span className="mt">{t(lang, 'pron_title')}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={17} /></button>
      </div>
      <div className="modal-body">
        <div className="stack gap14">
          <div>
            <div className="pron-heading"><Icon name="info" size={16} style={{ color: 'var(--accent)' }} />{heading}</div>
            <div className="hint" style={{ marginTop: 6 }}>{t(lang, 'pron_sub')}</div>
          </div>
          <div className="pron-tablewrap">
            <table className="rtable pron-table">
              <thead><tr>
                <th style={{ width: 120 }}>{t(lang, 'col_orig')}</th>
                <th style={{ width: 230 }}>{t(lang, 'col_readas')}</th>
                <th>{t(lang, 'col_appears')}</th>
              </tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className={readings[i].trim() ? 'has-reading' : ''}>
                    <td><span className="pron-orig">{it.orig}</span></td>
                    <td>
                      <input
                        className="input pron-input"
                        value={readings[i]}
                        placeholder={t(lang, 'read_ph')}
                        onChange={(e) => setReadings(r => r.map((v, j) => j === i ? e.target.value : v))}
                      />
                    </td>
                    <td><span className="pron-ctx">{it.context}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="subtle" onClick={onClose}>{t(lang, 'pron_skip')}</Btn>
        <Btn variant="primary" icon="check" onClick={apply}>{t(lang, 'pron_apply')}</Btn>
      </div>
    </Modal>
  )
}
