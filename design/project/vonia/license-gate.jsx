/* ============================================================
   VONIA — License Gate
   Hard gate overlay rendered when license is expired.
   No dismiss — user must renew (opens ZaloCRM portal) or log out.
   Props:
     onRenew(url)  — called when user clicks Renew (before opening tab)
     onLogout()    — called when user clicks Log out
     expiresAt     — ISO date string of when license expired (optional)
     plan          — plan label, e.g. "Hàng tháng" (optional)
   ============================================================ */

function LicenseGate({ onRenew, onLogout, expiresAt, plan }) {
  const portalUrl = 'https://zalocrm.org/portal/license';

  const handleRenew = () => {
    if (onRenew) onRenew(portalUrl);
    window.open(portalUrl, '_blank', 'noopener');
  };

  const expiredDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : null;

  return (
    <div className="scrim lgate-scrim">
      <div className="modal lgate" onMouseDown={e => e.stopPropagation()}>

        {/* ── Hero ─────────────────────────────────────── */}
        <div className="lgate-hero">
          <span className="ob-mark">
            <Icon name="audio" size={30} style={{ color: 'var(--accent-ink)' }} />
          </span>
          <span className="badge bad lgate-expiry-badge">
            <Icon name="warn" size={12} />
            Đã hết hạn
          </span>
        </div>

        {/* ── Body ─────────────────────────────────────── */}
        <div className="lgate-body">

          <div className="lgate-title">Phiên bản của bạn đã hết hạn</div>

          <div className="lgate-sub">
            {expiredDate ? (
              <>
                License{plan ? <> <span className="lgate-plan">{plan}</span></> : null} hết hạn ngày {expiredDate}.
                {' '}Gia hạn để tiếp tục dùng Vonia Studio Voice.
              </>
            ) : (
              'Gia hạn để tiếp tục sử dụng Vonia Studio Voice.'
            )}
          </div>

          {/* What is preserved */}
          <div className="lgate-features">
            <div className="lgate-feat">
              <span className="lgate-feat-ico lgate-feat-ico--good">
                <Icon name="check" size={14} />
              </span>
              <span>Giọng đã clone sẽ được giữ lại</span>
            </div>
            <div className="lgate-feat">
              <span className="lgate-feat-ico lgate-feat-ico--good">
                <Icon name="check" size={14} />
              </span>
              <span>Lịch sử audio vẫn còn đầy đủ</span>
            </div>
            <div className="lgate-feat">
              <span className="lgate-feat-ico lgate-feat-ico--accent">
                <Icon name="zap" size={14} />
              </span>
              <span>Kích hoạt ngay sau khi thanh toán</span>
            </div>
          </div>

          {/* Price hint */}
          <div className="lgate-price-hint">
            Gói hàng tháng từ <strong>299,000đ</strong> · Thanh toán qua VNPay
          </div>

          {/* CTAs */}
          <div className="lgate-actions">
            <Btn variant="primary" block icon="chevright" iconRight onClick={handleRenew}>
              Gia hạn tại ZaloCRM
            </Btn>
            <Btn variant="ghost" block onClick={onLogout}>
              Đăng xuất
            </Btn>
          </div>

        </div>
      </div>
    </div>
  );
}

window.LicenseGate = LicenseGate;
