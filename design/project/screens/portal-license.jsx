/* ============================================================
   ZALOCRM — Customer Portal: License Page
   Standalone page at zalocrm.org/portal/license
   Depends on: ui.jsx (Icon, Btn, Panel — global scope)
   ============================================================ */

/* ── Demo data ─────────────────────────────────────────────── */

const DEMO_STATES = {
  active: {
    plan: 'Hàng tháng',
    status: 'active',
    expiresAt: '2026-07-09',
    daysLeft: 30,
  },
  warning: {
    plan: 'Hàng tháng',
    status: 'active',
    expiresAt: '2026-06-19',
    daysLeft: 10,
  },
  expired: {
    plan: 'Hàng tháng',
    status: 'expired',
    expiresAt: '2026-06-01',
    daysLeft: 0,
  },
  none: null,
};

const PAYMENTS = [
  { id: 'VNP2606090001', date: '09/06/2026', plan: 'Hàng tháng', amount: 299000, method: 'VNPay', status: 'success' },
  { id: 'VNP2605090002', date: '09/05/2026', plan: 'Hàng tháng', amount: 299000, method: 'VNPay', status: 'success' },
  { id: 'VNP2604090003', date: '09/04/2026', plan: 'Hàng tháng', amount: 299000, method: 'VNPay', status: 'success' },
  { id: 'VNP2603090004', date: '09/03/2026', plan: 'Hàng tháng', amount: 299000, method: 'VNPay', status: 'failed'  },
  { id: 'VNP2603090005', date: '09/03/2026', plan: 'Hàng tháng', amount: 299000, method: 'VNPay', status: 'success' },
];

function fmtVND(amount) {
  return amount.toLocaleString('vi-VN') + 'đ';
}

/* ── License Status Card ───────────────────────────────────── */

function LicenseCard({ license, onRenew }) {
  if (!license) {
    return (
      <div className="card portal-lcard">
        <div className="empty" style={{ minHeight: 200 }}>
          <div className="em-art">
            <Icon name="layers" size={32} />
          </div>
          <div className="em-title">Bạn chưa có license</div>
          <div className="em-sub">
            Liên hệ để mua license Vonia Studio Voice và bắt đầu sử dụng
          </div>
          <div className="em-steps">
            <span className="em-step">
              <span className="n">1</span>Liên hệ qua Zalo / Email
            </span>
            <span className="em-step">
              <span className="n">2</span>Thanh toán VNPay
            </span>
            <span className="em-step">
              <span className="n">3</span>Kích hoạt tức thì
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-faint)' }}>
            Email: <span style={{ color: 'var(--accent)' }}>locphamnguyen@gmail.com</span>
          </div>
        </div>
      </div>
    );
  }

  const isExpired = license.status === 'expired';
  const isWarning = !isExpired && license.daysLeft <= 14;

  const expiryDate = new Date(license.expiresAt).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const renewLabel = isExpired
    ? 'Mua lại — 299,000đ'
    : isWarning
    ? 'Gia hạn ngay — 299,000đ'
    : 'Gia hạn sớm — 299,000đ';

  return (
    <div className={[
      'card portal-lcard',
      isWarning  ? 'portal-lcard--warn'    : '',
      isExpired  ? 'portal-lcard--expired' : '',
    ].filter(Boolean).join(' ')}>

      {/* ── Card header ──────────────────────────────── */}
      <div className="portal-lcard-head">
        <div className="row gap10">
          <span className="portal-lcard-icon">
            <Icon name="audio" size={17} />
          </span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Vonia Studio Voice</span>
        </div>
        <span className={`badge portal-plan-pill ${license.plan === 'Hàng năm' ? 'accent' : 'muted'}`}>
          {license.plan === 'Hàng năm' ? 'YEARLY' : 'MONTHLY'}
        </span>
      </div>

      <div className="divider" style={{ margin: '14px 0' }} />

      {/* ── Details ──────────────────────────────────── */}
      <div className="portal-lcard-grid">

        <div className="portal-lcard-row">
          <span className="portal-lcard-label">Trạng thái</span>
          <div>
            {isExpired
              ? <span className="badge bad portal-status-badge"><Icon name="x" size={12} />Đã hết hạn</span>
              : isWarning
              ? <span className="badge warn portal-status-badge"><Icon name="warn" size={12} />Sắp hết hạn</span>
              : <span className="badge good portal-status-badge"><Icon name="check" size={12} />Đang hoạt động</span>
            }
          </div>
        </div>

        <div className="portal-lcard-row">
          <span className="portal-lcard-label">Gói dịch vụ</span>
          <span style={{ fontWeight: 600 }}>{license.plan}</span>
        </div>

        <div className="portal-lcard-row">
          <span className="portal-lcard-label">
            {isExpired ? 'Đã hết hạn ngày' : 'Hết hạn ngày'}
          </span>
          <div className="row gap10">
            <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{expiryDate}</span>
            {!isExpired && (
              <span className={`badge ${isWarning ? 'warn' : 'muted'}`}>
                còn {license.daysLeft} ngày
              </span>
            )}
          </div>
        </div>

        <div className="portal-lcard-row">
          <span className="portal-lcard-label">Sản phẩm</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>vonia.studio</span>
        </div>

      </div>

      <div className="divider" style={{ margin: '14px 0' }} />

      {/* ── Renewal CTA ──────────────────────────────── */}
      <div className="portal-lcard-cta">
        <button
          className={`btn primary block portal-renew-btn${isWarning ? ' portal-renew-btn--warn' : ''}`}
          onClick={onRenew}
        >
          <Icon name="refresh" size={15} />
          <span>{renewLabel}</span>
          <span className="portal-vnpay-tag">VNPay</span>
        </button>
        {isExpired ? (
          <div className="portal-expired-note">
            <Icon name="info" size={13} />
            Dữ liệu và giọng đã clone của bạn vẫn còn. Gia hạn để truy cập lại.
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center', marginTop: 8 }}>
            Thanh toán an toàn qua VNPay · Kích hoạt ngay sau khi thanh toán
          </div>
        )}
      </div>

    </div>
  );
}

/* ── Payment History ───────────────────────────────────────── */

function PaymentHistory({ payments }) {
  if (!payments || payments.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        Chưa có lịch sử thanh toán.
      </div>
    );
  }
  return (
    <div className="results-wrap">
      <div className="results-scroll">
        <table className="rtable">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Ngày</th>
              <th>Gói</th>
              <th style={{ width: 130 }}>Số tiền</th>
              <th style={{ width: 90 }}>TT toán</th>
              <th>Mã giao dịch</th>
              <th style={{ width: 120 }}>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-soft)' }}>{p.date}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 500 }}>{p.plan}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtVND(p.amount)}
                  </span>
                </td>
                <td>
                  <span className="badge muted portal-method-badge">
                    <Icon name="zap" size={11} />{p.method}
                  </span>
                </td>
                <td>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.id}</span>
                </td>
                <td>
                  {p.status === 'success'
                    ? <span className="badge good"><Icon name="check" size={12} />Thành công</span>
                    : <span className="badge bad"><Icon name="x" size={12} />Thất bại</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Portal App (root) ─────────────────────────────────────── */

function PortalApp() {
  const [theme, setTheme]           = useState(() => localStorage.getItem('vonia.theme') || 'dark');
  const [demoState, setDemoState]   = useState('warning');
  const [userMenuOpen, setUserOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('vonia.theme', theme);
  }, [theme]);

  useEffect(() => {
    const close = () => setUserOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const license = DEMO_STATES[demoState];

  const handleRenew = () => {
    // In production: redirect to VNPay payment URL
    alert('Demo: Sẽ chuyển đến trang thanh toán VNPay');
  };

  return (
    <div className="portal-root">

      {/* ── Top Nav ──────────────────────────────────── */}
      <header className="portal-nav">
        <div className="portal-nav-inner">

          {/* Brand */}
          <div className="row gap10">
            <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 8 }}>
              <Icon name="audio" size={16} style={{ color: 'var(--accent-ink)' }} />
            </span>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>
              ZaloCRM<span style={{ color: 'var(--accent)' }}>.</span>
            </span>
          </div>

          <div className="row gap10">
            {/* Demo state switcher — prototype only */}
            <div className="seg portal-demo-seg" title="Demo: thay đổi trạng thái license">
              {['active', 'warning', 'expired', 'none'].map(s => (
                <button key={s} className={demoState === s ? 'on' : ''} onClick={() => setDemoState(s)}>
                  {s}
                </button>
              ))}
            </div>

            {/* Theme toggle */}
            <div className="seg icon">
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} title="Dark">
                <Icon name="moon" size={14} />
              </button>
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} title="Light">
                <Icon name="sun" size={14} />
              </button>
            </div>

            {/* User menu */}
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button className="portal-user-btn" onClick={() => setUserOpen(o => !o)}>
                <span className="portal-user-av">ĐN</span>
                <span className="portal-user-email">anh.daiman@ctyled.vn</span>
                <Icon name="chevdown" size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              </button>
              {userMenuOpen && (
                <div className="select-menu" style={{ right: 0, left: 'auto', minWidth: 180, top: 'calc(100% + 6px)' }}>
                  <div className="opt"><Icon name="user" size={14} />Tài khoản</div>
                  <div className="opt"><Icon name="layers" size={14} />License của tôi</div>
                  <div className="divider" />
                  <div className="opt" style={{ color: 'var(--bad)' }}><Icon name="x" size={14} />Đăng xuất</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────── */}
      <main className="portal-main">
        <div className="portal-content">

          {/* Breadcrumb */}
          <nav className="portal-breadcrumb">
            <span className="portal-bc-link">Trang chủ</span>
            <Icon name="chevright" size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <span>License của tôi</span>
          </nav>

          {/* Page title */}
          <h1 className="portal-page-title">License của tôi</h1>

          {/* License card */}
          <LicenseCard license={license} onRenew={handleRenew} />

          {/* Payment history */}
          <div style={{ marginTop: 32 }}>
            <div className="row between" style={{ marginBottom: 12, alignItems: 'center' }}>
              <span className="section-title">LỊCH SỬ THANH TOÁN</span>
              {license && (
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  {PAYMENTS.filter(p => p.status === 'success').length} giao dịch thành công
                </span>
              )}
            </div>
            <PaymentHistory payments={license ? PAYMENTS : []} />
          </div>

          {/* Footer note */}
          <div className="portal-footer-note">
            Cần hỗ trợ? Liên hệ{' '}
            <span style={{ color: 'var(--accent)' }}>locphamnguyen@gmail.com</span>
            {' '}· Vonia Studio Voice v1.0
          </div>

        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PortalApp />);
