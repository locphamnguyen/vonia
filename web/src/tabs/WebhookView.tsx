import React, { useEffect, useState } from 'react'
import { Icon, Btn, useToast } from '../components/ui'
import { useVoices } from '../app/store'
import { t, type Lang } from '../lib/i18n'
import * as api from '../lib/api'

const WH_LANGS: [string, string][] = [
  ['Vietnamese', 'vi'], ['English', 'en'], ['Chinese', 'zh'], ['Japanese', 'ja'], ['Korean', 'ko'],
  ['French', 'fr'], ['Spanish', 'es'], ['German', 'de'], ['Portuguese', 'pt'], ['Russian', 'ru'],
  ['Hindi', 'hi'], ['Arabic', 'ar'], ['Thai', 'th'], ['Indonesian', 'id'], ['Turkish', 'tr'], ['Italian', 'it'],
]

function CodeBlock({ children, onCopy }: any) {
  return (
    <div className="codeblock">
      <button className="code-copy" onClick={onCopy} title="Copy"><Icon name="copy" size={14} /></button>
      <pre>{children}</pre>
    </div>
  )
}

export function WebhookView({ lang, starred, onStar }: { lang: Lang; starred: Set<string>; onStar: (n: string) => void }) {
  const toast = useToast()
  const store = useVoices()
  const [vq, setVq] = useState('')
  const [lq, setLq] = useState('')
  const [ok, setOk] = useState<boolean | null>(null)
  const base = window.location.origin
  const en = lang === 'en'

  useEffect(() => {
    let live = true
    const ping = () => api.health().then(() => live && setOk(true)).catch(() => live && setOk(false))
    ping(); const iv = setInterval(ping, 5000)
    return () => { live = false; clearInterval(iv) }
  }, [])

  const presets = store.presets.filter(p => !vq || (p.name + ' ' + p.id).toLowerCase().includes(vq.toLowerCase()))
  const langs = WH_LANGS.filter(([n, c]) => !lq || (n + ' ' + c).toLowerCase().includes(lq.toLowerCase()))
  const copy = (text: string, label: string) => { try { navigator.clipboard?.writeText(text) } catch { /* */ } toast({ kind: 'good', title: label }) }

  const jsonBody = `{
  "text": "Xin chào. Đây là câu ví dụ.",
  "voice_id": "<tên-giọng-đã-đăng-ký>",
  "language": "Vietnamese",
  "response_format": "wav"
}`
  const curl = `# ${en ? 'List registered voices' : 'Liệt kê giọng đã đăng ký'}
curl ${base}/v1/voices

# ${en ? 'List preset voices' : 'Liệt kê giọng preset'}
curl ${base}/v1/presets

# ${en ? 'Synthesize (REST)' : 'Tổng hợp (REST)'} -> out.wav
curl -X POST ${base}/tts \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello world","voice_id":"<id>","response_format":"wav"}' -o out.wav

# ${en ? 'OpenAI-compatible' : 'Tương thích OpenAI'} -> out.mp3
curl -X POST ${base}/v1/audio/speech \\
  -H "Content-Type: application/json" \\
  -d '{"model":"k2-fsa/OmniVoice","input":"Hello","voice":"<id>","response_format":"mp3"}' -o out.mp3`

  return (
    <div className="stage" style={{ maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      <div>
        <div className="row gap10" style={{ marginBottom: 4 }}>
          <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9 }}><Icon name="webhook" size={16} style={{ color: 'var(--accent-ink)' }} /></span>
          <span className="st-title" style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>Webhook API</span>
          <span className="badge accent">Beta</span>
        </div>
        <div className="hint" style={{ fontSize: 13 }}>{en ? 'Let external tools (n8n, Zapier, scripts…) generate voices via this REST API.' : 'Cho phép công cụ ngoài (n8n, Zapier, script…) tạo giọng nói qua REST API này.'}</div>
      </div>

      {/* connection */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 16 }}><Icon name="zap" size={14} />{en ? 'API connection' : 'Kết nối API'}</div>
        <div className="row between wrap gap14">
          <div className="row wrap gap14" style={{ flex: 1, minWidth: 280 }}>
            <span className="row gap8" style={{ fontWeight: 600, fontSize: 13.5 }}>
              <span className={'server-dot ' + (ok ? 'on' : 'off')} />
              {ok == null ? (en ? 'Checking…' : 'Đang kiểm tra…') : ok ? (en ? 'Connected' : 'Đã kết nối') : (en ? 'Disconnected' : 'Mất kết nối')}
            </span>
            <a href={base} target="_blank" rel="noreferrer" className="mono" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }}>{base}</a>
          </div>
          <Btn variant="subtle" icon="copy" onClick={() => copy(base, en ? 'Base URL copied' : 'Đã sao chép base URL')}>{en ? 'Copy base URL' : 'Sao chép base URL'}</Btn>
        </div>
      </div>

      {/* guide */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 16 }}><Icon name="info" size={14} />{en ? 'How to use' : 'Hướng dẫn sử dụng'}</div>
        <div className="banner info" style={{ marginBottom: 16 }}><Icon name="info" size={16} className="bico" /><span>{en ? 'No API key required by default. The server processes one generation at a time on the GPU.' : 'Mặc định không cần API key. Server xử lý lần lượt một yêu cầu trên GPU.'}</span></div>
        <div className="stack gap14">
          <div>
            <div className="field-label">Body Request — POST /tts (JSON)</div>
            <CodeBlock onCopy={() => copy(jsonBody, en ? 'JSON copied' : 'Đã copy JSON')}>{jsonBody}</CodeBlock>
          </div>
          <div>
            <div className="field-label">{en ? 'cURL examples' : 'Ví dụ cURL'}</div>
            <CodeBlock onCopy={() => copy(curl, en ? 'cURL copied' : 'Đã copy cURL')}>{curl}</CodeBlock>
          </div>
        </div>
      </div>

      {/* voice store + languages */}
      <div className="wh-grid">
        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="mic" size={14} />{en ? 'Preset voices' : 'Giọng preset'}</div>
          <div className="search" style={{ marginBottom: 10 }}><Icon name="search" size={15} /><input value={vq} onChange={e => setVq(e.target.value)} placeholder={en ? 'Search by name or ID…' : 'Tìm theo tên hoặc ID…'} /></div>
          <div className="wh-table-wrap">
            <table className="rtable">
              <thead><tr><th style={{ width: 130 }}>ID</th><th>{en ? 'Name' : 'Tên'}</th><th style={{ width: 60 }}>{en ? 'Fav' : 'Sao'}</th></tr></thead>
              <tbody>
                {presets.map(p => (
                  <tr key={p.id} className="copyrow" onDoubleClick={() => copy(p.id, (en ? 'Copied ' : 'Đã copy ') + p.id)}>
                    <td className="tcode" style={{ color: 'var(--accent)' }}>{p.id}</td>
                    <td>{p.name} <span className="faint" style={{ fontSize: 11.5 }}>· {p.instruct}</span></td>
                    <td><span className={'star' + (starred.has(p.name) ? ' on' : '')} style={{ display: 'inline-flex' }} onClick={(e) => { e.stopPropagation(); onStar(p.name) }}><Icon name="star" size={15} fill={starred.has(p.name)} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>💡 {en ? 'Double-click a row to copy its preset id (use as a voice-design instruct).' : 'Nháy đúp một dòng để copy preset id.'}</div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="globe" size={14} />{en ? 'Languages' : 'Ngôn ngữ'}</div>
          <div className="search" style={{ marginBottom: 10 }}><Icon name="search" size={15} /><input value={lq} onChange={e => setLq(e.target.value)} placeholder={en ? 'Search name or ISO code…' : 'Tìm theo tên hoặc mã ISO…'} /></div>
          <div className="wh-table-wrap">
            <table className="rtable">
              <thead><tr><th>{en ? 'Name (use this value)' : 'Tên (dùng giá trị này)'}</th><th style={{ width: 90 }}>{en ? 'ISO' : 'Mã ISO'}</th></tr></thead>
              <tbody>
                {langs.map(([n, c]) => (
                  <tr key={c} className="copyrow" onDoubleClick={() => copy(n, (en ? 'Copied ' : 'Đã copy ') + n)}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{n}</td>
                    <td className="tcode" style={{ color: 'var(--accent)' }}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>💡 {en ? 'Double-click a name to copy — use it for the language field.' : 'Nháy đúp tên để copy — dùng cho field language.'}</div>
        </div>
      </div>
    </div>
  )
}
