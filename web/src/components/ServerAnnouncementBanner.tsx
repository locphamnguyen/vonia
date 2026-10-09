import { useCallback, useEffect, useState } from 'react'
import { Icon } from './ui'
import { t, type Lang } from '../lib/i18n'
import { getAnnouncement, type ServerAnnouncement } from '../lib/api'

/**
 * Dải thông báo mỏng từ trang trung tâm Vonia (port từ ZaloCRM / VoiceStudio-VN):
 * có bản mới, tin cần biết. Backend cache lượt gọi-về (phone_home.py); trang trung
 * tâm trả null ⇒ dải ẩn.
 *
 * Vị trí: desktop — đầu cột `.main`, ngay dưới dải "máy chủ chưa kết nối", trên
 * thanh tab, nên hiện ở mọi tab và cả trang Webhook. Mobile — ngay dưới thanh
 * tiêu đề (`compact`).
 *
 * Mặc định KHÔNG có nút đóng (chủ dự án chốt): chỉ hiện ✕ khi trang trung tâm
 * gửi rõ dismissible=true. Nội dung 100% text thuần; link chỉ https.
 */

export const DISMISSED_KEY = 'vonia.announcement-dismissed-id'
export const POLL_INTERVAL_MS = 30 * 60 * 1000

function readDismissed(): string | null {
  try { return localStorage.getItem(DISMISSED_KEY) } catch { return null }
}

export function ServerAnnouncementBanner({ lang, compact }: { lang: Lang; compact?: boolean }) {
  const [a, setA] = useState<ServerAnnouncement | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(readDismissed)

  useEffect(() => {
    let alive = true
    const load = () => { getAnnouncement().then(x => { if (alive) setA(x) }) }
    load()
    const timer = window.setInterval(load, POLL_INTERVAL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  const dismiss = useCallback(() => {
    if (!a?.dismissible) return
    setDismissedId(a.id)
    try { localStorage.setItem(DISMISSED_KEY, a.id) } catch { /* vẫn ẩn trong phiên này */ }
  }, [a])

  if (!a) return null
  if (a.dismissible && dismissedId === a.id) return null
  const level = a.level === 'warning' || a.level === 'critical' ? a.level : 'info'

  return (
    <div className={`ann-banner ann-${level}${compact ? ' ann-compact' : ''}`} role="status" data-testid="server-announcement">
      <Icon name={level === 'info' ? 'info' : 'warn'} size={15} className="ico" />
      <span className="ann-text">{a.text}</span>
      {a.link && (
        <a className="ann-link" href={a.link} target="_blank" rel="noopener noreferrer">
          {a.linkLabel || t(lang, 'ann_details')}
        </a>
      )}
      {a.dismissible && (
        <button type="button" className="ann-close" onClick={dismiss}
          title={t(lang, 'ann_dismiss')} aria-label={t(lang, 'ann_dismiss')}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )
}
