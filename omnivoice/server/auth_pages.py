"""Trang đăng nhập / đăng ký / chờ duyệt mang thương hiệu Vonia (HTML máy chủ dựng).

Các trang này hiện ra TRƯỚC khi có phiên, nên không nằm trong bundle React
(bundle chỉ phục vụ người đã đăng nhập). Cùng một "vỏ" (logo + card + CSS) cho
mọi trang để đổi thương hiệu một chỗ.
"""
from __future__ import annotations

import html

# Câu cho tham số `?loi=` — khớp bảng REASONS ở auth.py. Mã lạ → "he_thong".
LOGIN_ERRORS = {
    "chua_xac_minh": "Địa chỉ email chưa được Google xác minh.",
    "thieu_email": "Google không trả về địa chỉ email của tài khoản này.",
    "sai_mien": "Tài khoản này không thuộc tên miền được phép đăng nhập.",
    "google_tu_choi": "Bạn đã huỷ hoặc Google từ chối cấp quyền đăng nhập.",
    "phien_dang_nhap_hong": "Lượt đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.",
    "google_chua_bat": "Đăng nhập bằng Google chưa được cấu hình trên máy chủ này.",
    "he_thong": "Hệ thống gặp sự cố khi đăng nhập. Vui lòng thử lại sau ít phút.",
}

_CSS = """
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;
justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;
background:radial-gradient(1200px 600px at 50% -10%,#0e2a33,#0a0f14 60%);color:#e6eef2}
.card{width:100%;max-width:400px;padding:36px 30px;background:#10171d;border:1px solid #1d2a33;
border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.45);text-align:center}
.brand{display:flex;align-items:center;justify-content:center;gap:11px;margin-bottom:24px}
.mark{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;
background:linear-gradient(135deg,#22d3ee,#0891b2);
box-shadow:0 6px 18px -6px rgba(34,211,238,.6),inset 0 1px 0 rgba(255,255,255,.4)}
.mark svg{display:block}
.bname{font-weight:800;font-size:21px;letter-spacing:-.02em;line-height:1;text-align:left}
.bname .d{color:#22d3ee}
.bsub{font-size:9px;color:#5f7682;letter-spacing:.12em;text-transform:uppercase;
margin-top:4px;font-weight:600;text-align:left}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#8aa0ad;margin:0 0 20px;line-height:1.5}
form{display:flex;flex-direction:column;gap:12px;text-align:left}
label{font-size:12px;font-weight:600;color:#8aa0ad;display:block;margin-bottom:5px}
input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid #283742;background:#0b1116;
color:#e6eef2;font-size:14px;outline:none}
input:focus{border-color:#22d3ee}
.hint{font-size:11.5px;color:#5f7682;margin-top:4px}
.btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:12px 20px;
border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;border:0;cursor:pointer;font-family:inherit}
.btn[disabled]{opacity:.6;cursor:not-allowed}
.primary{color:#022;background:linear-gradient(135deg,#22d3ee,#0891b2)}
.secondary{color:#cfe0e8;background:transparent;border:1px solid #283742}
.secondary:hover{background:#16212a}
.gicon{background:#fff;border-radius:3px;padding:2px;display:grid;place-items:center}
.or{display:flex;align-items:center;gap:10px;margin:18px 0;color:#5f7682;font-size:12px}
.or:before,.or:after{content:"";flex:1;height:1px;background:#1d2a33}
.alert{border-radius:10px;padding:10px 12px;font-size:13px;text-align:left;margin-bottom:16px;line-height:1.45}
.alert.err{background:#2a1418;border:1px solid #5b2530;color:#fda4af}
.alert.ok{background:#0f2a22;border:1px solid #1f5a47;color:#86efac}
.alert[hidden]{display:none}
.foot{margin-top:18px;font-size:13px;color:#8aa0ad}
.foot a{color:#22d3ee;font-weight:600;text-decoration:none}
.foot a:hover{text-decoration:underline}
.btns{display:flex;flex-direction:column;gap:10px}
"""

_HEADER = """<div class="brand">
<span class="mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
stroke="#022b32" stroke-width="2.4" stroke-linecap="round">
<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></svg></span>
<span><div class="bname">Vonia<span class="d">.</span></div><div class="bsub">Voice Studio</div></span>
</div>"""

_GOOGLE_ICON = """<span class="gicon"><svg width="16" height="16" viewBox="0 0 48 48">
<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.1 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.3 13.2 17.6 9.5 24 9.5z"/>
<path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4z"/>
<path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z"/>
<path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.7 2.3-6.4 0-11.7-3.7-13.6-9.4l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/>
</svg></span>"""

# Gửi form bằng fetch JSON (không nộp form kiểu cũ): máy chủ chỉ nhận
# application/json, nên một form giả mạo từ trang khác không đi qua được.
_FORM_JS = """<script>
(function(){
  var f=document.getElementById('f'),a=document.getElementById('msg'),b=f.querySelector('button');
  function show(kind,text){a.className='alert '+kind;a.textContent=text;a.hidden=false}
  f.addEventListener('submit',function(e){
    e.preventDefault();if(b.disabled)return;
    var data={};new FormData(f).forEach(function(v,k){data[k]=v});
    if(f.dataset.confirm&&data.password!==data.password2){show('err','Hai lần nhập mật khẩu không khớp.');return}
    delete data.password2;
    b.disabled=true;var label=b.textContent;b.textContent='Đang xử lý...';
    fetch(f.dataset.action,{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)})
    .then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {r:r,j:j}})})
    .then(function(x){
      if(x.j&&x.j.redirect){window.location.href=x.j.redirect;return}
      if(x.r.ok){show('ok',(x.j&&x.j.message)||'Thành công.');f.reset();return}
      show('err',(x.j&&x.j.error&&x.j.error.message)||('Lỗi HTTP '+x.r.status));
    })
    .catch(function(){show('err','Không kết nối được máy chủ. Vui lòng thử lại.')})
    .finally(function(){b.disabled=false;b.textContent=label});
  });
})();
</script>"""


def page(title: str, body_html: str) -> str:
    return (
        '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{html.escape(title)} · Vonia</title><style>{_CSS}</style></head>"
        f'<body><div class="card">{_HEADER}{body_html}</div></body></html>'
    )


def _alert(error: str | None) -> str:
    if not error:
        return '<div id="msg" class="alert" hidden></div>'
    text = LOGIN_ERRORS.get(error, LOGIN_ERRORS["he_thong"])
    return f'<div id="msg" class="alert err">{html.escape(text)}</div>'


def _google_block(google_enabled: bool, label: str) -> str:
    if not google_enabled:
        return ""
    return (
        '<div class="or">hoặc</div>'
        f'<a class="btn secondary" href="/auth/google">{_GOOGLE_ICON}{html.escape(label)}</a>'
    )


def login_page(google_enabled: bool, error: str | None = None) -> str:
    """Màn hình đầu tiên người chưa đăng nhập nhìn thấy."""
    body = (
        "<h1>Chào mừng đến Vonia</h1>"
        "<p>Đăng nhập để bắt đầu tạo giọng nói AI.</p>"
        f"{_alert(error)}"
        '<form id="f" data-action="/auth/login" novalidate>'
        '<div><label for="email">Email</label>'
        '<input id="email" name="email" type="email" autocomplete="username" required></div>'
        '<div><label for="password">Mật khẩu</label>'
        '<input id="password" name="password" type="password" autocomplete="current-password" required></div>'
        '<button class="btn primary" type="submit">Đăng nhập</button>'
        "</form>"
        f"{_google_block(google_enabled, 'Tiếp tục với Google')}"
        '<div class="foot">Chưa có tài khoản? <a href="/auth/register">Đăng ký</a></div>'
        f"{_FORM_JS}"
    )
    return page("Đăng nhập", body)


def register_page(google_enabled: bool, first_user: bool = False) -> str:
    intro = (
        "Bạn là người đầu tiên — tài khoản này sẽ là <strong>Quản trị viên</strong> "
        "và dùng được ngay."
        if first_user else
        "Tài khoản mới sẽ dùng được sau khi Quản trị viên duyệt."
    )
    body = (
        "<h1>Tạo tài khoản Vonia</h1>"
        f"<p>{intro}</p>"
        '<div id="msg" class="alert" hidden></div>'
        '<form id="f" data-action="/auth/register" data-confirm="1" novalidate>'
        '<div><label for="full_name">Họ tên</label>'
        '<input id="full_name" name="full_name" autocomplete="name" required></div>'
        '<div><label for="email">Email</label>'
        '<input id="email" name="email" type="email" autocomplete="email" required></div>'
        '<div><label for="password">Mật khẩu</label>'
        '<input id="password" name="password" type="password" autocomplete="new-password" required>'
        '<div class="hint">Ít nhất 10 ký tự.</div></div>'
        '<div><label for="password2">Nhập lại mật khẩu</label>'
        '<input id="password2" name="password2" type="password" autocomplete="new-password" required></div>'
        '<button class="btn primary" type="submit">Đăng ký</button>'
        "</form>"
        f"{_google_block(google_enabled, 'Đăng ký bằng Google')}"
        '<div class="foot">Đã có tài khoản? <a href="/auth/login">Đăng nhập</a></div>'
        f"{_FORM_JS}"
    )
    return page("Đăng ký", body)


def pending_page() -> str:
    body = (
        "<h1>Tài khoản đang chờ duyệt</h1>"
        "<p>Yêu cầu của bạn đã được ghi nhận. Bạn sẽ dùng được Vonia sau khi "
        "Quản trị viên duyệt tài khoản. Nếu đã chờ lâu, hãy liên hệ Quản trị viên.</p>"
        '<div class="btns">'
        '<a class="btn primary" href="/auth/login">Thử đăng nhập lại</a>'
        '<a class="btn secondary" href="/logout">Dùng tài khoản khác</a>'
        "</div>"
    )
    return page("Chờ duyệt", body)
