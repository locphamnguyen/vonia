# Đăng ký / đăng nhập Vonia

Port từ module auth của **SSTC-HUB-APP** (`backend/internal/modules/auth`, Go) sang
Vonia (Python/FastAPI), đổi kho lưu từ Postgres sang Redis. Thay thế cơ chế
Zitadel OIDC trước đây.

## Luật nghiệp vụ

| Tình huống | Kết quả |
|---|---|
| **Người đăng ký đầu tiên** (email/mật khẩu hoặc Google) | Thành **Quản trị viên toàn quyền**, kích hoạt ngay, đăng nhập luôn. |
| Người đăng ký sau | Trạng thái **chờ duyệt**, chưa dùng được app. |
| Quản trị viên bấm **Duyệt** | Tài khoản dùng được ngay. |
| Quản trị viên bấm **Khoá** | Người đó bị đẩy ra ở yêu cầu kế tiếp (không phải chờ phiên hết hạn). |
| Tài khoản chờ duyệt / bị khoá đăng nhập | Cùng một thông báo “chưa được kích hoạt” — không lộ email nào đã có tài khoản. |
| Đăng ký trùng email | Cùng câu trả lời như đăng ký mới (chống dò tài khoản). |
| Sai mật khẩu 5 lần | Khoá đăng nhập bằng mật khẩu cho email đó 15 phút. |
| Google trả email chưa xác minh | Từ chối. |
| Email đăng ký bằng mật khẩu, sau đó chủ email vào bằng Google | Google chứng minh chủ sở hữu → mật khẩu cũ (do người chưa xác minh đặt) bị huỷ. |

Hệ thống luôn phải còn ít nhất một Quản trị viên: không tự khoá, tự xoá, tự gỡ
quyền của chính mình, không gỡ Quản trị viên cuối cùng.

## Cấu hình (`.env`)

| Biến | Ý nghĩa |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client loại *Web application* trên Google Cloud Console. Để trống = ẩn nút Google, chỉ dùng email/mật khẩu. |
| `VONIA_PUBLIC_URL` | Ví dụ `https://vonia.locnguyendata.com`. Redirect URI khai trên Google phải là **`<VONIA_PUBLIC_URL>/auth/callback`**. |
| `VONIA_SESSION_SECRET` | Khoá ký cookie state OAuth (`openssl rand -hex 32`). |
| `REDIS_URL` | Redis lưu người dùng + phiên. |
| `VONIA_ADMIN_EMAILS` | *(Tuỳ chọn, nên đặt trên server đang public)* chỉ các email này mới có thể trở thành Quản trị viên đầu tiên. Để trống = ai đăng ký trước là admin. |
| `VONIA_ALLOWED_DOMAIN` | *(Tuỳ chọn)* chỉ email thuộc miền này mới đăng ký được. |
| `VONIA_API_KEYS` | API key server-to-server (`X-API-Key` / Bearer), bỏ qua đăng nhập, **không** có quyền quản trị. |
| `VONIA_AUTH=off` | Tắt cổng đăng nhập — chỉ dùng khi phát triển cục bộ. |

Các biến `ZITADEL_*`, `VONIA_ALLOWED_EMAILS`, `VONIA_BLOCKED_DOMAINS` không còn dùng.

### Tạo Google OAuth client

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URIs: `https://vonia.locnguyendata.com/auth/callback`.
4. Copy Client ID / Client secret vào `.env`, khởi động lại service.

### Lưu ý khi triển khai lên server đang chạy

Phiên đăng nhập Zitadel cũ không còn hiệu lực — mọi người phải đăng nhập lại.
Người **đăng ký đầu tiên sau khi triển khai** sẽ là Quản trị viên, nên hãy đặt
`VONIA_ADMIN_EMAILS=<email của bạn>` trước khi khởi động lại, hoặc đăng ký ngay
sau khi triển khai.

## Đường dẫn

| Đường | Mô tả |
|---|---|
| `GET /auth/login` | Trang đăng nhập (email/mật khẩu + nút Google). |
| `GET /auth/register` | Trang đăng ký. |
| `GET /auth/pending` | Trang “đang chờ duyệt”. |
| `POST /auth/login` | `{email, password}` → đặt cookie phiên. |
| `POST /auth/register` | `{email, full_name, password}` → `200` + cookie (người đầu tiên) hoặc `202` (chờ duyệt). |
| `GET /auth/google` → `GET /auth/callback` | OAuth 2.0 + PKCE với Google. |
| `GET /auth/me` | Người dùng hiện tại (`email, full_name, is_admin, status…`). |
| `GET /logout`, `POST /auth/logout` | Đăng xuất. |
| `GET /admin/users[?status=pending]` | *(Admin)* danh sách thành viên. |
| `POST /admin/users/{email}` | *(Admin)* `{action}`: `approve`, `disable`, `make_admin`, `revoke_admin`, `delete`. |

Trong giao diện, Quản trị viên thấy mục **Thành viên** ở thanh bên (kèm số người
chờ duyệt); trên điện thoại nằm trong **Cài đặt**.

## Lưu trữ (Redis)

| Khoá | Nội dung |
|---|---|
| `vonia:user:{email}` | Hồ sơ JSON (họ tên, trạng thái, is_admin, băm mật khẩu, nguồn đăng nhập…). |
| `vonia:users` | ZSET email theo thời điểm đăng ký. |
| `vonia:bootstrap_admin` | Email Quản trị viên đầu tiên (`SET NX` — hai người đăng ký cùng lúc chỉ một người thắng). |
| `vonia:sess:{sha256(token)}` | Phiên — lưu **băm** của token, 30 ngày kể từ lần dùng cuối. |
| `vonia:loginfail:{email}` | Bộ đếm sai mật khẩu, TTL 15 phút. |

Mật khẩu băm PBKDF2-SHA256 600.000 vòng, định dạng
`pbkdf2-sha256$<vòng>$<muối>$<băm>` — trùng với SSTC-HUB-APP.

Để đặt lại Quản trị viên từ đầu (ví dụ môi trường thử): xoá `vonia:bootstrap_admin`
và các khoá `vonia:user:*` trong Redis.
