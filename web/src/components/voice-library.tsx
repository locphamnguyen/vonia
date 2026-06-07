/* Voice library — search/filter/favorites. "Your voices" come from the API. */
import React, { useEffect, useRef, useState } from 'react'
import { Icon, useToast } from './ui'
import { t, type Lang } from '../lib/i18n'
import { VOICES, avatarColor, type Voice } from '../lib/data'

export interface UIVoice { name: string; g?: 'M' | 'F'; vi?: string; en?: string; color?: string; id?: string }

function VoiceRow({ v, lang, selected, onSelect, starred, onStar, playing, onPlay, onDelete }:
  { v: UIVoice; lang: Lang; selected: boolean; onSelect: () => void; starred: boolean; onStar: () => void; playing: boolean; onPlay: () => void; onDelete?: () => void }) {
  return (
    <div className={'vrow' + (selected ? ' sel' : '')} onClick={onSelect}>
      <span className={'star' + (starred ? ' on' : '')} onClick={(e) => { e.stopPropagation(); onStar() }} title="Star">
        <Icon name="star" size={16} fill={starred} />
      </span>
      <span className="av" style={{ background: v.color || avatarColor(v.name) }}>{v.name[0]}</span>
      <span className="vmeta">
        <div className="vname">{v.name}</div>
        <div className="vdesc">{lang === 'en' ? (v.en || '') : (v.vi || '')}</div>
      </span>
      {onDelete
        ? <button className="vplay" title={lang === 'en' ? 'Delete' : 'Xóa'} onClick={(e) => { e.stopPropagation(); onDelete() }}><Icon name="trash" size={14} /></button>
        : <button className={'vplay' + (playing ? ' playing' : '')} onClick={(e) => { e.stopPropagation(); onPlay() }}><Icon name={playing ? 'pause' : 'play'} size={14} fill={!playing} /></button>}
    </div>
  )
}

export function VoiceList({ voices, lang, selected, onSelect, starred, onStar, onDelete }:
  { voices: UIVoice[]; lang: Lang; selected: string; onSelect: (n: string) => void; starred: Set<string>; onStar: (n: string) => void; onDelete?: (v: UIVoice) => void }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [playingName, setPlayingName] = useState<string | null>(null)
  useEffect(() => { if (!playingName) return; const tm = setTimeout(() => setPlayingName(null), 2600); return () => clearTimeout(tm) }, [playingName])

  const filtered = voices.filter(v => {
    if (filter === 'M' && v.g !== 'M') return false
    if (filter === 'F' && v.g !== 'F') return false
    if (filter === 'star' && !starred.has(v.name)) return false
    if (q) { const s = (v.name + ' ' + (v.vi || '') + ' ' + (v.en || '')).toLowerCase(); if (!s.includes(q.toLowerCase())) return false }
    return true
  })
  const chips = [
    { id: 'all', label: t(lang, 'all') }, { id: 'M', label: t(lang, 'male') },
    { id: 'F', label: t(lang, 'female') }, { id: 'star', label: t(lang, 'starred') },
  ]
  return (
    <div className="stack" style={{ minWidth: 0 }}>
      <div className="vlib-toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t(lang, 'search_voice')} />
          {q && <Icon name="x" size={14} className="faint" style={{ cursor: 'pointer' }} onClick={() => setQ('')} />}
        </div>
      </div>
      <div className="filter-chips">
        {chips.map(c => (
          <button key={c.id} className={'chip' + (filter === c.id ? ' on' : '')} onClick={() => setFilter(c.id)}>
            {c.id === 'star' && <Icon name="star" size={12} fill style={{ marginRight: 4, verticalAlign: '-1px' }} />}
            {c.label}
          </button>
        ))}
      </div>
      {filtered.length ? (
        <div className="vlist">
          {filtered.map(v => (
            <VoiceRow key={v.name} v={v} lang={lang}
              selected={selected === v.name} onSelect={() => onSelect(v.name)}
              starred={starred.has(v.name)} onStar={() => onStar(v.name)}
              playing={playingName === v.name} onPlay={() => setPlayingName(v.name)}
              onDelete={onDelete ? () => onDelete(v) : undefined} />
          ))}
        </div>
      ) : (
        <div className="vempty">
          <div className="ve-icon"><Icon name="search" size={22} /></div>
          <div className="ve-text">{t(lang, 'no_voice_found')}</div>
        </div>
      )}
    </div>
  )
}

export function VoiceStore({ lang, selected, onSelect, starred, onStar, yourVoices, onSave, onDeleteVoice }:
  { lang: Lang; selected: string; onSelect: (n: string) => void; starred: Set<string>; onStar: (n: string) => void; yourVoices: UIVoice[]; onSave?: () => void; onDeleteVoice?: (v: UIVoice) => void }) {
  const [backupOpen, setBackupOpen] = useState(false)
  const bref = useRef<HTMLDivElement>(null)
  const toast = useToast()
  useEffect(() => {
    function d(e: MouseEvent) { if (bref.current && !bref.current.contains(e.target as Node)) setBackupOpen(false) }
    document.addEventListener('mousedown', d); return () => document.removeEventListener('mousedown', d)
  }, [])
  const backupItems = [
    { icon: 'layers', label: t(lang, 'backup_all') },
    { icon: 'download', label: t(lang, 'backup_load') },
    { icon: 'folder', label: t(lang, 'backup_open') },
  ]
  return (
    <div className="vlib">
      <div className="vlib-head">
        <span className="vh-title"><Icon name="library" size={16} />{t(lang, 'voice_store')}</span>
        <span className="grow" />
      </div>
      <div className="vlib-cols">
        <div className="vlib-col">
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="section-title">{t(lang, 'available')} <span className="muted">({VOICES.length} {t(lang, 'samples')})</span></span>
          </div>
          <VoiceList voices={VOICES as Voice[]} lang={lang} selected={selected} onSelect={onSelect} starred={starred} onStar={onStar} />
        </div>
        <div className="vlib-col">
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="section-title">{t(lang, 'your_voices')} <span className="muted">({yourVoices.length} {t(lang, 'samples')})</span></span>
            <div className="row gap6">
              <button className="btn sm subtle" onClick={() => onSave && onSave()}>
                <Icon name="save" size={14} />{t(lang, 'save')}
              </button>
              <div className="select" ref={bref} style={{ position: 'relative' }}>
                <button className="btn sm subtle" onClick={() => setBackupOpen(o => !o)}>
                  <Icon name="layers" size={14} />{t(lang, 'backup')}<Icon name="chevdown" size={13} />
                </button>
                {backupOpen && (
                  <div className="select-menu" style={{ right: 0, left: 'auto', width: 260 }}>
                    {backupItems.map((it, i) => (
                      <div key={i} className="opt" onClick={() => { setBackupOpen(false); toast({ kind: 'info', title: it.label }) }}>
                        <Icon name={it.icon} size={15} />{it.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {yourVoices.length ? (
            <VoiceList voices={yourVoices} lang={lang} selected={selected} onSelect={onSelect}
              starred={starred} onStar={onStar} onDelete={onDeleteVoice} />
          ) : (
            <div className="vempty">
              <div className="ve-icon"><Icon name="mic" size={22} /></div>
              <div className="ve-text">{t(lang, 'your_voices_empty')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
