# Hướng dẫn cài đặt & vận hành — Vonia Voice Studio

Tài liệu này hướng dẫn **cài đặt từ đầu**, **chạy nền vĩnh viễn** và **vận hành** Vonia Voice Studio — giao diện web cho hệ thống TTS OmniVoice (sao chép giọng nói, văn bản → giọng nói, hội thoại nhiều giọng, giọng nói → văn bản) kèm thanh toán SePay.

> Phần thanh toán SePay có tài liệu riêng, chi tiết hơn: [payment-integration.md](payment-integration.md).

---

## Mục lục
1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Yêu cầu hệ thống](#2-yêu-cầu-hệ-thống)
3. [Cài đặt từ đầu](#3-cài-đặt-từ-đầu)
4. [Tham chiếu biến môi trường `.env`](#4-tham-chiếu-biến-môi-trường-env)
5. [Chạy nền vĩnh viễn với systemd](#5-chạy-nền-vĩnh-viễn-với-systemd)
6. [Public URL qua Cloudflare Tunnel](#6-public-url-qua-cloudflare-tunnel)
7. [Vận hành hằng ngày](#7-vận-hành-hằng-ngày)
8. [Cập nhật / triển khai phiên bản mới](#8-cập-nhật--triển-khai-phiên-bản-mới)
9. [Cấu hình các tính năng](#9-cấu-hình-các-tính-năng)
10. [Kiểm tra sức khỏe hệ thống](#10-kiểm-tra-sức-khỏe-hệ-thống)
11. [Xử lý sự cố](#11-xử-lý-sự-cố)
12. [⚠️ Cảnh báo riêng cho máy Olares/k3s](#12-️-cảnh-báo-riêng-cho-máy-olaresk3s)
13. [Bảo mật](#13-bảo-mật)

---

## 1. Tổng quan kiến trúc

```
  Trình duyệt người dùng
          │  HTTPS
          ▼
  Cloudflare Tunnel  (cloudflared.service)
   vonia.locnguyendata.com
          │  → 127.0.0.1:8002
          ▼
  FastAPI server  (omnivoice-serve, cổng 8002)   ← systemd: vonia.service
   ├─ REST API:  /tts, /v1/voices, /v1/stt, /v1/presets, /payment/*, /health …
   ├─ Giao diện web tĩnh phục vụ tại "/"  (thư mục omnivoice/server/webdist)
   └─ Model OmniVoice nạp 1 lần trên GPU  (k2-fsa/OmniVoice)
```

| Thành phần | Mô tả | Vị trí |
|---|---|---|
| **Backend** | Server FastAPI `omnivoice-serve`, cổng 8002. Cung cấp toàn bộ API và phục vụ luôn giao diện web. | [omnivoice/server/](../omnivoice/server/) |
| **Frontend** | Ứng dụng Vite + React + TypeScript, **build ra tĩnh** rồi nhúng vào backend. | [web/](../web/) → `omnivoice/server/webdist/` |
| **Model** | OmniVoice (`k2-fsa/OmniVoice`), tải tự động từ HuggingFace, nạp trên GPU (~2.2 GB VRAM ở float16). | HF cache: `~/.cache/huggingface` |
| **Tunnel** | `cloudflared` đưa cổng nội bộ 8002 ra HTTPS công khai. | `cloudflared.service` |
| **Quản lý tiến trình** | `systemd` đảm bảo tự chạy khi boot + tự bật lại khi crash. | `/etc/systemd/system/vonia.service` |
| **Đăng nhập** | Một tài khoản dùng chung (cookie phiên + HTTP Basic), bảo vệ toàn bộ trừ webhook. | [omnivoice/server/auth.py](../omnivoice/server/auth.py) |

---

## 2. Yêu cầu hệ thống

| Hạng mục | Yêu cầu tối thiểu | Khuyến nghị |
|---|---|---|
| Hệ điều hành | Linux (x86_64) | Ubuntu 22.04+ |
| GPU | NVIDIA + driver CUDA (chạy CPU được nhưng **rất chậm**) | ≥ 12 GB VRAM |
| Python | ≥ 3.10 | 3.12 |
| Trình quản lý gói | [uv](https://docs.astral.sh/uv/) | uv ≥ 0.11 |
| Node.js + npm | Node ≥ 18 (để build giao diện) | Node 20 LTS |
| Đĩa trống | ~10 GB (model + thư viện) | 20 GB+ |
| Mạng | Cần internet để tải model HuggingFace lần đầu | |

> **VRAM:** model TTS chỉ chiếm ~2.2 GB. Phần còn lại để dành cho ASR/Whisper (khi dùng STT) và headroom. Có thể **tự giải phóng VRAM khi nhàn rỗi** (mục [9](#9-cấu-hình-các-tính-năng)).

### Môi trường đã kiểm chứng (bản đang chạy)

| | Phiên bản |
|---|---|
| GPU | NVIDIA GeForce RTX 5090 Laptop, 24 GB, driver 590.44.01 |
| PyTorch / CUDA | torch 2.8.0+cu128 / CUDA 12.8 |
| Python (venv) | 3.12.3 |
| uv | 0.11.19 |
| Node / npm | v20.18.1 / 10.8.2 |

---

## 3. Cài đặt từ đầu

> Các lệnh dưới giả định mã nguồn đặt tại `/root/0project/OmniVoice`. Thay đường dẫn nếu khác.

### 3.1. Lấy mã nguồn

```bash
git clone <repo-url> /root/0project/OmniVoice
cd /root/0project/OmniVoice
```

### 3.2. Cài uv (nếu chưa có)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"      # thêm vào ~/.bashrc cho lần sau
uv --version
```

### 3.3. Cài thư viện Python (kèm extras `serve` + `vi`)

```bash
# Đồng bộ toàn bộ phụ thuộc + nhóm phục vụ API (FastAPI/uvicorn) + chuẩn hoá tiếng Việt
uv sync --extra serve --extra vi

# Kiểm tra GPU đã nhận chưa
uv run python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.version.cuda)"
```

Nếu in ra `CUDA: False` (đang dùng wheel CPU), cài lại PyTorch đúng phiên bản CUDA của máy:

```bash
# Ví dụ cho CUDA 12.8 — xem https://pytorch.org/get-started/locally/ cho bản khác
uv pip install torch==2.8.0+cu128 torchaudio==2.8.0+cu128 \
  --index-url https://download.pytorch.org/whl/cu128
```

### 3.4. Tải model

Model `k2-fsa/OmniVoice` **tự động tải** từ HuggingFace ở lần chạy đầu tiên (lưu vào `~/.cache/huggingface`). Nếu khó kết nối HuggingFace, dùng mirror:

```bash
export HF_ENDPOINT="https://hf-mirror.com"
```

### 3.5. Tạo file cấu hình `.env`

Tạo file `.env` ở thư mục gốc dự án. **Tuyệt đối không commit file này** (đã nằm trong `.gitignore`).

```bash
# === Đăng nhập (BẮT BUỘC để bảo vệ ứng dụng) ===
VONIA_AUTH_USER=ban@email.com
VONIA_AUTH_PASS=doi-mat-khau-manh
VONIA_SESSION_SECRET=<chuỗi ngẫu nhiên 64 ký tự>   # sinh bằng: openssl rand -hex 32

# === Mạng / giới hạn ===
VONIA_CORS_ORIGINS=https://vonia.locnguyendata.com   # "*" cho dev; domain thật khi production
VONIA_MAX_UPLOAD_MB=25
VONIA_PUBLIC_URL=https://vonia.locnguyendata.com

# === Tự động giải phóng VRAM khi nhàn rỗi (0 = tắt) ===
VONIA_VRAM_IDLE_MINUTES=0

# === Thanh toán SePay — xem payment-integration.md ===
# (Để trống nếu chưa dùng thanh toán)
```

> Xem **bảng đầy đủ** ở mục [4](#4-tham-chiếu-biến-môi-trường-env). Phần SePay (merchant, webhook, VietQR) xem [payment-integration.md](payment-integration.md).

Sinh nhanh `VONIA_SESSION_SECRET`:

```bash
openssl rand -hex 32
```

### 3.6. Build giao diện web

```bash
cd web
npm install
npm run deploy      # = vite build + copy dist → ../omnivoice/server/webdist
cd ..
```

Lệnh `npm run deploy` build bản production rồi copy vào `omnivoice/server/webdist/` để backend phục vụ tại `/`.

### 3.7. Chạy thử

```bash
export PATH="$HOME/.local/bin:$PATH"
uv run omnivoice-serve --host 127.0.0.1 --port 8002
```

Khi thấy log `Serving on http://127.0.0.1:8002` và `Model ready on cuda` là thành công. Mở thử (ở cửa sổ khác):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8002/health   # 401 = đang chạy (cần đăng nhập), OK
```

Dừng thử bằng `Ctrl+C`. Bước tiếp theo: biến nó thành dịch vụ chạy nền (mục [5](#5-chạy-nền-vĩnh-viễn-với-systemd)).

---

## 4. Tham chiếu biến môi trường `.env`

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `VONIA_AUTH_USER` | Nên có | (trống → **tắt đăng nhập**) | Tên đăng nhập (email). Nếu trống, ai cũng truy cập được. |
| `VONIA_AUTH_PASS` | Nên có | — | Mật khẩu đăng nhập. |
| `VONIA_SESSION_SECRET` | Nên có | sinh ngẫu nhiên mỗi lần khởi động | Khoá ký cookie phiên. **Đặt cố định** để không bị đăng xuất sau mỗi lần restart. |
| `VONIA_CORS_ORIGINS` | Không | `*` | Origin được phép gọi API. Production nên đặt domain thật. |
| `VONIA_MAX_UPLOAD_MB` | Không | `25` | Giới hạn dung lượng file upload (MB). |
| `VONIA_PUBLIC_URL` | Không | — | URL công khai, dùng dựng link callback thanh toán. |
| `VONIA_VRAM_IDLE_MINUTES` | Không | `0` | Mặc định số phút nhàn rỗi trước khi giải phóng VRAM (0 = tắt). Có thể chỉnh trong giao diện. |
| `VONIA_BILLING_DIR` | Không | `~/.cache/omnivoice/billing` | Nơi lưu đơn hàng/subscription (JSON). |
| `SEPAY_*` | Không | — | Cấu hình thanh toán SePay — xem [payment-integration.md](payment-integration.md). |
| `HF_ENDPOINT` | Không | HuggingFace gốc | Mirror tải model, ví dụ `https://hf-mirror.com`. |

> Quy tắc: biến đã có sẵn trong môi trường shell **được ưu tiên** hơn `.env` (tiện override khi chạy CLI).

### Tham số dòng lệnh `omnivoice-serve`

| Cờ | Mặc định | Ý nghĩa |
|---|---|---|
| `--host` / `--ip` | `0.0.0.0` | Địa chỉ bind. Dùng `127.0.0.1` khi đứng sau tunnel/proxy. |
| `--port` | `8002` | Cổng (8002 để tránh đụng Higgs ở 8000). |
| `--device` | tự dò | `cuda` / `cuda:0` / `mps` / `xpu` / `cpu`. |
| `--dtype` | `float16` | `float16` / `float32` / `bfloat16`. |
| `--voices-dir` | `~/.cache/omnivoice/voices` | Nơi lưu giọng đã sao chép. |
| `--max-concurrency` | `1` | **Giữ nguyên 1** — model không thread-safe. |
| `--max-queue` | `32` | Số request chờ tối đa trước khi trả 503. |
| `--load-asr` | tắt | Nạp sẵn Whisper lúc khởi động (mặc định nạp lười khi cần STT). |
| `--web-dir` | `webdist` nếu có | Thư mục giao diện web để phục vụ tại `/`. |

---

## 5. Chạy nền vĩnh viễn với systemd

Để dịch vụ **tự khởi động khi máy bật** và **không tắt khi đóng phiên SSH/terminal**, dùng systemd.

### 5.1. Tạo unit file

Tạo `/etc/systemd/system/vonia.service`:

```ini
[Unit]
Description=Vonia Voice Studio (OmniVoice TTS API + web UI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/0project/OmniVoice
Environment=HOME=/root
Environment=PATH=/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/root/.local/bin/uv run omnivoice-serve --host 127.0.0.1 --port 8002
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> Điều chỉnh `User`, `WorkingDirectory`, đường dẫn `uv` cho đúng máy của bạn. `Restart=always` đảm bảo crash sẽ tự bật lại sau 5 giây.

### 5.2. Kích hoạt

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vonia.service     # enable = tự chạy khi boot; --now = chạy luôn
sudo systemctl status vonia.service           # kiểm tra: active (running), enabled
```

Đầu ra mong đợi:
```
● vonia.service - Vonia Voice Studio (OmniVoice TTS API + web UI)
     Loaded: loaded (/etc/systemd/system/vonia.service; enabled; …)
     Active: active (running)
```

Từ giờ dịch vụ **độc lập với phiên đăng nhập** và **tự lên sau reboot**.

---

## 6. Public URL qua Cloudflare Tunnel

URL công khai `https://vonia.locnguyendata.com` được đưa ra bởi **cloudflared** (chạy bằng token, trỏ về `127.0.0.1:8002`). Nó cũng là một systemd service:

```bash
systemctl status cloudflared      # kiểm tra tunnel
systemctl is-enabled cloudflared  # nên là "enabled" → tự lên khi boot
```

> Vì cả `vonia.service` lẫn `cloudflared.service` đều `enabled`, sau khi máy khởi động lại **toàn bộ stack tự lên**: server chạy → tunnel kết nối → URL công khai hoạt động, không cần thao tác tay.

Cấu hình ánh xạ hostname → `localhost:8002` nằm trong dashboard Cloudflare Zero Trust (Tunnels). Nếu đổi cổng backend, sửa ở đó cho khớp.

---

## 7. Vận hành hằng ngày

```bash
systemctl status vonia       # trạng thái
systemctl restart vonia      # khởi động lại (dùng sau khi deploy code mới)
systemctl stop vonia         # dừng
systemctl start vonia        # chạy
systemctl disable vonia      # bỏ tự-chạy-khi-boot (không khuyến nghị)

# Xem log
journalctl -u vonia -f       # log trực tiếp (theo thời gian thực)
journalctl -u vonia -n 100   # 100 dòng gần nhất
journalctl -u vonia --since "10 min ago"
```

---

## 8. Cập nhật / triển khai phiên bản mới

```bash
cd /root/0project/OmniVoice
git pull                              # lấy code mới (nếu dùng git)

# Nếu phụ thuộc Python thay đổi:
uv sync --extra serve --extra vi

# Nếu sửa GIAO DIỆN (thư mục web/):
cd web && npm install && npm run deploy && cd ..

# Áp dụng thay đổi backend:
systemctl restart vonia
```

> **Lưu ý:** giao diện được phục vụ từ đĩa (`webdist`), nên sau `npm run deploy` thường chỉ cần **refresh trình duyệt** (Ctrl/Cmd+Shift+R) là thấy thay đổi giao diện. Chỉ cần `systemctl restart vonia` khi sửa **code backend** (Python).

---

## 9. Cấu hình các tính năng

### 9.1. Tự động giải phóng VRAM khi nhàn rỗi
- **Trong giao diện:** tab **Cấu hình** → mục "Tự động giải phóng VRAM" → chọn 5 / 10 / 15 phút (hoặc Không bao giờ).
- **Cơ chế:** quá N phút không tạo audio, model được chuyển sang CPU + dọn cache CUDA → trả lại VRAM. Request kế tiếp tự nạp lại model lên GPU (chậm thêm vài giây).
- **Mặc định lúc khởi động:** biến `VONIA_VRAM_IDLE_MINUTES`. Lựa chọn trong giao diện được lưu vào `~/.cache/omnivoice/runtime.json` (sống sót qua restart).
- **API:** `GET /v1/vram` (trạng thái), `POST /v1/vram {"idle_minutes": 5}` (đặt).

### 9.2. Thanh toán SePay
Xem tài liệu riêng: [payment-integration.md](payment-integration.md) — cấu hình VietQR + webhook, cổng thanh toán, gói cước, đăng ký IPN/webhook trên dashboard SePay.

### 9.3. Chuẩn hoá văn bản tiếng Việt
Đã bật sẵn qua extra `vi` (thư viện `vinorm`) và tham số `--normalizer`. Bật/tắt chuẩn hoá theo từng request bằng cờ `normalize` trong API.

---

## 10. Kiểm tra sức khỏe hệ thống

```bash
# 1) Đăng nhập lấy cookie
curl -s -c /tmp/ck.txt -X POST http://127.0.0.1:8002/login \
  --data-urlencode "username=$VONIA_AUTH_USER" \
  --data-urlencode "password=$VONIA_AUTH_PASS" -o /dev/null

# 2) Sức khỏe + GPU/VRAM
curl -s -b /tmp/ck.txt http://127.0.0.1:8002/health      # status, device, vram, offloaded
curl -s -b /tmp/ck.txt http://127.0.0.1:8002/v1/vram     # cấu hình giải phóng VRAM

# 3) Thử sinh audio
curl -s -b /tmp/ck.txt -X POST http://127.0.0.1:8002/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Xin chào","language":"Vietnamese","instruct":"female, moderate pitch"}' \
  -o /tmp/test.wav && echo "OK: $(stat -c%s /tmp/test.wav) bytes"
```

`GET /health` trả `"status":"ok"`, `device`, `vram`, `offloaded` → hệ thống bình thường.

---

## 11. Xử lý sự cố

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| API trả **401 Unauthorized** | Chưa đăng nhập hoặc sai `VONIA_AUTH_USER/PASS`. Đăng nhập qua `/login` để lấy cookie. Đây là hành vi **đúng** (đang được bảo vệ). |
| **Cổng 8002 đang bận** | `ss -lptn 'sport = :8002'` để tìm PID, rồi `kill <PID>`. Hoặc đổi `--port`. |
| **`CUDA: False`** | Driver NVIDIA chưa cài, hoặc đang dùng wheel CPU. Kiểm tra `nvidia-smi`; cài lại torch bản `+cuXXX` (mục [3.3](#33-cài-thư-viện-python-kèm-extras-serve--vi)). |
| **Tải model thất bại** | Mạng chặn HuggingFace. Đặt `export HF_ENDPOINT="https://hf-mirror.com"` rồi thử lại. |
| **Hết VRAM (OOM)** | Có tiến trình khác chiếm GPU (`nvidia-smi`). Bật tự-giải-phóng-VRAM, hoặc tắt model khác. |
| **Dịch vụ không lên sau reboot** | `systemctl status vonia` + `journalctl -u vonia -n 50`. Kiểm tra `enabled`, đường dẫn trong unit file đúng chưa. |
| **URL công khai chết, localhost vẫn chạy** | Vấn đề ở tunnel: `systemctl status cloudflared`, `journalctl -u cloudflared -n 50`. |
| **Giao diện cũ sau khi sửa** | Chưa `npm run deploy`, hoặc trình duyệt cache → Ctrl/Cmd+Shift+R. |
| **Mất dữ liệu khi chuyển tab** | Đã được sửa (tab giữ trạng thái). Nếu vẫn gặp, kiểm tra đã deploy bản web mới chưa. |

---

## 12. ⚠️ Cảnh báo riêng cho máy Olares/k3s

Máy này chạy **Olares trên k3s/containerd**. **TUYỆT ĐỐI KHÔNG** chạy các lệnh sau — chúng phá hỏng cấu hình containerd và làm sập Olares:

```bash
# ❌ KHÔNG chạy — bộ cài Docker tự động xung đột với Olares/k3s
curl get.docker.com | sh
# → thay bằng: apt install docker.io  (nếu thực sự cần Docker)

# ❌ KHÔNG chạy — ghi đè /etc/containerd/config.toml, tắt CRI plugin → sập k3s + Olares
nvidia-ctk runtime configure --runtime=containerd
# → bản an toàn duy nhất: nvidia-ctk runtime configure --runtime=docker
```

**Khôi phục khẩn cấp nếu containerd bị hỏng:**
```bash
cp -a /etc/containerd/config.toml.dpkg-old /etc/containerd/config.toml
systemctl restart containerd k3s
```

Trước mọi thao tác liên quan Docker / nvidia-ctk / containerd: kiểm tra lại mục này.

---

## 13. Bảo mật

- **Không commit `.env`** — đã nằm trong `.gitignore`. File chứa mật khẩu, khoá phiên, khoá SePay.
- **Đặt mật khẩu mạnh** cho `VONIA_AUTH_PASS` và cố định `VONIA_SESSION_SECRET` (`openssl rand -hex 32`).
- **Giới hạn CORS** ở production: đặt `VONIA_CORS_ORIGINS` đúng domain, không để `*`.
- **Bind nội bộ**: chạy server ở `127.0.0.1` và để Cloudflare Tunnel làm lớp public (không mở cổng 8002 ra internet trực tiếp).
- **Webhook SePay** được xác thực bằng API Key hoặc HMAC + chống tua lại — xem [payment-integration.md](payment-integration.md).

---

*Tài liệu liên quan:* [payment-integration.md](payment-integration.md) · [api.md](api.md) · [generation-parameters.md](generation-parameters.md) · [voice-design.md](voice-design.md)
