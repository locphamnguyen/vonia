# Plan: Zitadel OIDC Auth cho Vonia Voice Studio

> ⚠️ **Đã thay thế (28/09/2026).** Vonia không còn dùng Zitadel. Đăng nhập nay là
> Google OAuth trực tiếp + email/mật khẩu, người đăng ký đầu tiên là Quản trị viên,
> người sau chờ duyệt — xem [dang-ky-dang-nhap.md](dang-ky-dang-nhap.md). Tài liệu dưới
> đây giữ lại làm lịch sử.


**Mục tiêu:** Thay thế login username/password bằng Zitadel OIDC (Google IDP).  
**Domain:** `auth.locnguyendata.com` (self-hosted) · App: `vonia.locnguyendata.com`

---

## Phần 1 — Code (đã xong ✅)

| # | File | Mô tả | Trạng thái |
|---|------|--------|-----------|
| T1 | `omnivoice/server/auth.py` | OIDCAuth class — PKCE, state cookie HMAC, Redis session | ✅ Done |
| T2 | `omnivoice/server/app.py` | FastAPI lifespan (Redis + httpx), auth routes `/auth/login` `/auth/callback` `/auth/me` `/logout`, auth middleware `_gate` | ✅ Done |
| T6 | `k8s/redis.yaml` | Redis deployment trên k3s, NodePort 30379 | ✅ Done |
| T7 | `omnivoice/server/billing.py` | BillingStore async Redis-backed (thay file-based) | ✅ Done |
| T8 | `web/src/lib/api.ts` | 401 interceptor → redirect `/auth/login`; thêm `getMe()` | ✅ Done |
| T9 | `web/src/App.tsx` + `tokens.css` | Sidebar hiển thị email user + nút logout | ✅ Done |
| T10 | `tests/test_auth.py` | 20 test cases cho OIDCAuth (pytest, 100% pass) | ✅ Done |
| T12 | `pyproject.toml` | Thêm `httpx`, `redis[hiredis]` vào serve extras; thêm `dev` extras | ✅ Done |
| T13 | `.env` | Thêm `ZITADEL_DOMAIN`, `ZITADEL_CLIENT_ID`, `ZITADEL_CLIENT_SECRET`, `REDIS_URL`, `VONIA_ALLOWED_EMAILS` | ✅ Done (giá trị placeholder) |

---

## Phần 2 — Zitadel config (anh tự làm trên dashboard)

| # | Việc cần làm | Trạng thái |
|---|-------------|-----------|
| Z1 | Đăng nhập Zitadel admin: `https://auth.locnguyendata.com` | ✅ Xong 11/06 (admin: `locphamnguyen@gmail.com`, có passkey) |
| Z2 | Tạo Application mới: **Web type → Confidential Client** | ✅ Xong 11/06 — Project `Vonia` (ID 376841942664740867), App `Vonia` Web/Code/Basic (ID 376842607394816003) |
| Z3 | Điền Redirect URI: `https://vonia.locnguyendata.com/auth/callback` | ✅ Xong 11/06 — đã verify trong console |
| Z4 | Điền Post-logout URI: `https://vonia.locnguyendata.com` | ✅ Xong 11/06 — đã verify trong console |
| Z5 | Copy `Client ID` → điền vào `.env` → `ZITADEL_CLIENT_ID=376842607394881539` | ✅ Lấy xong — ⚠️ cần xác nhận đã điền `.env` trên server Vonia |
| Z6 | Tạo `Client Secret` → điền vào `.env` → `ZITADEL_CLIENT_SECRET=` | ✅ Lấy xong — ⚠️ cần xác nhận đã điền `.env` trên server Vonia |
| Z7 | Bật Google IDP trong Zitadel (Identity Providers → Google) | ✅ Xong 11/06 — provider Active, nút Google đã hiện trên trang login |
| Z8 | ~~Gắn Google IDP vào Application~~ → Activate provider + bật "External Login allowed" | ✅ Xong 11/06 (xem ghi chú Z8 bên dưới) |

> 📸 Hướng dẫn chi tiết kèm ảnh chụp thật từng màn hình: `huong-dan/HUONG-DAN-CAU-HINH-ZITADEL.md`

---

## Hướng dẫn chi tiết từng bước Zitadel

### Z1 — Đăng nhập Zitadel admin

Vào `https://auth.locnguyendata.com` — đăng nhập bằng tài khoản admin của Zitadel (tài khoản tạo lúc cài đặt ban đầu).

---

### Z2 — Tạo Application (Web · Confidential Client)

1. Vào **Organizations** → chọn org của anh (hoặc Default)
2. Vào **Projects** → chọn project (hoặc tạo project mới tên `Vonia`)
3. Click **"+ New Application"**
4. Điền:
   - **Name:** `Vonia Voice Studio`
   - **Type:** chọn **`Web`** (không phải Native, không phải API)
5. Click **Continue**
6. Ở bước **Authentication Method**, chọn **`CODE`** (Authorization Code + PKCE)
7. Click **Continue** → **Create**

---

### Z3 — Điền Redirect URI

Sau khi tạo xong app, vào tab **"Redirect Settings"**:

- **Redirect URIs:** thêm vào
  ```
  https://vonia.locnguyendata.com/auth/callback
  ```
- Click **Save**

> ⚠️ URI phải khớp chính xác — không có dấu `/` cuối, không có `?` hay `#`.

---

### Z4 — Điền Post-logout URI

Cùng trang Redirect Settings:

- **Post Logout Redirect URIs:** thêm vào
  ```
  https://vonia.locnguyendata.com
  ```
- Click **Save**

---

### Z5 — Lấy Client ID

Trong trang Application vừa tạo, tab **"Configuration"**:

- Thấy mục **Client ID** — copy giá trị này
- Điền vào `.env`:
  ```
  ZITADEL_CLIENT_ID=<giá trị vừa copy>
  ```

---

### Z6 — Tạo và lấy Client Secret

Vẫn trong tab **"Configuration"**:

1. Click **"New Client Secret"**
2. Copy ngay giá trị secret hiện ra **(chỉ hiện 1 lần duy nhất)**
3. Điền vào `.env`:
   ```
   ZITADEL_CLIENT_SECRET=<giá trị vừa copy>
   ```

> ⚠️ Secret chỉ hiển thị một lần — copy ngay, không refresh trang.

---

### Z7 — Bật Google IDP

**Bước 7a — Tạo Google OAuth credentials** (nếu chưa có):

1. Vào [console.cloud.google.com](https://console.cloud.google.com)
2. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized redirect URIs: thêm
   ```
   https://auth.locnguyendata.com/idps/callback
   ```
   > ⚠️ Đã sửa 11/06: ZITADEL v2+ dùng `/idps/callback` (KHÔNG phải `/idps/google/callback` như bản plan cũ).
   > Nếu Google báo `redirect_uri_mismatch` khi bấm nút Google → kiểm tra lại URI này trong Google Cloud Console.
5. Click **Create** → copy **Client ID** và **Client Secret** của Google

**Bước 7b — Cấu hình Google IDP trong Zitadel:**

1. Vào **Organizations** → org của anh → **"Identity Providers"** (menu trái)
2. Click **"+ New Provider"** → chọn **Google**
3. Điền:
   - **Name:** `Google`
   - **Client ID:** Client ID từ bước 7a
   - **Client Secret:** Client Secret từ bước 7a
   - **Scopes:** để mặc định (`openid profile email`)
4. Click **Save**

---

### Z8 — Kích hoạt Google IDP (đã sửa theo giao diện thật)

> ⚠️ Bản plan cũ viết "gắn IDP vào Application" — ZITADEL **không có** tab Identity Providers trong app.
> IDP kích hoạt ở cấp instance/org, mọi app trong org tự động hiện nút Google. Các bước đúng:

1. **Default Settings → Identity Providers** → dòng Google → bấm **Activate** (cột Availability hiện ✓)
2. **Default Settings → Login Behavior and Security** → phần Login Form → tick **External Login allowed** → Save

✅ Cả 2 bước đã làm xong 11/06 — verify bằng trang login đã hiện nút "Google".

---

### Kiểm tra nhanh sau khi xong Z1–Z8

```bash
# Mở trình duyệt, vào:
https://vonia.locnguyendata.com/auth/login

# Kết quả kỳ vọng:
# → redirect sang https://auth.locnguyendata.com/oauth/v2/authorize?...
# → thấy trang login Zitadel với nút "Continue with Google"
# → login bằng locphamnguyen@gmail.com → về được app Vonia
```

**Lỗi thường gặp:**

| Lỗi | Nguyên nhân | Cách sửa |
|-----|-------------|----------|
| `redirect_uri_mismatch` | URI trong Zitadel không khớp | Kiểm tra lại Z3 — phải là `/auth/callback` chính xác |
| `client_id not found` | `ZITADEL_CLIENT_ID` sai hoặc chưa điền | Kiểm tra lại Z5 và `.env` |
| `unauthorized_client` | App type sai (không phải Web/CODE) | Tạo lại app theo Z2 |
| Trang 403 "Không thể đăng nhập" | Email không trong `VONIA_ALLOWED_EMAILS` | Kiểm tra lại `.env` |

---

## Phần 3 — Deploy (anh tự làm trên server Vonia)

> ✅ **Đã xử lý 11/06/2026**: `/auth/login` giờ trả **303** redirect sang Zitadel với `client_id` thật.
> Nguyên nhân lỗi 401 cũ: service Vonia đang chạy bản từ 08/06 (trước khi có code auth + `.env` mới) → chỉ cần restart.
> Lưu ý: app Vonia + k3s nằm trên **chính server này** (`olares`), service tên `vonia.service` (port 8002).
>
> ⚠️ **2 cạm bẫy đã gặp & cách xử lý** (xem chi tiết trong `huong-dan-cai-dat.md`):
> 1. `.env` bị **khai báo trùng** `ZITADEL_CLIENT_ID/SECRET` (placeholder ở trên, giá trị thật ở dưới).
>    Hàm nạp `.env` (`omnivoice/cli/serve.py` → `_load_dotenv` dùng `os.environ.setdefault`) → **dòng đầu thắng**
>    → nạp nhầm placeholder. Đã xoá cặp placeholder, chỉ giữ giá trị thật.
> 2. NodePort k3s **không thông qua `localhost:30379`** (`route_localnet=0`). Đã đổi
>    `REDIS_URL=redis://192.168.1.50:30379` (IP node) thay vì `localhost`.

| # | Việc cần làm | Trạng thái |
|---|-------------|-----------|
| D1 | `kubectl apply -f k8s/redis.yaml` — deploy Redis trên k3s | ✅ Xong 11/06 — namespace `vonia`, pod Running |
| D2 | Verify Redis: PING qua `192.168.1.50:30379` → PONG | ✅ Xong 11/06 — `+PONG` (qua IP node, không qua localhost) |
| D3 | Điền `ZITADEL_CLIENT_ID=376842607394881539` + `ZITADEL_CLIENT_SECRET` vào `.env` rồi restart Vonia | ✅ Xong 11/06 — xoá placeholder trùng, `systemctl restart vonia` |
| D4 | Test login: `/auth/login` → phải redirect sang Zitadel | ✅ Xong 11/06 — **303** → `.../oauth/v2/authorize?client_id=376842607394881539...` (cả local 8002 lẫn domain public) |
| D5 | Login bằng Gmail (`locphamnguyen@gmail.com`) → phải về được app | ⬜ Cần test thủ công trên trình duyệt (cần đăng nhập Google) |
| D6 | Test logout: click nút logout → session bị xóa, redirect sang Zitadel | ⬜ Cần test thủ công |
| D7 | Test email không trong allowlist → phải thấy trang lỗi 403 | ⬜ Cần test thủ công |

---

## Biến môi trường cần điền vào `.env`

```bash
ZITADEL_DOMAIN=auth.locnguyendata.com
ZITADEL_CLIENT_ID=<lấy từ Zitadel dashboard - bước Z5>
ZITADEL_CLIENT_SECRET=<lấy từ Zitadel dashboard - bước Z6>
VONIA_ALLOWED_EMAILS=locphamnguyen@gmail.com
REDIS_URL=redis://192.168.1.50:30379   # IP node, KHÔNG dùng localhost (NodePort k3s không thông qua loopback)
VONIA_SESSION_SECRET=cd43378874cd0eaec99603cfb9d7fd01d2aaa41203ce1a708a1c80281481dc22
```

> ⚠️ Mỗi biến chỉ khai báo **một lần** trong `.env`. `_load_dotenv` dùng `setdefault` nên nếu trùng key thì **dòng đầu tiên thắng** — đừng để placeholder nằm trên giá trị thật.

---

## Phần 4 — Kế hoạch tiếp theo (cập nhật 11/06/2026)

> ✅ **Cập nhật 11/06 (chiều):** Bước 2 (Redis) + Bước 3 (.env + restart) + Bước 4 (debug 401) đã **xong**.
> `/auth/login` trả 303 đúng. Chỉ còn **Bước 5 — test login end-to-end thủ công trên trình duyệt**.
> Toàn bộ quy trình deploy đầy đủ đã được ghi lại trong `docs/huong-dan-cai-dat.md`.

Phần Zitadel (Z1–Z8) đã **xong toàn bộ**. Còn lại là deploy phía server Vonia, theo thứ tự:

### Bước 1 — Xác minh redirect URI phía Google Cloud (5 phút, ưu tiên cao)
Mở cửa sổ ẩn danh → `https://auth.locnguyendata.com` → bấm nút **Google**:
- Nếu đăng nhập Google trôi chảy → OK, bỏ qua.
- Nếu Google báo `redirect_uri_mismatch` → vào Google Cloud Console sửa Authorized redirect URI
  thành `https://auth.locnguyendata.com/idps/callback` (plan cũ ghi sai `/idps/google/callback`).

### Bước 2 — Deploy Redis trên server Vonia (D1, D2)
```bash
kubectl apply -f k8s/redis.yaml
redis-cli -p 30379 ping   # → PONG
```

### Bước 3 — Điền .env và restart Vonia (D3)
```bash
# .env của omnivoice trên server Vonia:
ZITADEL_DOMAIN=auth.locnguyendata.com
ZITADEL_CLIENT_ID=376842607394881539
ZITADEL_CLIENT_SECRET=<secret đã copy lúc tạo app — nếu mất: console → app Vonia → Actions → Regenerate Client Secret>
VONIA_ALLOWED_EMAILS=locphamnguyen@gmail.com
REDIS_URL=redis://localhost:30379
# rồi restart Vonia server
```

### Bước 4 — Debug lỗi 401 hiện tại trên /auth/login (D4)
Hiện `GET /auth/login` trả 401 thay vì 302. Sau khi restart ở Bước 3, kiểm tra lại:
```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://vonia.locnguyendata.com/auth/login
# Kỳ vọng: 302/307 -> https://auth.locnguyendata.com/oauth/v2/authorize?...
```
Nếu vẫn 401: kiểm tra middleware `_gate` trong `omnivoice/server/app.py` —
các route `/auth/login`, `/auth/callback` phải nằm trong danh sách miễn auth.

### Bước 5 — Test end-to-end (D5, D6, D7)
- Login Gmail trong allowlist → vào được app
- Logout → session Redis bị xóa, quay về trang Zitadel
- Login Gmail KHÔNG trong allowlist → trang 403

---

## Kiến trúc flow đăng nhập

```
Browser → GET /auth/login
         → redirect Zitadel (/oauth/v2/authorize?code_challenge=…)
         → User login Google tại Zitadel
         → Zitadel redirect về GET /auth/callback?code=…&state=…
         → Server: exchange code → access_token
         → Server: GET /oidc/v1/userinfo (lấy email)
         → Server: check email allowlist
         → Server: tạo session trong Redis (TTL 7 ngày)
         → Set-Cookie: vonia_session=<session_id>
         → redirect → /
```
