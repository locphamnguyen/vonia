/* Voice library — search/filter/favorites. "Your voices" come from the API. */
import React, { useEffect, useRef, useState } from 'react'
import { Icon, useToast } from './ui'
import { t, type Lang } from '../lib/i18n'
import { VOICES, avatarColor, type Voice } from '../lib/data'
import { useVoices } from '../app/store'
import * as api from '../lib/api'

export interface UIVoice { name: string; g?: 'M' | 'F'; vi?: string; en?: string; color?: string; id?: string; cloned?: boolean }

// Short sentence + lightweight params used only to render a quick voice preview.
const PREVIEW_TEXT = 'Xin chào, đây là giọng đọc thử của Vonia.'
const PREVIEW_SETTINGS = { detail: 32, adherence: 2, speed: 1, proc: 'raw', normalize: false } as any

function VoiceRow({ v, lang, selected, onSelect, starred, onStar, playing, loading, onPlay, onDelete }:
  { v: UIVoice; lang: Lang; selected: boolean; onSelect: () => void; starred: boolean; onStar: () => void; playing: boolean; loading: boolean; onPlay: () => void; onDelete?: () => void }) {
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
        ? <button className="vplay" title={t(lang, 'delete')} onClick={(e) => { e.stopPropagation(); onDelete() }}><Icon name="trash" size={14} /></button>
        : <button className={'vplay' + (playing ? ' playing' : '') + (loading ? ' loading' : '')}
            title={t(lang, 'listen')}
            onClick={(e) => { e.stopPropagation(); onPlay() }}>
            <Icon name={loading ? 'loader' : (playing ? 'pause' : 'play')} size={14} fill={!playing && !loading} />
          </button>}
    </div>
  )
}

export function VoiceList({ voices, lang, selected, onSelect, starred, onStar, onDelete, mixedCloned, previewLang }:
  { voices: UIVoice[]; lang: Lang; selected: string; onSelect: (n: string) => void; starred: Set<string>; onStar: (n: string) => void; onDelete?: (v: UIVoice) => void; mixedCloned?: boolean; previewLang?: string }) {
  const [q, setQ] = useState('')
  const [gender, setGender] = useState<'all' | 'M' | 'F'>('all')
  const [starOnly, setStarOnly] = useState(false)
  const [clonedOnly, setClonedOnly] = useState(false)
  const [playingName, setPlayingName] = useState<string | null>(null)
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const store = useVoices()
  const toast = useToast()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cacheRef = useRef<Record<string, string>>({})

  // Revoke cached preview URLs and stop audio when the list unmounts.
  useEffect(() => () => {
    audioRef.current?.pause()
    Object.values(cacheRef.current).forEach(u => URL.revokeObjectURL(u))
  }, [])

  const preview = async (name: string) => {
    const audio = audioRef.current
    if (playingName === name) { audio?.pause(); setPlayingName(null); return }   // toggle off
    audio?.pause(); setPlayingName(null)
    const { voiceId, instruct } = store.resolve(name)
    if (!voiceId && !instruct) { toast({ kind: 'err', title: t(lang, 'preview_fail') }); return }
    try {
      let url = cacheRef.current[name]
      if (!url) {
        setLoadingName(name)
        const blob = await api.tts({ text: PREVIEW_TEXT, language: previewLang, voiceId, instruct, settings: PREVIEW_SETTINGS, format: 'wav' })
        url = URL.createObjectURL(blob)
        cacheRef.current[name] = url
      }
      if (!audioRef.current) audioRef.current = new Audio()
      const a = audioRef.current
      a.src = url
      a.onended = () => setPlayingName(null)
      await a.play()
      setPlayingName(name)
    } catch (e: any) {
      toast({ kind: 'err', title: t(lang, 'preview_fail') })
    } finally {
      setLoadingName(null)
    }
  }

  const filtered = voices.filter(v => {
    // Gender narrows only voices that declare a gender; cloned voices (no `g`)
    // always pass so "Cloned" can combine with Male/Female (issue #4).
    if (gender !== 'all' && v.g && v.g !== gender) return false
    if (starOnly && !starred.has(v.name)) return false
    if (clonedOnly && !(v.cloned || v.id)) return false
    if (q) { const s = (v.name + ' ' + (v.vi || '') + ' ' + (v.en || '')).toLowerCase(); if (!s.includes(q.toLowerCase())) return false }
    return true
  })
  const genderChips = [
    { id: 'all' as const, label: t(lang, 'all') }, { id: 'M' as const, label: t(lang, 'male') }, { id: 'F' as const, label: t(lang, 'female') },
  ]
  return (
    <div className="stack" style={{ minWidth: 0 }}>
      <div className="vlib-toolbar">
        <div className="search">
          <Icon name="search" size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t(lang, 'search_voice')} />
          {q && <span style={{ cursor: 'pointer', display: 'inline-flex' }} onClick={() => setQ('')} aria-label={t(lang, 'clear')}><Icon name="x" size={14} className="faint" /></span>}
        </div>
      </div>
      <div className="filter-chips">
        {genderChips.map(c => (
          <button key={c.id} className={'chip' + (gender === c.id ? ' on' : '')} onClick={() => setGender(c.id)}>
            {c.label}
          </button>
        ))}
        <button className={'chip' + (starOnly ? ' on' : '')} onClick={() => setStarOnly(s => !s)}>
          <Icon name="star" size={12} fill style={{ marginRight: 4, verticalAlign: '-1px' }} />
          {t(lang, 'starred')}
        </button>
        {mixedCloned && (
          <button className={'chip' + (clonedOnly ? ' on' : '')} onClick={() => setClonedOnly(s => !s)}>
            <Icon name="copy" size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />
            {t(lang, 'cloned')}
          </button>
        )}
      </div>
      {filtered.length ? (
        <div className="vlist">
          {filtered.map(v => (
            <VoiceRow key={v.id || v.name} v={v} lang={lang}
              selected={selected === v.name} onSelect={() => onSelect(v.name)}
              starred={starred.has(v.name)} onStar={() => onStar(v.name)}
              playing={playingName === v.name} loading={loadingName === v.name} onPlay={() => preview(v.name)}
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
