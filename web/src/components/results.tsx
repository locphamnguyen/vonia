/* Results table + generation bar — ported & wired to real audio blobs. */
import React from 'react'
import { Icon, Btn } from './ui'
import { t, type Lang } from '../lib/i18n'
import { avatarColor } from '../lib/data'
import type { GenRow } from '../hooks/useGenerator'

export function StatusCell({ state, lang }: { state: string; lang: Lang }) {
  const map: Record<string, [string, string]> = {
    queued: ['idle', lang === 'en' ? 'Queued' : 'Trong hàng đợi'],
    processing: ['run', t(lang, 'processing')],
    done: ['done', t(lang, 'done_status')],
    error: ['err', t(lang, 'failed')],
    idle: ['idle', '—'],
  }
  const [cls, label] = map[state] || map.idle
  return (
    <span className={'status-pill ' + cls}>
      {state === 'processing'
        ? <Icon name="loader" size={13} style={{ animation: 'spin 1s linear infinite' }} />
        : <span className="d" />}
      {label}
    </span>
  )
}

function download(row: GenRow, name: string) {
  if (!row.url) return
  const a = document.createElement('a')
  a.href = row.url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
}

export function ResultsTable({ rows, lang, cols = 'content', onRetry, onPlay, fmt = 'wav' }:
  { rows: GenRow[]; lang: Lang; cols?: 'content' | 'time' | 'dialogue'; onRetry?: (id: number) => void; onPlay?: (row: GenRow) => void; fmt?: string }) {
  return (
    <table className="rtable">
      <thead>
        <tr>
          <th className="num">#</th>
          {(cols === 'dialogue' || cols === 'time') && <th style={{ width: 96 }}>{t(lang, 'col_time')}</th>}
          {cols === 'dialogue' && <th style={{ width: 130 }}>{t(lang, 'col_char')}</th>}
          <th>{t(lang, 'col_content')}</th>
          <th style={{ width: 150 }}>{t(lang, 'col_status')}</th>
          <th style={{ width: 120 }}>{t(lang, 'col_action')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td className="num">{String(r.id).padStart(2, '0')}</td>
            {(cols === 'dialogue' || cols === 'time') && <td className="tcode">{r.time || '00:00'}</td>}
            {cols === 'dialogue' && <td>
              <span className="row gap6">
                <span className="av" style={{ width: 24, height: 24, fontSize: 11, background: avatarColor(r.char || '?') }}>{(r.char || '?')[0]}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.char}</span>
              </span>
            </td>}
            <td style={{ maxWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error || r.text}>{r.text}</div>
            </td>
            <td><StatusCell state={r.state} lang={lang} /></td>
            <td>
              <div className="row-actions">
                <button className="mini-btn accent" disabled={r.state !== 'done'} title={t(lang, 'speak')} onClick={() => onPlay && onPlay(r)}><Icon name="play" size={14} fill /></button>
                <button className="mini-btn accent" disabled={r.state !== 'done'} title={t(lang, 'download')} onClick={() => download(r, `vonia_${String(r.id).padStart(2, '0')}.${fmt}`)}><Icon name="download" size={14} /></button>
                {r.state === 'error'
                  ? <button className="mini-btn" title={lang === 'en' ? 'Retry' : 'Thử lại'} onClick={() => onRetry && onRetry(r.id)}><Icon name="refresh" size={14} /></button>
                  : <button className="mini-btn danger" disabled={r.state === 'processing'} title={lang === 'en' ? 'Delete' : 'Xóa'}><Icon name="trash" size={14} /></button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function GenBar({ lang, running, status, progress, onStart, onStop, startLabel, disabled }:
  { lang: Lang; running: boolean; status: string; progress: number; onStart: () => void; onStop: () => void; startLabel?: string; disabled?: boolean }) {
  const statusText = running ? t(lang, 'generating')
    : status === 'done' ? (lang === 'en' ? 'Completed' : 'Đã hoàn tất')
    : status === 'err' ? t(lang, 'failed') : t(lang, 'ready')
  return (
    <div className="stack gap10">
      <div className="row gap6">
        <span className={'status-pill ' + (running ? 'run' : status === 'done' ? 'done' : status === 'err' ? 'err' : 'idle')}>
          <span className="d" />{statusText}
        </span>
        <span className="grow" />
        {running && progress > 0 && <span className="faint tnum" style={{ fontSize: 12, fontWeight: 600 }}>{progress}%</span>}
      </div>
      <div className={'progress' + (running && progress < 6 ? ' indet' : '')}><i style={{ width: progress + '%' }} /></div>
      <div className="row gap8" style={{ gap: 8 }}>
        <Btn variant="primary" icon="play" block onClick={onStart} disabled={disabled || running}>{startLabel || t(lang, 'start')}</Btn>
        <Btn variant="ghost" icon="stop" onClick={onStop} disabled={!running} title={t(lang, 'stop')} />
      </div>
    </div>
  )
}
