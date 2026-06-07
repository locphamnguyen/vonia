# OmniVoice HTTP API

Tài liệu chi tiết cho server API của OmniVoice (`omnivoice-serve`).

Server cung cấp **2 nhóm API**:
- **REST tùy biến** (`/tts`, `/tts/upload`, `/v1/voices`…) — đầy đủ 3 chế độ và mọi tham số sinh.
- **OpenAI-compatible** (`/v1/audio/speech`, `/v1/models`) — dùng lại client OpenAI/Higgs có sẵn.

**Mục lục**: [Khởi động](#khởi-động) · [Khái niệm](#khái-niệm) · [Định dạng âm thanh](#định-dạng-âm-thanh) · [Tham khảo endpoint](#tham-khảo-endpoint) · [Lỗi](#lỗi) · [Ví dụ client](#ví-dụ-client) · [Postman](#postman) · [Xử lý sự cố](#xử-lý-sự-cố)

---

## Khởi động

```bash
cd /root/0project/OmniVoice
export PATH="$HOME/.local/bin:$PATH"

# Cài dependency cho server (1 lần)
uv pip install fastapi "uvicorn[standard]" python-multipart
uv pip install vinorm           # tùy chọn: cần cho normalize tiếng Việt

# Chạy server
uv run omnivoice-serve --port 8002
# hoặc: uv run python -m omnivoice.cli.serve --port 8002
```

Mặc định lắng nghe `http://0.0.0.0:8002` (chọn 8002 để tránh đụng server Higgs ở 8000). Model nạp lúc khởi động (~1 phút lần đầu do tải checkpoint), khi log in `Serving on http://...` là sẵn sàng.

### Tham số dòng lệnh

| Cờ | Mặc định | Ý nghĩa |
|---|---|---|
| `--model` | `k2-fsa/OmniVoice` | Đường dẫn checkpoint hoặc repo HuggingFace |
| `--host`, `--ip` | `0.0.0.0` | Địa chỉ bind |
| `--port` | `8002` | Cổng bind |
| `--device` | auto | `cuda` / `cuda:0` / `mps` / `xpu` / `cpu` |
| `--dtype` | `float16` | `float16` / `float32` / `bfloat16` (CPU tự ép float32) |
| `--voices-dir` | `~/.cache/omnivoice/voices` | Nơi lưu voice library |
| `--normalizer` | `omnivoice.server.norm_vi:normalize` | Bộ chuẩn hóa text. Đặt `""` để tắt |
| `--max-concurrency` | `1` | Số request sinh đồng thời trên GPU |
| `--max-queue` | `32` | Số request chờ tối đa trước khi trả 503 |
| `--load-asr` | tắt | Nạp sẵn Whisper lúc khởi động (mặc định nạp lazy) |

> **Không có xác thực** (auth) mặc định. Hãy đặt sau reverse proxy / firewall nếu mở ra ngoài.

---

## Khái niệm

### 3 chế độ sinh (mode được suy tự động)
1. **Voice cloning** — clone giọng từ audio mẫu. Cung cấp `voice_id` (giọng đã đăng ký) **hoặc** `ref_audio` (+ `ref_text` tùy chọn).
2. **Voice design** — mô tả giọng bằng `instruct` (vd `"female, british accent"`), không cần audio mẫu.
3. **Auto** — không cung cấp gì, model tự chọn giọng.

Thứ tự ưu tiên khi resolve: `voice_id` → `ref_audio` → `instruct` → auto.

### Voice library
Đăng ký giọng mẫu có tên qua `POST /v1/voices` → nhận `voice_id` (slug từ tên). Server **cache `VoiceClonePrompt`** trong RAM và lưu file mẫu + metadata ra `--voices-dir`, nên:
- Request sau chỉ cần `voice_id` (không upload lại, không chạy lại Whisper).
- Giọng **sống qua restart** (prompt được dựng lại từ file đã lưu trong lần dùng đầu).

### Chuẩn hóa text (tùy chọn)
Đặt `normalize: true` trong request để chạy text qua bộ chuẩn hóa của server trước khi tổng hợp. Mặc định dùng `omnivoice.server.norm_vi` (vinorm + từ điển phát âm) cho tiếng Việt: `155.000`→"một trăm năm mươi lăm nghìn", `85%`→"tám mươi lăm phần trăm", v.v. Nếu thiếu `vinorm`, request có `normalize:true` trả **400**; các request khác không ảnh hưởng.

### Đồng thời & GPU
Một model duy nhất trên GPU. Mọi việc dùng GPU (sinh audio **và** dựng voice prompt) được **xếp hàng** qua semaphore (`--max-concurrency`, mặc định 1) → không tranh VRAM/không OOM. Quá `max-concurrency + max-queue` → **503**.

---

## Định dạng âm thanh

| `response_format` | Content-Type | Ghi chú |
|---|---|---|
| `wav` | `audio/wav` | PCM 16-bit, 24 kHz, mono (mặc định cho `/tts`) |
| `mp3` | `audio/mpeg` | qua ffmpeg/pydub (mặc định cho `/v1/audio/speech`) |
| `pcm` | `audio/pcm` | PCM 16-bit thô (không header), 24 kHz, mono |

Sample rate luôn là `24000` Hz (xem `GET /v1/info`).

---

## Tham khảo endpoint

### Hệ thống

#### `GET /health`
Trạng thái server, thiết bị, VRAM, độ sâu hàng đợi.
```json
{"status":"ok","model":"k2-fsa/OmniVoice","device":"cuda","sampling_rate":24000,
 "queue_depth":0,"max_concurrency":1,
 "vram":{"free_mb":21755,"used_mb":2229,"total_mb":23984}}
```

#### `GET /v1/info`
Thông tin model, các `response_format` hỗ trợ, normalizer đang cấu hình, và giá trị mặc định của tham số sinh.

#### `GET /v1/models`
Liệt kê model theo dạng OpenAI (`{"object":"list","data":[{"id":...}]}`).

---

### TTS (REST tùy biến)

#### `POST /tts`
Body **JSON**. Trả về **audio nhị phân** (Content-Type theo `response_format`). Thêm query `?json=1` để trả JSON base64.

| Trường | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `text` | string | **bắt buộc** | Văn bản cần đọc |
| `language` | string | null | Tên (`"Vietnamese"`/`"English"`) hoặc mã (`"vi"`/`"en"`). Bỏ trống = tự nhận |
| `voice_id` | string | null | Giọng đã đăng ký (chế độ clone) |
| `ref_audio` | string | null | Audio mẫu **base64** (chế độ clone, nếu không dùng voice_id) |
| `ref_text` | string | null | Transcript của `ref_audio` (bỏ trống = Whisper tự nhận) |
| `instruct` | string | null | Thuộc tính giọng (chế độ design), vd `"male, british accent"` |
| `speed` | float | null | `>1.0` nhanh hơn, `<1.0` chậm hơn |
| `duration` | float | null | Cố định độ dài (giây), ghi đè `speed` |
| `normalize` | bool | false | Chạy bộ chuẩn hóa text trước |
| `response_format` | string | `wav` | `wav` / `mp3` / `pcm` |
| `num_step` | int | 32 | Số bước diffusion (16 cho nhanh) |
| `guidance_scale` | float | 2.0 | CFG scale |
| `t_shift` | float | 0.1 | Time-step shift |
| `denoise` | bool | true | Thêm token `<\|denoise\|>` |
| `postprocess_output` | bool | true | Bỏ khoảng lặng, fade, pad |
| `layer_penalty_factor` | float | 5.0 | Ưu tiên unmask codebook sớm |
| `position_temperature` | float | 5.0 | Nhiệt độ chọn vị trí |
| `class_temperature` | float | 0.0 | Nhiệt độ sampling (0 = greedy) |
| `audio_chunk_duration` | float | 15.0 | Độ dài mỗi chunk khi text dài (giây) |
| `audio_chunk_threshold` | float | 30.0 | Ngưỡng kích hoạt chia chunk (giây) |

Ví dụ:
```bash
curl -X POST localhost:8002/tts -H 'Content-Type: application/json' \
  -d '{"text":"Xin chào.","voice_id":"nhatnam","normalize":true,"num_step":16}' \
  -o out.wav
```

#### `POST /tts/upload`
Giống `/tts` nhưng nhận **multipart/form-data** để upload `ref_audio` trực tiếp (không cần base64). Các field: `text` (bắt buộc), `file` (audio mẫu), `language`, `voice_id`, `ref_text`, `instruct`, `speed`, `duration`, `normalize`, `num_step`, `guidance_scale`, `response_format`. Query `?json=1` để trả base64.

```bash
curl -X POST localhost:8002/tts/upload \
  -F text="Bản clone từ file upload." \
  -F file=@ref.wav -F response_format=mp3 -o out.mp3
```

---

### Voice Library

#### `POST /v1/voices` — đăng ký giọng
**multipart/form-data**.

| Field | Kiểu | Mô tả |
|---|---|---|
| `name` | string | Tên giọng (sinh `voice_id` = slug) |
| `file` | file | Audio mẫu (3–10s là tốt nhất) |
| `ref_text` | string? | Transcript mẫu (bỏ trống = Whisper tự nhận) |
| `overwrite` | bool | Ghi đè nếu trùng `voice_id` (mặc định false → 409) |

```bash
curl -X POST localhost:8002/v1/voices \
  -F name=nhatnam -F file=@"Giong Nhat Nam.wav"
# -> {"id":"nhatnam","name":"nhatnam","has_ref_text":false,"created":"..."}
```

#### `GET /v1/voices` — liệt kê · `GET /v1/voices/{id}` — chi tiết · `DELETE /v1/voices/{id}` — xóa

---

### OpenAI-compatible

#### `POST /v1/audio/speech`
Tương thích `audio.speech` của OpenAI. Body **JSON**, trả **audio nhị phân** (mặc định `mp3`).

| Trường | Kiểu | Mô tả |
|---|---|---|
| `model` | string | Bỏ qua về mặt định tuyến (chỉ để tương thích) |
| `input` | string | **bắt buộc** — text cần đọc |
| `voice` | string | `voice_id` đã đăng ký; **nếu không tồn tại** sẽ coi là `instruct` (voice design); `"auto"`/rỗng = auto |
| `response_format` | string | `wav` / `mp3` / `pcm` (mặc định `mp3`) |
| `speed` | float | Tốc độ |
| `instruct` | string | (mở rộng) thuộc tính giọng |
| `language` | string | (mở rộng) ngôn ngữ |
| `normalize` | bool | (mở rộng) chuẩn hóa text |

```bash
curl -X POST localhost:8002/v1/audio/speech -H 'Content-Type: application/json' \
  -d '{"model":"k2-fsa/OmniVoice","input":"Hello world","voice":"nhatnam","response_format":"mp3"}' \
  -o out.mp3
```

---

## Lỗi

Mọi lỗi trả JSON dạng:
```json
{"error": {"message": "...", "type": "..."}}
```

| HTTP | `type` | Khi nào |
|---|---|---|
| 400 | `invalid_request` | text rỗng, tham số sai, base64 hỏng |
| 400 | `normalizer_error` | `normalize:true` nhưng thiếu vinorm/normalizer lỗi |
| 404 | `voice_not_found` | `voice_id` không tồn tại |
| 409 | `voice_exists` | đăng ký trùng tên mà không `overwrite` |
| 503 | `queue_full` | vượt `max-concurrency + max-queue` |

---

## Ví dụ client

### Python (requests)
```python
import requests
r = requests.post("http://localhost:8002/tts", json={
    "text": "Xin chào từ Python.", "voice_id": "nhatnam",
    "normalize": True, "num_step": 16,
})
open("out.wav", "wb").write(r.content)
```

### Python (OpenAI SDK)
```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8002/v1", api_key="not-needed")
client.audio.speech.create(
    model="k2-fsa/OmniVoice", voice="nhatnam", input="Hello world",
).stream_to_file("out.mp3")
```

### JavaScript (fetch)
```js
const res = await fetch("http://localhost:8002/tts", {
  method: "POST", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({ text: "Xin chào.", voice_id: "nhatnam", response_format: "mp3" }),
});
const buf = await res.arrayBuffer();
require("fs").writeFileSync("out.mp3", Buffer.from(buf));
```

---

## Postman

Import file [OmniVoice-API.postman_collection.json](OmniVoice-API.postman_collection.json) (cùng thư mục `docs/`). Collection có sẵn:
- Biến `base_url` (mặc định `http://localhost:8002`) và `voice_id`.
- Mọi endpoint, kèm **mô tả chi tiết từng request** ngay trong Postman.
- Body mẫu cho JSON và form-data (chỉ cần chọn file cho phần upload).

---

## Xử lý sự cố

- **CUDA out of memory khi khởi động**: GPU đang bị chiếm (vd server Higgs ở cổng 8000 dùng ~21GB). Giải phóng VRAM trước, hoặc chạy server này khi GPU rảnh. Server chỉ cần ~2–3GB.
- **`normalize:true` trả 400**: chưa cài `vinorm` → `uv pip install vinorm`. Hoặc tắt bằng `--normalizer ""`.
- **Request thứ 2 chậm gấp đôi**: đúng thiết kế — GPU xử lý tuần tự (`--max-concurrency 1`). Tăng nếu VRAM đủ.
- **Giọng mất sau restart**: kiểm tra `--voices-dir` và quyền ghi; file `index.json` + `<id>/ref.wav` phải còn.
