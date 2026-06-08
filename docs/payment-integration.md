# Tích hợp thanh toán SePay (Vonia)

Tài liệu tích hợp **SePay** cho Vonia Voice Studio — bán gói thuê bao (Studio) qua **VietQR quét trong app** (luồng chính) và **cổng thanh toán redirect** (dự phòng, cho thẻ/NAPAS).

Tài liệu gốc của SePay: <https://developer.sepay.vn/vi>

**Mục lục**: [Tổng quan](#tổng-quan) · [Kiến trúc](#kiến-trúc) · [Cấu hình .env](#cấu-hình-env) · [Gói cước](#gói-cước) · [Luồng VietQR + Webhook](#luồng-vietqr--webhook-chính) · [Luồng Cổng thanh toán](#luồng-cổng-thanh-toán-dự-phòng) · [Tham khảo endpoint](#tham-khảo-endpoint) · [Lưu trữ](#lưu-trữ) · [Cấu hình dashboard SePay](#cấu-hình-dashboard-sepay) · [Kiểm thử](#kiểm-thử) · [Lên Production](#lên-production) · [Xử lý sự cố](#xử-lý-sự-cố) · [Bảo mật](#bảo-mật)

---

## Tổng quan

SePay có **hai sản phẩm khác nhau**, Vonia dùng cả hai:

| | VietQR + Webhook (chính) | Cổng thanh toán (dự phòng) |
|---|---|---|
| Sản phẩm SePay | SePay Webhooks (chuyển khoản NH) | Cổng thanh toán (Payment Gateway) |
| Trải nghiệm | QR **render ngay trong app**, không rời trang | **Redirect** sang trang SePay rồi quay lại |
| Phương thức | Chuyển khoản VietQR | Thẻ Visa/Master/JCB, NAPAS, QR |
| Xác nhận | SePay bắn **webhook** khi tiền vào | **IPN** + redirect callback |
| Endpoint nhận | `POST /payment/webhook` | `POST /payment/ipn` |
| Tạo đơn | `POST /payment/qr` | `POST /payment/checkout` |

> **Vì sao không nhúng cổng thanh toán vào app?** Trang checkout của cổng thanh toán đặt header `X-Frame-Options: SAMEORIGIN` → **không iframe được**. Muốn QR hiển thị trong app phải dùng sản phẩm Webhooks (tự render VietQR bằng `qr.sepay.vn`).

Khi thanh toán thành công, hệ thống **gia hạn gói thuê bao** của khách (cộng số ngày của gói vào `expires_at`).

---

## Kiến trúc

### Backend (`omnivoice/server/`)
| File | Vai trò |
|---|---|
| [`sepay.py`](../omnivoice/server/sepay.py) | `SePayClient` (ký checkout gateway, verify IPN, query order) + `SePayBankConfig` (dựng URL VietQR, verify webhook), `PLANS` (catalog gói) |
| [`billing.py`](../omnivoice/server/billing.py) | `BillingStore` lưu đơn + gói thuê bao ra đĩa (JSON, atomic, có khóa); `new_payment_code()`; `mark_paid()` **idempotent** |
| [`app.py`](../omnivoice/server/app.py) | Khai báo route `/payment/*` (trước khi mount UI tĩnh) |
| [`auth.py`](../omnivoice/server/auth.py) | `/payment/ipn` và `/payment/webhook` nằm trong `PUBLIC_PATHS` (bỏ qua cookie auth — tự xác thực bằng header riêng) |
| [`schemas.py`](../omnivoice/server/schemas.py) | `CheckoutRequest/Response`, `QrRequest/Response` |

### Frontend (`web/src/`)
| File | Vai trò |
|---|---|
| `lib/api.ts` | `getPaymentConfig`, `getPlans`, `getSubscription`, `createQr`, `getOrder`, `createCheckout`, `redirectToCheckout` |
| `components/PaymentModal.tsx` | Modal thanh toán: tab **Bank** (VietQR thật: `createQr` + poll `getOrder` mỗi 3s), tab Card/Crypto (placeholder thủ công) |
| `components/SettingsModal.tsx` | Tab "Tài khoản bản quyền": hiện gói hiện tại + nút "Nâng cấp ngay" → mở `PaymentModal` |
| `App.tsx` / `mobile/MobileApp.tsx` | Sidebar plan-card hiện trạng thái gói thật; `PaymentReturn` xử lý redirect callback của cổng thanh toán |

---

## Cấu hình `.env`

> File `.env` ở repo root, **đã gitignored — KHÔNG commit**. `serve.py` tự nạp khi khởi động.

```bash
# --- Cổng thanh toán (gateway, dự phòng) ---
merchant_id=SP-TEST-XXXXXXXX           # MERCHANT ID từ dashboard
secret_key=spsk_test_xxxxxxxxxxxxxxxx  # SECRET KEY từ dashboard
SEPAY_ENV=sandbox                      # sandbox | production

# Origin công khai để dựng URL callback + IPN/webhook
VONIA_PUBLIC_URL=https://vonia.locnguyendata.com

# --- SePay Webhooks / VietQR (luồng QR chính) ---
SEPAY_BANK_ACCOUNT=0000000001          # số tài khoản (hoặc VA) nhận tiền
SEPAY_BANK_CODE=MBBank                 # mã NH — xem https://qr.sepay.vn/banks.json
SEPAY_BANK_NAME=NGUYEN VAN A           # tên chủ TK (chỉ để hiển thị)
SEPAY_CODE_PREFIX=DH                   # tiền tố mã thanh toán (khớp cấu hình dashboard)

# Xác thực webhook — điền ĐÚNG 1 trong 2 (để trống cả hai = không xác thực, chỉ test):
#SEPAY_WEBHOOK_API_KEY=xxxxxxxx        # nếu webhook chọn auth = API Key
SEPAY_WEBHOOK_SECRET=whsec_xxxxxxxx    # nếu webhook chọn auth = HMAC-SHA256

# (tùy chọn) thư mục lưu đơn/gói — mặc định ~/.cache/omnivoice/billing
#VONIA_BILLING_DIR=~/.cache/omnivoice/billing
```

Quy tắc đọc biến (xem `client_from_env` / `bank_config_from_env`):
- Chấp nhận cả tên `SEPAY_MERCHANT_ID`/`SEPAY_SECRET_KEY` (ưu tiên) lẫn `merchant_id`/`secret_key`.
- `SEPAY_CODE_PREFIX` mặc định `DH` nếu để trống.
- VietQR coi là "đã cấu hình" khi có **cả** `SEPAY_BANK_ACCOUNT` và `SEPAY_BANK_CODE`.

---

## Gói cước

Định nghĩa trong `PLANS` ([`sepay.py`](../omnivoice/server/sepay.py)). `amount` tính bằng **VND**, `days` là số ngày gia hạn:

| `plan_id` | Tên | Giá (VND) | Số ngày |
|---|---|---|---|
| `studio_monthly` | Studio | 100.000 | 30 |
| `studio_6month` | Studio (6 tháng) | 500.000 | 180 |
| `studio_yearly` | Studio (năm) | 1.000.000 | 365 |

Frontend lấy danh sách qua `GET /payment/plans` nên đổi giá/thêm gói chỉ cần sửa `PLANS`.

---

## Luồng VietQR + Webhook (chính)

```
Khách bấm "Nâng cấp ngay"
        │
        ▼
POST /payment/qr {plan_id}          → tạo đơn pending, sinh mã DH<8 số>
        │                             trả về qr_url + STK + nội dung CK
        ▼
App hiện <img src=qr_url>           ← https://qr.sepay.vn/img?acc=&bank=&amount=&des=<code>&template=qronly
App poll GET /payment/order/{code}  (mỗi 3s)
        │
Khách quét QR → chuyển khoản (nội dung chứa mã DH)
        │
SePay phát hiện tiền vào → POST /payment/webhook (HMAC hoặc API Key)
        │
Server khớp code → đơn = paid → gia hạn gói
        ▼
App poll thấy "paid" → đóng QR, hiện "Gói đã kích hoạt"
```

### Mã thanh toán (payment code)
- Sinh bởi `new_payment_code(prefix)` = `<PREFIX>` + **8 chữ số** (vd `DH35738489`).
- Khớp **mẫu mặc định** của SePay: tiền tố + 6–8 chữ số. SePay tự **bóc tách** mã này từ *nội dung chuyển khoản* và gắn vào trường `code` của webhook.
- Mã chính là `invoice_number` (khóa của đơn) → webhook chỉ cần khớp `code` ↔ đơn.

### URL ảnh VietQR
```
https://qr.sepay.vn/img?acc=<STK>&bank=<MÃ_NH>&amount=<VND>&des=<mã_DH>&template=qronly
```
`template=qronly` = chỉ mã QR (không khung/logo) để nhúng gọn trong app.

### Webhook: xác thực
SePay hỗ trợ 4 kiểu; Vonia hỗ trợ **API Key** và **HMAC-SHA256** (xem `SePayBankConfig.verify_webhook`):

**API Key**
```
Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>
```

**HMAC-SHA256** (khuyến nghị)
```
X-SePay-Signature: sha256=<hex>      # hex = HMAC-SHA256(secret, "{ts}.{raw_body}")
X-SePay-Timestamp: <unix_seconds>    # lệch quá ±300s → từ chối (chống replay)
```
> HMAC ký trên **raw body** (bytes gốc). Server đọc `await request.body()` trước khi parse JSON.

Nếu cả hai biến đều trống → `verify_webhook` trả `True` (không xác thực, **chỉ dùng test**).

### Webhook: payload & khớp đơn
SePay POST JSON (các trường chính):
```json
{
  "id": 555001,
  "gateway": "MBBank",
  "transactionDate": "2026-06-08 08:00:00",
  "accountNumber": "0000000001",
  "code": "DH35738489",
  "content": "DH35738489 thanh toan",
  "transferType": "in",
  "transferAmount": 100000,
  "accumulated": 0,
  "referenceCode": "FT888"
}
```
Logic (`POST /payment/webhook`):
1. Xác thực header (HMAC/API Key) → sai trả **401**.
2. Chỉ xử lý `transferType == "in"` và `code` không rỗng.
3. Tìm đơn theo `code`; không có → trả 200 (bỏ qua, không phải đơn của ta).
4. `transferAmount < đơn.amount` → bỏ qua (chống thiếu tiền).
5. Khớp → `mark_paid()` (idempotent) → gia hạn gói. Luôn trả `{"success": true}` (HTTP 200) để SePay ngừng retry.

---

## Luồng Cổng thanh toán (dự phòng)

Dùng cho thẻ/NAPAS (redirect). **Không có Python SDK** — `sepay.py` mô phỏng **Node SDK `sepay-pg-node` v1.0.0** từng byte để chữ ký hợp lệ.

- `POST /payment/checkout {plan_id, payment_method}` → tạo đơn + trả `{checkout_url, fields}`. Frontend dựng `<form method=POST>` từ `fields` rồi submit (redirect sang SePay).
- **Chữ ký**: `base64( HMAC-SHA256( secret_key, "field1=val1,field2=val2,..." ) )` trên các field trong allowlist, theo **đúng thứ tự insertion** mà SDK tạo (xem `_SIGN_ALLOWLIST`, `build_checkout_fields`). `custom_data` **không** ký.
- Endpoint init: sandbox `https://pay-sandbox.sepay.vn/v1/checkout/init`, production `https://pay.sepay.vn/v1/checkout/init`.
- **IPN** (`POST /payment/ipn`): SePay gửi header `X-Secret-Key: <secret_key>` → so khớp constant-time; `notification_type == "ORDER_PAID"` → khớp `order_invoice_number` → gia hạn gói. Có kiểm tra số tiền chống gian lận.
- Redirect quay về SPA: `success_url`/`error_url`/`cancel_url` = `<VONIA_PUBLIC_URL>/?payment=<status>&inv=<code>`; component `PaymentReturn` poll `getOrder` để xác nhận.
- Đối soát dự phòng: `GET /payment/order/{code}` với đơn `provider="gateway"` còn pending sẽ gọi `query_order` (REST, Basic auth) hỏi trực tiếp SePay.

---

## Tham khảo endpoint

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/payment/config` | cookie/basic | `{configured, method, qr_enabled, gateway_enabled, env, public_url, currency}` |
| GET | `/payment/plans` | cookie/basic | Danh sách gói |
| GET | `/payment/subscription` | cookie/basic | Gói hiện tại của khách `{plan_id, status, expires_at, active, days_left}` |
| POST | `/payment/qr` | cookie/basic | Tạo đơn VietQR → `{invoice_number, amount, qr_url, bank_account, bank_code, bank_name, content, plan_id}` |
| GET | `/payment/order/{code}` | cookie/basic | Trạng thái đơn (`pending`/`paid`/`cancelled`/`error`) |
| POST | `/payment/webhook` | **HMAC / API Key** | Nhận giao dịch NH (luồng VietQR) |
| POST | `/payment/checkout` | cookie/basic | Tạo đơn cổng thanh toán → `{checkout_url, fields}` |
| POST | `/payment/ipn` | **X-Secret-Key** | IPN cổng thanh toán |

`method` trong `/payment/config` = `"qr"` nếu đã cấu hình bank, ngược lại `"gateway"`, hoặc `null`.

---

## Lưu trữ

`BillingStore` ghi JSON ra `~/.cache/omnivoice/billing/` (đổi bằng `VONIA_BILLING_DIR`):

- `orders.json` — danh sách đơn (`OrderRecord`: `invoice_number, plan_id, amount, currency, payment_method, customer_id, provider, status, created, paid_at, sepay_*`).
- `subscriptions.json` — gói theo `customer_id`.

> **Đa người dùng:** hiện app dùng **1 login chung** → mọi request map về 1 `customer_id` (`auth.user` hoặc `"default"`). Gói đã key theo `customer_id` nên khi làm hệ thống tài khoản đa người dùng (Google OAuth) chỉ cần đổi `_customer_id()` trong `app.py`, không phải migrate dữ liệu.

`mark_paid()` **idempotent**: webhook/IPN gửi trùng đơn đã `paid` là no-op → không cộng dồn ngày.

---

## Cấu hình dashboard SePay

### Luồng VietQR (Webhooks) — bắt buộc cho QR trong app
1. <https://my.sepay.vn> → (test thì bật **Test mode** ở sidebar).
2. **Tài khoản ngân hàng**: tạo/liên kết tài khoản → lấy **số TK** + **mã NH** → điền `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_CODE`.
3. **SePay Webhooks → Tạo webhook**:
   - URL: `https://vonia.locnguyendata.com/payment/webhook`
   - Loại sự kiện: **Tiền vào**
   - Xác thực: **HMAC-SHA256** (hoặc API Key) → copy secret/key vào `.env` (`SEPAY_WEBHOOK_SECRET` hoặc `SEPAY_WEBHOOK_API_KEY`).
4. **Cấu hình Công ty → Cấu hình chung → Cấu trúc mã thanh toán**: bật mẫu **tiền tố `DH` + 6–8 số** (mặc định). Khớp với `SEPAY_CODE_PREFIX`.

### Luồng Cổng thanh toán (tùy chọn, cho thẻ)
- IPN URL: `https://vonia.locnguyendata.com/payment/ipn`
- Lấy `merchant_id`/`secret_key` từ màn hình tích hợp → `.env`.

> **Cấu hình Test mode và Live tách biệt** — làm xong ở Test mode phải copy/làm lại cho Live.

---

## Kiểm thử

### Test toàn cục bằng SePay Test mode (khuyến nghị)
1. App → **Cài đặt → Tài khoản bản quyền → Nâng cấp ngay** → ghi lại **mã `DH…`** trên QR.
2. Dashboard (Test mode) → **Mô phỏng giao dịch**: TK `0000000001`, số tiền `100000`, loại **Tiền vào**, **nội dung = mã `DH…`**.
3. App tự chuyển QR sang "đã thanh toán" + gói kích hoạt.

### Giả lập webhook HMAC bằng curl/python (không cần dashboard)
```python
import json, hmac, hashlib, time, urllib.request
code = "DH12345678"                       # mã lấy từ POST /payment/qr
secret = b"whsec_xxxxxxxx"                # = SEPAY_WEBHOOK_SECRET
body = json.dumps({"id":1,"gateway":"MBBank","transactionDate":"2026-06-08 08:00:00",
  "accountNumber":"0000000001","code":code,"content":code,
  "transferType":"in","transferAmount":100000,"referenceCode":"FT1"}).encode()
ts = str(int(time.time()))
sig = "sha256=" + hmac.new(secret, f"{ts}.".encode()+body, hashlib.sha256).hexdigest()
req = urllib.request.Request("http://127.0.0.1:8002/payment/webhook", data=body, method="POST",
  headers={"Content-Type":"application/json","X-SePay-Signature":sig,"X-SePay-Timestamp":ts})
print(urllib.request.urlopen(req).read())   # {"success": true}
```

### Kiểm tra nhanh các endpoint
```bash
BASE=http://127.0.0.1:8002 ; AUTH='user@example.com:pass'
curl -s -u "$AUTH" $BASE/payment/config
curl -s -u "$AUTH" -H 'Content-Type: application/json' -d '{"plan_id":"studio_monthly"}' $BASE/payment/qr
curl -s -u "$AUTH" $BASE/payment/subscription
```

---

## Lên Production

Chỉ đổi **cấu hình**, không sửa code:
1. Dashboard: tắt Test mode → liên kết **tài khoản ngân hàng thật**.
2. Tạo **webhook Live** (URL `…/payment/webhook`, HMAC) → lấy secret Live.
3. Bật **Cấu trúc mã thanh toán** ở Live (mẫu `DH` + 6–8 số).
4. `.env`: cập nhật `SEPAY_BANK_ACCOUNT`, `SEPAY_WEBHOOK_SECRET` (bản Live) → **restart** server.
5. (Nếu dùng cổng thẻ) `SEPAY_ENV=production` + `merchant_id`/`secret_key` chính thức + IPN `…/payment/ipn`. NAPAS/Thẻ cần **gửi hồ sơ** duyệt.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `query_order` luôn None / 403 `error code: 1010` | Cloudflare chặn User-Agent mặc định của Python | Đã gửi `User-Agent` riêng trong `query_order` (đừng bỏ) |
| Webhook về nhưng `code=` rỗng → không kích hoạt | "Cấu trúc mã thanh toán" chưa bật, hoặc nội dung CK không chứa mã | Bật mẫu `DH`+6–8 số; nội dung CK phải chứa đúng mã |
| Webhook 200 nhưng gói không lên | Số tiền < giá gói, hoặc `transferType != in` | Chuyển đúng/đủ số tiền, loại "tiền vào" |
| Webhook **401** | Sai HMAC secret/API key, hoặc timestamp lệch >5 phút | Kiểm `.env` + đồng bộ NTP cho server |
| Không nhúng được trang cổng thanh toán vào iframe | SePay đặt `X-Frame-Options: SAMEORIGIN` | Dùng luồng VietQR (đã là mặc định) |
| QR hiện nhưng "đứng" mãi ở "đang chờ" | Webhook chưa cấu hình / URL sai / tunnel down | Kiểm webhook URL = `…/payment/webhook`; test `curl` qua domain công khai |

---

## Bảo mật

- `.env` chứa secret (`secret_key`, `SEPAY_WEBHOOK_SECRET`, mật khẩu login) — **gitignored, không commit**.
- `/payment/webhook` và `/payment/ipn` công khai nhưng **tự xác thực** (HMAC / API Key / X-Secret-Key) — không dựa cookie.
- HMAC so khớp **constant-time** (`hmac.compare_digest`) + chống replay (±300s).
- Webhook kiểm **số tiền ≥ giá gói** trước khi gia hạn (chống chỉnh sửa số tiền).
- Xử lý thanh toán **idempotent** theo đơn → webhook trùng vô hại.
- Khuyến nghị thêm: whitelist dải IP SePay ở firewall/WAF cho 2 endpoint trên (xem <https://developer.sepay.vn/vi/dia-chi-ip>).
