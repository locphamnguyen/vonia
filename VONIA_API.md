# Vonia TTS API — hướng dẫn tích hợp

Text-to-speech đa ngôn ngữ. Chọn giọng theo ngôn ngữ:

- **Tiếng Việt → giọng `nhatnam`** (giọng đã đăng ký, dùng `voice_id`).
- **Tiếng Anh → giọng `Alnitak`** (preset voice-design, dùng `instruct` + `seed`).

## Kết nối

- **Base URL:** `https://vonia.locnguyendata.com`
- **Auth:** mọi request (trừ `/health`) phải kèm API key, qua **một trong hai** header:
  - `X-API-Key: <API_KEY>`
  - `Authorization: Bearer <API_KEY>`  ← chuẩn OpenAI, dùng được cho OpenAI SDK
- **API key:** `<API_KEY>` — key thật KHÔNG ghi trong tài liệu này (repo có remote
  upstream công khai). Có hai loại key:
  - **Key cá nhân (khuyến nghị):** đăng nhập giao diện → mục **Webhook** → thẻ **API key**
    → đặt tên rồi bấm **Tạo API key**. Key dạng `vonia_…`, chỉ hiện một lần lúc tạo;
    thu hồi được bất cứ lúc nào, và tự ngừng chạy khi tài khoản chủ key bị khoá.
    Mỗi tài khoản tối đa 20 key.
  - **Key cố định của server:** biến môi trường `VONIA_API_KEYS` (phân tách bằng dấu phẩy).

Không có key hoặc key sai → HTTP 401 `{"error":{"message":"Authentication required."}}`.

## Endpoint chính: `POST /tts` (khuyến nghị)

Body JSON:

| Field | Mô tả |
|-------|-------|
| `text` | **(bắt buộc)** Văn bản cần đọc |
| `voice_id` | Giọng đã đăng ký (vd `"nhatnam"`) — dùng cho tiếng Việt |
| `instruct` | Mô tả giọng voice-design (vd `"male, low pitch"`) — dùng cho Alnitak |
| `seed` | Số để cố định danh tính giọng voice-design (cùng seed → cùng giọng) |
| `language` | Mã/tên ngôn ngữ: `"vi"`, `"en"`… (bỏ trống = tự nhận) |
| `response_format` | `wav` (mặc định) \| `mp3` \| `pcm` |
| `speed` | `>1.0` nhanh hơn, `<1.0` chậm hơn |
| `normalize` | `true` để chuẩn hoá text (số, ký hiệu…) trước khi đọc |

Trả về: file audio nhị phân (`audio/wav` hoặc `audio/mpeg`).

### Tiếng Việt — giọng `nhatnam`

```bash
curl -X POST https://vonia.locnguyendata.com/tts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY>" \
  -d '{"text":"Xin chào, đây là giọng Nhật Nam.","voice_id":"nhatnam","language":"vi","response_format":"mp3"}' \
  -o vi.mp3
```

### Tiếng Anh — giọng `Alnitak`

Alnitak là preset (nam, ấm, trầm). Áp dụng bằng `instruct:"male, low pitch"` **kèm** `seed:210516940`
— seed cố định để mỗi lần gọi đều ra đúng giọng Alnitak.

```bash
curl -X POST https://vonia.locnguyendata.com/tts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API_KEY>" \
  -d '{"text":"Hello, this is the Alnitak voice.","instruct":"male, low pitch","seed":210516940,"language":"en","response_format":"mp3"}' \
  -o en.mp3
```

## Python (requests)

```python
import requests

API = "https://vonia.locnguyendata.com"
KEY = "<API_KEY>"
H = {"X-API-Key": KEY}

def tts(payload, out):
    r = requests.post(f"{API}/tts", headers=H, json=payload, timeout=120)
    r.raise_for_status()
    open(out, "wb").write(r.content)

# Tiếng Việt — nhatnam
tts({"text": "Xin chào, đây là giọng Nhật Nam.",
     "voice_id": "nhatnam", "language": "vi", "response_format": "mp3"}, "vi.mp3")

# Tiếng Anh — Alnitak
tts({"text": "Hello, this is the Alnitak voice.",
     "instruct": "male, low pitch", "seed": 210516940,
     "language": "en", "response_format": "mp3"}, "en.mp3")
```

## Endpoint tương thích OpenAI: `POST /v1/audio/speech`

Body: `model`, `input` (text), `voice`, `response_format` (mặc định `mp3`), `speed`, `instruct`, `language`.

```python
from openai import OpenAI
client = OpenAI(base_url="https://vonia.locnguyendata.com/v1",
                api_key="<API_KEY>")

# Tiếng Việt — nhatnam
client.audio.speech.create(model="Vonia", voice="nhatnam",
                           input="Xin chào").stream_to_file("vi.mp3")
```

⚠️ **Lưu ý về Alnitak qua endpoint này:** `/v1/audio/speech` **không hỗ trợ `seed`**, nên giọng
voice-design (Alnitak) sẽ **không ổn định** giữa các lần gọi. Muốn giọng Alnitak ổn định cho tiếng Anh,
hãy dùng `POST /tts` với `instruct` + `seed` như trên.

## Endpoint phụ (tham khảo)

- `GET /v1/voices` — liệt kê giọng đã đăng ký (kèm API key).
- `GET /v1/presets` — danh sách giọng preset (Alnitak nằm ở đây, id `fac_8c8c3bcb`).
- `GET /health` — kiểm tra sống (không cần key).
