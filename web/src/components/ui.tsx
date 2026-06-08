/* Shared UI primitives — ported from the design's ui.jsx to TSX. */
import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react'
import type { Lang } from '../lib/i18n'

/* ---------------- Icons (Lucide path data) ---------------- */
const ICONS: Record<string, string> = {
  library: 'M16 6l4 14M12 6v14M8 8v12M4 4v16',
  webhook: 'M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17a4 4 0 0 1 8 0M18 17a4 4 0 1 0-8 0M14 11.01l-2.99-5.16a4 4 0 1 0-2.01.96',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z|M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  sliders: 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
  audio: 'M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3',
  type: 'M4 7V4h16v3|M9 20h6|M12 4v16',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  filetext: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z|M14 2v4a2 2 0 0 0 2 2h4|M10 9H8|M16 13H8|M16 17H8',
  play: 'M6 3v18l15-9z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  stop: 'M5 5h14v14H5z',
  star: 'M11.5 2.6a.6.6 0 0 1 1 0l2.4 5 5.4.8a.6.6 0 0 1 .3 1l-3.9 3.8.9 5.4a.6.6 0 0 1-.85.63L12 17.3l-4.8 2.5a.6.6 0 0 1-.86-.63l.9-5.4-3.9-3.8a.6.6 0 0 1 .33-1l5.4-.8z',
  search: 'M11 11m-8 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0|M21 21l-4.3-4.3',
  plus: 'M5 12h14M12 5v14',
  x: 'M18 6 6 18M6 6l12 12',
  chevdown: 'M6 9l6 6 6-6',
  chevup: 'M18 15l-6-6-6 6',
  chevright: 'M9 18l6-6-6-6',
  chevleft: 'M15 18l-6-6 6-6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z|M17 21v-8H7v8|M7 3v5h8',
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  check: 'M20 6 9 17l-5-5',
  warn: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z|M12 9v4|M12 17h.01',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z|M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3|M12 17h.01',
  sparkles: 'M9.94 14.66A2 2 0 0 0 8.5 13.2l-5.2-1.34a.5.5 0 0 1 0-.96L8.5 9.56A2 2 0 0 0 9.94 8.1l1.34-5.2a.5.5 0 0 1 .96 0l1.34 5.2A2 2 0 0 0 15.02 9.56l5.2 1.34a.5.5 0 0 1 0 .96l-5.2 1.34a2 2 0 0 0-1.44 1.46l-1.34 5.2a.5.5 0 0 1-.96 0z|M20 3v4|M22 5h-4',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2|M12 11m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  refresh: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16|M8 16H3v5',
  trash: 'M3 6h18|M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  copy: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2|M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z|M12 2v2|M12 20v2|M4.9 4.9l1.4 1.4|M17.7 17.7l1.4 1.4|M2 12h2|M20 12h2|M4.9 19.1l1.4-1.4|M17.7 6.3l1.4-1.4',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
  radio: 'M4.9 16.1a8 8 0 0 1 0-8.2|M7.8 13.2a4 4 0 0 1 0-2.4|M16.2 13.2a4 4 0 0 0 0-2.4|M19.1 16.1a8 8 0 0 0 0-8.2|M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  film: 'M3 3h18v18H3z|M7 3v18|M17 3v18|M3 8h4|M3 16h4|M17 8h4|M17 16h4|M7 12h10',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z|M14 2v6h6',
  volume: 'M11 5 6 9H2v6h4l5 4V5Z|M15.5 8.5a5 5 0 0 1 0 7|M19 5a9 9 0 0 1 0 14',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z|M12 16v-4|M12 8h.01',
  cpu: 'M6 6h12v12H6z|M9 9h6v6H9z|M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  rotate: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8|M3 3v5h5',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z|M12 6v6l4 2',
  wave2: 'M2 12h2l2-7 4 18 4-13 2 6h6',
  list: 'M8 6h13M8 12h13M8 18h13|M3 6h.01M3 12h.01M3 18h.01',
  discord: 'M18 8a16 16 0 0 0-4-1l-.3.6a12 12 0 0 1 3.5 1.2 13 13 0 0 0-10.4 0A12 12 0 0 1 10.3 7.6L10 7a16 16 0 0 0-4 1C3.5 12 3 15.5 3.2 19a14 14 0 0 0 4.3 2l.9-1.5a9 9 0 0 1-1.5-.7l.4-.3a10 10 0 0 0 9.4 0l.4.3a9 9 0 0 1-1.5.7l.9 1.5a14 14 0 0 0 4.3-2c.3-4-.4-7.5-2.9-11Z|M9 14m-1 0a1 1.2 0 1 0 2 0 1 1.2 0 1 0-2 0|M15 14m-1 0a1 1.2 0 1 0 2 0 1 1.2 0 1 0-2 0',
  youtube: 'M22 8.6a3 3 0 0 0-2-2C18 6 12 6 12 6s-6 0-8 .6a3 3 0 0 0-2 2A31 31 0 0 0 1.5 12 31 31 0 0 0 2 15.4a3 3 0 0 0 2 2C6 18 12 18 12 18s6 0 8-.6a3 3 0 0 0 2-2 31 31 0 0 0 .5-3.4 31 31 0 0 0-.5-3.4Z|M10 15l5-3-5-3z',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  layers: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z|M2 12.32l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9|M2 16.61l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  table: 'M3 3h18v18H3z|M3 9h18|M3 15h18|M9 3v18|M15 3v18',
  loader: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8',
  bolt: 'M14 3v5h5M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z',
  login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4|M10 17l5-5-5-5|M15 12H3',
  card: 'M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z|M2 10h20',
}

export function Icon({ name, size = 18, className = '', style, fill = false, stroke = 1.75 }:
  { name: string; size?: number; className?: string; style?: React.CSSProperties; fill?: boolean; stroke?: number }) {
  const d = ICONS[name]
  if (!d) return null
  const paths = d.split('|')
  return (
    <svg className={'ico ' + className} width={size} height={size} viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  )
}

/* ---------------- App context (theme + lang) ---------------- */
export const AppCtx = createContext<{ lang: Lang; theme: string }>({ lang: 'vi', theme: 'dark' })
export function useApp() { return useContext(AppCtx) }

/* ---------------- Button ---------------- */
export function Btn({ icon, children, variant, size, block, onClick, disabled, iconRight, title }: any) {
  return (
    <button className={['btn', variant, size, block ? 'block' : ''].filter(Boolean).join(' ')}
      onClick={onClick} disabled={disabled} title={title}>
      {icon && !iconRight && <Icon name={icon} size={size === 'sm' ? 15 : 16} />}
      {children}
      {icon && iconRight && <Icon name={icon} size={size === 'sm' ? 15 : 16} />}
    </button>
  )
}

/* ---------------- Select ---------------- */
export function Select({ value, options, onChange, placeholder, renderValue, renderOption, width, disabled }: any) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const sel = options.find((o: any) => o.value === value)
  return (
    <div className="select" ref={ref} style={width ? { width } : undefined}>
      <button className={'select-trigger' + (open ? ' open' : '')} disabled={disabled}
        style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
        onClick={() => { if (!disabled) setOpen(o => !o) }}>
        <span className="sv">{sel ? (renderValue ? renderValue(sel) : sel.label) : <span className="faint">{placeholder}</span>}</span>
        <Icon name="chevdown" size={16} className="chev" />
      </button>
      {open && (
        <div className="select-menu">
          {options.map((o: any) => (
            <div key={o.value} className={'opt' + (o.value === value ? ' sel' : '')}
              onClick={() => { onChange(o.value); setOpen(false) }}>
              {renderOption ? renderOption(o) : <span>{o.label}</span>}
              {o.value === value && <Icon name="check" size={15} className="check" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Slider ---------------- */
export function Slider({ label, value, min, max, step = 1, onChange, format, defaultValue }: any) {
  const ref = useRef<HTMLDivElement>(null)
  const pct = ((value - min) / (max - min)) * 100
  const setFromX = useCallback((clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    let p = (clientX - r.left) / r.width; p = Math.max(0, Math.min(1, p))
    let v = min + p * (max - min)
    v = Math.round(v / step) * step
    v = Math.max(min, Math.min(max, v))
    onChange(parseFloat(v.toFixed(4)))
  }, [min, max, step, onChange])
  const onDown = (e: React.MouseEvent) => {
    setFromX(e.clientX)
    const move = (ev: MouseEvent) => setFromX(ev.clientX)
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  return (
    <div className="slider-row">
      {label && <span className="sl-label">{label}</span>}
      <div className="slider" ref={ref} onMouseDown={onDown}>
        <div className="track" /><div className="fill" style={{ width: pct + '%' }} />
        <div className="knob" style={{ left: pct + '%' }} />
      </div>
      <span className="sl-val">{format ? format(value) : value}</span>
      {defaultValue !== undefined && (
        <span className="sl-reset" title="Reset" onClick={() => onChange(defaultValue)}><Icon name="rotate" size={14} /></span>
      )}
    </div>
  )
}

/* ---------------- Toggle ---------------- */
export function Toggle({ on, onChange, children }: any) {
  return (
    <button className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} type="button">
      <span className="sw" />{children && <span>{children}</span>}
    </button>
  )
}

/* ---------------- Segmented control ---------------- */
export function Segmented({ value, options, onChange }: any) {
  return (
    <div className="segcontrol">
      {options.map((o: any) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={15} />}{o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Collapsible panel ---------------- */
/* Accordion: wrap a group of <Panel>s in <AccordionProvider> and only one stays
   open at a time. Panels marked `independent` opt out and keep local state. */
const AccordionCtx = createContext<{ openId: string | null; toggle: (id: string) => void } | null>(null)
export function AccordionProvider({ children, initial = null }: { children: React.ReactNode; initial?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initial)
  const toggle = useCallback((id: string) => setOpenId(cur => cur === id ? null : id), [])
  return <AccordionCtx.Provider value={{ openId, toggle }}>{children}</AccordionCtx.Provider>
}

export function Panel({ title, icon, defaultOpen = true, children, tight, right, id, independent }: any) {
  const acc = useContext(AccordionCtx)
  const useAcc = acc && !independent
  const pid = id || title
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const open = useAcc ? acc!.openId === pid : localOpen
  const onHead = () => useAcc ? acc!.toggle(pid) : setLocalOpen(o => !o)
  return (
    <div className="panel">
      <div className={'panel-head' + (open ? ' open' : '')} onClick={onHead}>
        <span className="pt">{icon && <Icon name={icon} size={15} />}{title}</span>
        {right}
        <Icon name="chevdown" size={16} className="pchev" />
      </div>
      {open && <div className={'panel-body' + (tight ? ' tight' : '')}>{children}</div>}
    </div>
  )
}

/* ---------------- Toast system ---------------- */
type Toast = { id: string; kind?: string; title: string; desc?: string; duration?: number }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export function useToast() { return useContext(ToastCtx) }
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(ts => [...ts, { id, ...toast }])
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), toast.duration || 3400)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map(tt => (
          <div key={tt.id} className={'toast ' + (tt.kind || 'info')}>
            <span className="ti"><Icon name={tt.kind === 'good' ? 'check' : tt.kind === 'err' ? 'warn' : 'info'} size={18} /></span>
            <div className="tx"><div className="tt">{tt.title}</div>{tt.desc && <div className="td">{tt.desc}</div>}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ children, onClose, className }: any) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose && onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}>
      <div className={'modal ' + (className || '')} onMouseDown={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

/* ---------------- Waveform + real audio player ---------------- */
export function MiniWave({ active = false, bars = 48 }: { active?: boolean; bars?: number }) {
  const heights = useRef(Array.from({ length: bars }, () => 20 + Math.random() * 80))
  return (
    <div className="waveform">
      {heights.current.map((h, i) => (
        <i key={i} className={active && i < bars * 0.55 ? 'on' : ''} style={{ height: h + '%' }} />
      ))}
    </div>
  )
}

function fmtSec(s: number) {
  if (!isFinite(s) || s < 0) s = 0
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** Real audio player driven by an <audio> element and a blob/URL src. */
export function AudioPlayer({ src }: { src?: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const hasAudio = !!src

  useEffect(() => {
    setPlaying(false); setPos(0); setDur(0)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
  }, [src])

  const toggle = () => {
    const a = audioRef.current
    if (!a || !hasAudio) return
    if (a.paused) { a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
  }
  return (
    <div className={'player' + (hasAudio ? '' : ' is-empty')}>
      <audio ref={audioRef} src={src || undefined}
        onTimeUpdate={e => setPos((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={e => setDur((e.target as HTMLAudioElement).duration)}
        onEnded={() => { setPlaying(false); setPos(0) }} />
      <button className="pp" onClick={toggle} disabled={!hasAudio} aria-label={playing ? 'Pause' : 'Play'}>
        <Icon name={playing ? 'pause' : 'play'} size={18} fill={!playing} />
      </button>
      <span className="ptime">{fmtSec(pos)}</span>
      {hasAudio ? <MiniWave active={playing} /> : <div className="pbar"><i style={{ width: '0%' }} /></div>}
      <span className="ptime">{hasAudio ? fmtSec(dur) : '00:00'}</span>
    </div>
  )
}
