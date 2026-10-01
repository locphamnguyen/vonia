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
  const [keys, setKeys] = useState<api.ApiKeyRecord[]>([])
  const [keyName, setKeyName] = useState('')
  const [newKey, setNewKey] = useState('')
  const [busy, setBusy] = useState(false)
  const base = window.location.origin

  useEffect(() => {
    let live = true
    const ping = () => api.health().then(() => live && setOk(true)).catch(() => live && setOk(false))
    ping(); const iv = setInterval(ping, 5000)
    return () => { live = false; clearInterval(iv) }
  }, [])

  const presets = store.presets.filter(p => !vq || (p.name + ' ' + p.id).toLowerCase().includes(vq.toLowerCase()))
  const langs = WH_LANGS.filter(([n, c]) => !lq || (n + ' ' + c).toLowerCase().includes(lq.toLowerCase()))
  const copy = (text: string, label: string) => { try { navigator.clipboard?.writeText(text) } catch { /* */ } toast({ kind: 'good', title: label }) }
  const fail = (e: any) => toast({ kind: 'err', title: e?.message || String(e) })

  useEffect(() => { api.listApiKeys().then(setKeys).catch(fail) }, [])

  const createKey = async () => {
    setBusy(true)
    try {
      const { key, record } = await api.createApiKey(keyName)
      setNewKey(key); setKeyName(''); setKeys(ks => [record, ...ks])
      toast({ kind: 'good', title: t(lang, 'wh_key_created') })
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const revokeKey = async (k: api.ApiKeyRecord) => {
    if (!window.confirm(t(lang, 'wh_key_confirm_revoke').replace('{n}', k.name))) return
    try {
      await api.revokeApiKey(k.id)
      setKeys(ks => ks.filter(x => x.id !== k.id))
      toast({ kind: 'good', title: t(lang, 'wh_key_revoked') })
    } catch (e) { fail(e) }
  }
  const fmtTime = (ts: number) => ts ? new Date(ts * 1000).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') : t(lang, 'wh_key_never')
  const keyHeader = `-H "X-API-Key: ${newKey || '<API_KEY>'}"`

  const jsonBody = `{
  "text": "Xin chào. Đây là câu ví dụ.",
  "voice_id": "<tên-giọng-đã-đăng-ký>",
  "language": "Vietnamese",
  "response_format": "wav"
}`
  const curl = `# ${t(lang, 'wh_list_voices')}
curl ${base}/v1/voices ${keyHeader}

# ${t(lang, 'wh_list_presets')}
curl ${base}/v1/presets ${keyHeader}

# ${t(lang, 'wh_synth_rest')} -> out.wav
curl -X POST ${base}/tts \\
  ${keyHeader} \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello world","voice_id":"<id>","response_format":"wav"}' -o out.wav

# ${t(lang, 'wh_openai_compat')} -> out.mp3
curl -X POST ${base}/v1/audio/speech \\
  -H "Authorization: Bearer ${newKey || '<API_KEY>'}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"Vonia","input":"Hello","voice":"<id>","response_format":"mp3"}' -o out.mp3`

  return (
    <div className="stage" style={{ maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      <div>
        <div className="row gap10" style={{ marginBottom: 4 }}>
          <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9 }}><Icon name="webhook" size={16} style={{ color: 'var(--accent-ink)' }} /></span>
          <span className="st-title" style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>Webhook API</span>
          <span className="badge accent">Beta</span>
        </div>
        <div className="hint" style={{ fontSize: 13 }}>{t(lang, 'wh_intro')}</div>
      </div>

      {/* connection */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 16 }}><Icon name="zap" size={14} />{t(lang, 'wh_api_connection')}</div>
        <div className="row between wrap gap14">
          <div className="row wrap gap14" style={{ flex: 1, minWidth: 280 }}>
            <span className="row gap8" style={{ fontWeight: 600, fontSize: 13.5 }}>
              <span className={'server-dot ' + (ok ? 'on' : 'off')} />
              {ok == null ? t(lang, 'checking') : ok ? t(lang, 'connected') : t(lang, 'disconnected')}
            </span>
            <a href={base} target="_blank" rel="noreferrer" className="mono" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13 }}>{base}</a>
          </div>
          <Btn variant="subtle" icon="copy" onClick={() => copy(base, t(lang, 'base_url_copied'))}>{t(lang, 'copy_base_url')}</Btn>
        </div>
      </div>

      {/* api keys */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 16 }}><Icon name="key" size={14} />{t(lang, 'wh_keys_title')}</div>
        <div className="banner warn" style={{ marginBottom: 16 }}><Icon name="warn" size={16} className="bico" /><span>{t(lang, 'wh_no_key')}</span></div>
        <div className="input-with-btn" style={{ marginBottom: 14 }}>
          <input className="input" value={keyName} maxLength={60} placeholder={t(lang, 'wh_key_name_ph')}
            onChange={e => setKeyName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy) createKey() }} />
          <Btn variant="primary" icon="plus" onClick={createKey} disabled={busy}>{t(lang, 'wh_key_create')}</Btn>
        </div>
        {newKey && (
          <div className="stack gap10" style={{ marginBottom: 14 }}>
            <div className="input-with-btn">
              <input className="input mono" readOnly value={newKey} onFocus={e => e.target.select()} />
              <Btn variant="subtle" icon="copy" onClick={() => copy(newKey, t(lang, 'wh_key_copied'))}>{t(lang, 'wh_key_copy')}</Btn>
            </div>
            <div className="banner info"><Icon name="info" size={16} className="bico" /><span>{t(lang, 'wh_key_once')}</span></div>
          </div>
        )}
        {keys.length === 0 ? (
          <div className="hint">{t(lang, 'wh_keys_empty')}</div>
        ) : (
          <div className="wh-table-wrap">
            <table className="rtable">
              <thead><tr><th>{t(lang, 'col_name')}</th><th>Key</th><th>{t(lang, 'wh_key_col_created')}</th><th>{t(lang, 'wh_key_col_used')}</th><th style={{ width: 110 }} /></tr></thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td className="tcode">{k.hint}</td>
                    <td style={{ fontSize: 12.5 }}>{fmtTime(k.created_at)}</td>
                    <td style={{ fontSize: 12.5 }}>{fmtTime(k.last_used_at)}</td>
                    <td><Btn variant="danger" size="sm" icon="trash" onClick={() => revokeKey(k)}>{t(lang, 'wh_key_revoke')}</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint" style={{ marginTop: 8 }}>💡 {t(lang, 'wh_key_hint')}</div>
      </div>

      {/* guide */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 16 }}><Icon name="info" size={14} />{t(lang, 'how_to_use')}</div>
        <div className="stack gap14">
          <div>
            <div className="field-label">Body Request — POST /tts (JSON)</div>
            <CodeBlock onCopy={() => copy(jsonBody, t(lang, 'json_copied'))}>{jsonBody}</CodeBlock>
          </div>
          <div>
            <div className="field-label">{t(lang, 'curl_examples')}</div>
            <CodeBlock onCopy={() => copy(curl, t(lang, 'curl_copied'))}>{curl}</CodeBlock>
          </div>
        </div>
      </div>

      {/* voice store + languages */}
      <div className="wh-grid">
        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="mic" size={14} />{t(lang, 'wh_preset_voices')}</div>
          <div className="search" style={{ marginBottom: 10 }}><Icon name="search" size={15} /><input value={vq} onChange={e => setVq(e.target.value)} placeholder={t(lang, 'search_name_id')} /></div>
          <div className="wh-table-wrap">
            <table className="rtable">
              <thead><tr><th style={{ width: 130 }}>ID</th><th>{t(lang, 'col_name')}</th><th style={{ width: 60 }}>{t(lang, 'col_fav')}</th></tr></thead>
              <tbody>
                {presets.map(p => (
                  <tr key={p.id} className="copyrow" onDoubleClick={() => copy(p.id, t(lang, 'copied_prefix') + p.id)}>
                    <td className="tcode" style={{ color: 'var(--accent)' }}>{p.id}</td>
                    <td>{p.name} <span className="faint" style={{ fontSize: 11.5 }}>· {p.instruct}</span></td>
                    <td><span className={'star' + (starred.has(p.name) ? ' on' : '')} style={{ display: 'inline-flex' }} onClick={(e) => { e.stopPropagation(); onStar(p.name) }}><Icon name="star" size={15} fill={starred.has(p.name)} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>💡 {t(lang, 'wh_preset_hint')}</div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="badge accent" style={{ padding: '5px 11px', marginBottom: 12 }}><Icon name="globe" size={14} />{t(lang, 'languages')}</div>
          <div className="search" style={{ marginBottom: 10 }}><Icon name="search" size={15} /><input value={lq} onChange={e => setLq(e.target.value)} placeholder={t(lang, 'search_name_iso')} /></div>
          <div className="wh-table-wrap">
            <table className="rtable">
              <thead><tr><th>{t(lang, 'col_name_use')}</th><th style={{ width: 90 }}>{t(lang, 'col_iso')}</th></tr></thead>
              <tbody>
                {langs.map(([n, c]) => (
                  <tr key={c} className="copyrow" onDoubleClick={() => copy(n, t(lang, 'copied_prefix') + n)}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{n}</td>
                    <td className="tcode" style={{ color: 'var(--accent)' }}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>💡 {t(lang, 'wh_lang_hint')}</div>
        </div>
      </div>
    </div>
  )
}
