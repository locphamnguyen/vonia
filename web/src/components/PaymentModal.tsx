/* Payment modal "Thanh toán - VOICE" — 3 methods:
   · Bank transfer (VietQR): the real SePay flow — createQr + poll until the
     webhook flips the order to paid (auto-activates). Falls back to a static
     display if SePay isn't configured.
   · International card (PayPal): manual checkout (no backend yet).
   · USDT / Binance: manual crypto transfer + Telegram contact.
   Ported from the design's payment-modal.jsx. */
import React, { useEffect, useState } from 'react'
import { Icon, Btn, Select, Modal, useToast } from './ui'
import { t, type Lang } from '../lib/i18n'
import * as api from '../lib/api'

/* Deterministic QR-like graphic — decorative placeholder shown only when SePay
   is unconfigured (so the bank tab never looks empty). Not a real code. */
function FakeQR({ size = 320 }: { size?: number }) {
  const N = 29
  const cell = size / N
  const isFinder = (r: number, c: number) => {
    const box = (br: number, bc: number) => r >= br && r < br + 7 && c >= bc && c < bc + 7
    return box(0, 0) || box(0, N - 7) || box(N - 7, 0)
  }
  const on = (r: number, c: number) => {
    const x = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453
    return (x - Math.floor(x)) > 0.52
  }
  const dark = '#0b0e16'
  const rects: React.ReactNode[] = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (isFinder(r, c)) continue
    if (r >= 11 && r <= 17 && c >= 11 && c <= 17) continue   // logo pad
    if (on(r, c)) rects.push(<rect key={r + '_' + c} x={(c * cell).toFixed(2)} y={(r * cell).toFixed(2)} width={cell + 0.4} height={cell + 0.4} fill={dark} />)
  }
  const finder = (br: number, bc: number, k: string) => (
    <g key={k}>
      <rect x={bc * cell} y={br * cell} width={7 * cell} height={7 * cell} rx={cell} fill={dark} />
      <rect x={(bc + 1) * cell} y={(br + 1) * cell} width={5 * cell} height={5 * cell} rx={cell * 0.7} fill="#fff" />
      <rect x={(bc + 2) * cell} y={(br + 2) * cell} width={3 * cell} height={3 * cell} rx={cell * 0.5} fill={dark} />
    </g>
  )
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: 'block', background: '#fff', borderRadius: 10 }}>
      {rects}
      {finder(0, 0, 'a')}{finder(0, N - 7, 'b')}{finder(N - 7, 0, 'c')}
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <rect x={-cell * 3.4} y={-cell * 3.4} width={cell * 6.8} height={cell * 6.8} rx={cell * 1.4} fill="#fff" />
        <path d={`M${-cell * 2.4} ${-cell * 2.1} L0 ${cell * 2.6} L${cell * 2.4} ${-cell * 2.1} L${cell * 1.1} ${-cell * 2.1} L0 ${cell * 0.3} L${-cell * 1.1} ${-cell * 2.1} Z`} fill="#e0322f" />
      </g>
    </svg>
  )
}

/* Static USD pricing for the manual (card / crypto) tabs, keyed by SePay plan id.
   Bank-transfer amounts come live from SePay; these are reference prices only. */
const USD: Record<string, { usd: string; days: string }> = {
  studio_monthly: { usd: '$5', days: '30' },
  studio_6month: { usd: '$25', days: '180' },
  studio_yearly: { usd: '$50', days: '365' },
}
const planVi = (lang: Lang, id: string) =>
  t(lang, id === 'studio_yearly' ? 'plan_1y' : id === 'studio_6month' ? 'plan_6m' : 'plan_1m')
const fmtVnd = (n: number) => n.toLocaleString('en-US') + ' VND'

function CopyRow({ label, value, lang }: { label?: string; value: string; lang: Lang }) {
  const toast = useToast()
  const copy = () => {
    navigator.clipboard?.writeText(value).catch(() => {})
    toast({ kind: 'good', title: t(lang, 'copied'), desc: value })
  }
  return (
    <div className="pay-copyrow">
      {label && <span className="pay-copylabel">{label}</span>}
      <span className="pay-copyval mono">{value}</span>
      <button className="btn sm subtle" onClick={copy}><Icon name="copy" size={13} />Copy</button>
    </div>
  )
}

function BankTab({ lang, plans, cfg, onPaid }:
  { lang: Lang; plans: api.Plan[]; cfg: api.PaymentConfig | null; onPaid: () => void }) {
  const toast = useToast()
  const [plan, setPlan] = useState('')
  const [qr, setQr] = useState<api.QrInfo | null>(null)
  const live = !!cfg?.qr_enabled

  // Default to the first available plan once plans load.
  useEffect(() => { if (!plan && plans.length) setPlan(plans[0].id) }, [plans])  // eslint-disable-line

  // When SePay is live, (re)create the QR whenever the chosen plan changes.
  useEffect(() => {
    if (!live || !plan) return
    let alive = true
    setQr(null)
    api.createQr(plan).then(info => { if (alive) setQr(info) })
      .catch(e => { if (alive) toast({ kind: 'err', title: t(lang, 'checkout_failed') + (e?.message ? ': ' + e.message : '') }) })
    return () => { alive = false }
  }, [plan, live])  // eslint-disable-line

  // Poll the order until the webhook confirms payment, then activate.
  useEffect(() => {
    if (!qr) return
    let alive = true, timer: any
    const tick = async () => {
      try {
        const o = await api.getOrder(qr.invoice_number)
        if (!alive) return
        if (o.status === 'paid') { toast({ kind: 'good', title: t(lang, 'payment_success') }); onPaid(); return }
      } catch { /* keep polling */ }
      if (alive) timer = setTimeout(tick, 3000)
    }
    timer = setTimeout(tick, 3000)
    return () => { alive = false; clearTimeout(timer) }
  }, [qr])  // eslint-disable-line

  const cur = plans.find(p => p.id === plan)
  const planLabel = planVi(lang, plan || 'studio_monthly')
  const amount = qr ? fmtVnd(qr.amount) : (cur ? fmtVnd(cur.amount) : '100,000 VND')
  const opts = (plans.length ? plans : [{ id: 'studio_monthly', amount: 100000 } as api.Plan])
    .map(p => ({ value: p.id, label: `${planVi(lang, p.id)} - ${fmtVnd(p.amount)}` }))

  return (
    <div className="pay-grid">
      <div className="stack gap16">
        <div className="row gap10" style={{ alignItems: 'center' }}>
          <span className="field-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>{t(lang, 'pay_choose_duration')}</span>
          <Select width={230} value={plan} onChange={setPlan} options={opts} />
        </div>
        <div className="card pay-detail">
          <div className="pay-line"><span>{t(lang, 'qr_bank')}:</span><strong>{qr?.bank_name || qr?.bank_code || 'VPBank'}</strong></div>
          <div className="pay-line"><span>{t(lang, 'qr_account')}:</span><strong>{qr?.bank_account || '209841867'}</strong></div>
          <div className="pay-line"><span>{t(lang, 'pay_plan')}:</span><strong>VOICE ({planLabel})</strong></div>
          <div className="pay-line"><span>{t(lang, 'qr_amount')}:</span><strong>{amount}</strong></div>
          <div className="pay-line"><span>{t(lang, 'qr_content')}:</span><strong style={{ color: 'var(--bad)' }}>{qr?.content || 'GLABS 494130 VOICE'}</strong></div>
        </div>
        <div className="hint" style={{ lineHeight: 1.7 }}>
          {t(lang, 'pay_auto_note')}<br />{t(lang, 'pay_vn_only')}
        </div>
        {live && (
          <div className="row gap10">
            <span className="status-pill"><Icon name="loader" size={14} style={{ animation: 'spin .9s linear infinite' }} />{t(lang, 'qr_waiting')}</span>
          </div>
        )}
      </div>
      <div className="pay-qr">
        {qr ? <img src={qr.qr_url} alt="VietQR" style={{ display: 'block', width: '100%', borderRadius: 10 }} /> : <FakeQR />}
      </div>
    </div>
  )
}

function CardTab({ lang, plans }: { lang: Lang; plans: api.Plan[] }) {
  const toast = useToast()
  const list = plans.length ? plans : Object.keys(USD).map(id => ({ id } as api.Plan))
  return (
    <div className="stack gap14">
      <div className="banner warn"><Icon name="card" size={16} className="bico" /><span>{t(lang, 'pay_card_banner')}</span></div>
      <div className="stack gap10">
        {list.map(p => {
          const u = USD[p.id] || USD.studio_monthly
          return (
            <button key={p.id} className="pay-paypal" onClick={() => toast({ kind: 'info', title: t(lang, 'pay_opening_paypal') })}>
              <span className="pp-title"><Icon name="audio" size={16} />Voice Studio</span>
              <span className="pp-sub">{u.usd} / {u.days} {t(lang, 'pay_days')}</span>
            </button>
          )
        })}
      </div>
      <div className="card" style={{ padding: '14px 16px' }}>
        <ol className="pay-steps">
          <li>{t(lang, 'pay_card_step1')}</li>
          <li>{t(lang, 'pay_card_step2')}</li>
          <li>{t(lang, 'pay_card_step3')}</li>
        </ol>
      </div>
    </div>
  )
}

const USDT_ADDR: [string, string][] = [
  ['TON:', 'UQDLDqND4CDalAt7du-d3E8_eqE9d4QjlOH4iZR8ZQVkGhbU'],
  ['TRON:', 'TBUDFxZB1F5hvZ7TD9mhSb5YNRSMPGHJzr'],
  ['BSC:', '0x10746732AFd5FD4D771dF5e1910ac480E84c6085'],
  ['ERC20:', '0x10746732AFd5FD4D771dF5e1910ac480E84c6085'],
  ['SOLANA:', 'EJPnZXEWNaMcGeC4VGYwymAmi8xNgDtWTSjtRDZANWUE'],
]

function CryptoTab({ lang, plans }: { lang: Lang; plans: api.Plan[] }) {
  const list = plans.length ? plans : Object.keys(USD).map(id => ({ id } as api.Plan))
  return (
    <div className="stack gap12">
      <div className="card pay-guide">
        <div style={{ fontWeight: 700, marginBottom: 8 }}><Icon name="filetext" size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />{t(lang, 'pay_manual_title')}</div>
        <div className="hint" style={{ lineHeight: 1.8 }}>
          {t(lang, 'pay_manual_intro')}<br />
          <strong>{t(lang, 'pay_step')} 1:</strong> {t(lang, 'pay_manual_step1')}<br />
          <strong>{t(lang, 'pay_step')} 2:</strong> {t(lang, 'pay_contact_tg_a')}<span style={{ color: 'var(--accent)' }}>@duckmartians</span>{t(lang, 'pay_contact_tg_b')}<br />
          <strong>{t(lang, 'pay_step')} 3:</strong> {t(lang, 'pay_manual_step3')}<br />
          <em style={{ color: 'var(--warn)' }}>{t(lang, 'pay_manual_note')}</em>
        </div>
      </div>

      <div className="card pay-price">
        <div style={{ fontWeight: 700, marginBottom: 10 }}><Icon name="bolt" size={14} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--accent)' }} />{t(lang, 'pay_price_title')}</div>
        <div className="pay-pricerow">
          {list.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && <span className="pay-divider" />}
              <span>{planVi(lang, p.id)}: <strong>{(USD[p.id] || USD.studio_monthly).usd}</strong></span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}><Icon name="globe" size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />{t(lang, 'pay_your_email')}</div>
        <CopyRow label="Email:" value="locphamnguyen@gmail.com" lang={lang} />
      </div>

      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}><Icon name="bolt" size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--warn)' }} />USDT</div>
        <div className="stack gap8">
          {USDT_ADDR.map(([k, v]) => <CopyRow key={k} label={k} value={v} lang={lang} />)}
        </div>
      </div>

      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}><Icon name="layers" size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />{t(lang, 'pay_other_method')}</div>
        <CopyRow label="Binance ID:" value="873069972" lang={lang} />
      </div>
    </div>
  )
}

export function PaymentModal({ lang, onClose, onPaid }: { lang: Lang; onClose: () => void; onPaid?: () => void }) {
  const [tab, setTab] = useState('bank')
  const [plans, setPlans] = useState<api.Plan[]>([])
  const [cfg, setCfg] = useState<api.PaymentConfig | null>(null)
  useEffect(() => {
    api.getPlans().then(setPlans).catch(() => {})
    api.getPaymentConfig().then(setCfg).catch(() => {})
  }, [])

  const paid = () => { onPaid && onPaid(); onClose() }
  const tabs: [string, string][] = [
    ['bank', t(lang, 'pay_tab_bank')],
    ['card', t(lang, 'pay_tab_card')],
    ['crypto', t(lang, 'pay_tab_crypto')],
  ]
  return (
    <Modal onClose={onClose} className="modal-pay">
      <div className="modal-head">
        <span className="badge accent" style={{ padding: '6px 10px' }}><Icon name="card" size={15} /></span>
        <span className="mt">{t(lang, 'pay_title')}</span>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={17} /></button>
      </div>
      <div className="modal-tabs">
        {tabs.map(([id, label]) =>
          <button key={id} className={'modal-tab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>{label}</button>
        )}
      </div>
      <div className="modal-body">
        {tab === 'bank' && <BankTab lang={lang} plans={plans} cfg={cfg} onPaid={paid} />}
        {tab === 'card' && <CardTab lang={lang} plans={plans} />}
        {tab === 'crypto' && <CryptoTab lang={lang} plans={plans} />}
      </div>
    </Modal>
  )
}
