import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon, Btn, Modal, useToast } from './ui'
import { t, type Lang } from '../lib/i18n'
import * as api from '../lib/api'

type Filter = 'pending' | 'active' | 'disabled' | 'all'

const fmtDate = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString('vi-VN') : '—')

/** Admin-only: approve new sign-ups, disable / delete accounts, grant admin. */
export function MembersModal({ lang, me, onClose, onChanged }:
  { lang: Lang; me: api.MeInfo; onClose: () => void; onChanged?: (pending: number) => void }) {
  const toast = useToast()
  const [users, setUsers] = useState<api.MemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('pending')

  const load = useCallback(() => {
    setLoading(true)
    api.listMembers()
      .then(r => {
        setUsers(r.users)
        onChanged?.(r.pending)
        // Nothing waiting? Open on the full list instead of an empty tab.
        setFilter(f => (f === 'pending' && r.pending === 0 ? 'all' : f))
      })
      .catch(e => toast({ kind: 'err', title: String(e.message || e) }))
      .finally(() => setLoading(false))
  }, [onChanged, toast])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    pending: users.filter(u => u.status === 'pending').length,
    active: users.filter(u => u.status === 'active').length,
    disabled: users.filter(u => u.status === 'disabled').length,
    all: users.length,
  }), [users])
  const shown = filter === 'all' ? users : users.filter(u => u.status === filter)

  const act = async (u: api.MemberRecord, action: api.MemberAction) => {
    if (action === 'delete' && !window.confirm(t(lang, 'members_confirm_delete').replace('{e}', u.email))) return
    setBusy(u.email + action)
    try {
      await api.memberAction(u.email, action)
      toast({ kind: 'good', title: t(lang, 'members_done') })
      load()
    } catch (e: any) {
      toast({ kind: 'err', title: String(e.message || e) })
    } finally {
      setBusy(null)
    }
  }

  const tabs: Filter[] = ['pending', 'active', 'disabled', 'all']

  return (
    <Modal onClose={onClose} className="modal-members">
      <div className="modal-head">
        <Icon name="users" size={18} />
        <div className="mt">{t(lang, 'members_title')}</div>
        <button className="icon-btn" onClick={load} title={t(lang, 'refresh')}><Icon name="refresh" size={16} /></button>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
      </div>
      <div className="modal-tabs">
        {tabs.map(f => (
          <button key={f} className={'modal-tab' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
            {t(lang, 'members_' + f)} <span className="members-count">{counts[f]}</span>
          </button>
        ))}
      </div>
      <div className="modal-body">
        <div className="banner info" style={{ marginBottom: 14 }}>
          <Icon name="info" size={16} className="bico" /><span>{t(lang, 'members_hint')}</span>
        </div>
        {loading && users.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: 'center' }}><Icon name="loader" size={16} /></div>
        ) : shown.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: 'center' }}>{t(lang, 'members_empty')}</div>
        ) : (
          <div className="members-list">
            {shown.map(u => {
              const self = u.email === me.email
              const b = (a: api.MemberAction) => busy === u.email + a
              return (
                <div key={u.email} className="member-row">
                  <div className="member-info">
                    <div className="member-name">
                      {u.full_name || u.email}
                      {u.is_admin && <span className="badge accent">{t(lang, 'members_admin')}</span>}
                      {self && <span className="badge muted">{t(lang, 'members_you')}</span>}
                    </div>
                    <div className="member-meta">
                      <span>{u.email}</span>
                      <span>· {u.providers.map(p => (p === 'google' ? 'Google' : 'Email')).join(' + ')}</span>
                      <span>· {t(lang, 'members_joined')} {fmtDate(u.created_at)}</span>
                      {!u.email_verified && <span className="badge warn"><Icon name="warn" size={11} />{t(lang, 'members_unverified')}</span>}
                    </div>
                  </div>
                  <div className="member-actions">
                    {u.status === 'pending' && <>
                      <Btn size="sm" variant="good" icon="check" disabled={!!busy} onClick={() => act(u, 'approve')}>{b('approve') ? '…' : t(lang, 'members_approve')}</Btn>
                      <Btn size="sm" variant="danger" icon="x" disabled={!!busy} onClick={() => act(u, 'delete')}>{t(lang, 'members_reject')}</Btn>
                    </>}
                    {u.status === 'disabled' && <>
                      <Btn size="sm" variant="subtle" icon="check" disabled={!!busy} onClick={() => act(u, 'approve')}>{t(lang, 'members_enable')}</Btn>
                      <Btn size="sm" variant="danger" icon="trash" disabled={!!busy} onClick={() => act(u, 'delete')}>{t(lang, 'members_delete')}</Btn>
                    </>}
                    {u.status === 'active' && !self && <>
                      {u.is_admin
                        ? <Btn size="sm" variant="subtle" disabled={!!busy} onClick={() => act(u, 'revoke_admin')}>{t(lang, 'members_revoke_admin')}</Btn>
                        : <Btn size="sm" variant="subtle" icon="user" disabled={!!busy} onClick={() => act(u, 'make_admin')}>{t(lang, 'members_make_admin')}</Btn>}
                      <Btn size="sm" variant="danger" disabled={!!busy} onClick={() => act(u, 'disable')}>{t(lang, 'members_disable')}</Btn>
                    </>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
