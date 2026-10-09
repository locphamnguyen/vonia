# Vonia Voice Studio 🎙️

**Phần mềm chuyển văn bản thành giọng nói (TTS) chạy ngay trên máy của bạn**: nhân bản giọng, đọc văn bản, hội thoại nhiều giọng, giọng nói sang văn bản và API cho lập trình viên. Có giao diện web tiếng Việt và cài được trên **Windows, macOS (MacBook chip M) và Linux**.

> **Model giọng nói: OmniVoice (default, powered by [k2-fsa/OmniVoice](https://github.com/k2-fsa/OmniVoice))**
> Vonia là giao diện và máy chủ API xây trên OmniVoice — model TTS zero-shot đa ngôn ngữ (hơn 600 ngôn ngữ) của nhóm k2-fsa. Phần lõi model trong thư mục `omnivoice/` được giữ đồng bộ với bản gốc (hiện tại **0.2.1**).

<p align="center">
  <a href="https://huggingface.co/k2-fsa/OmniVoice"><img src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-OmniVoice-FFD21E" alt="Hugging Face Model"></a>
  &nbsp;
  <a href="https://arxiv.org/abs/2604.00688"><img src="https://img.shields.io/badge/arXiv-OmniVoice-B31B1B.svg" alt="Paper"></a>
  &nbsp;
  <a href="https://github.com/k2-fsa/OmniVoice"><img src="https://img.shields.io/badge/GitHub-k2--fsa%2FOmniVoice-black?logo=github" alt="OmniVoice gốc"></a>
</p>

**Mục lục**: [Video hướng dẫn](#-video-hướng-dẫn) · [Tính năng](#-tính-năng) · [Yêu cầu máy](#-yêu-cầu-máy) · [Cài trên Windows](#-cài-đặt-trên-windows) · [Cài trên macOS](#-cài-đặt-trên-macos-macbook) · [Cài trên Linux](#-cài-đặt-trên-linux) · [Chạy & đăng nhập](#-chạy-vonia-và-đăng-nhập) · [Thông báo cập nhật](#-thông-báo-cập-nhật-và-gọi-về-trang-trung-tâm) · [Giọng có sẵn](#-giọng-có-sẵn-và-kho-giọng) · [API](#-api-cho-lập-trình-viên) · [Dùng OmniVoice bằng Python](#-dùng-thẳng-omnivoice-bằng-python) · [Xử lý sự cố](#-xử-lý-sự-cố) · [Bản quyền](#-bản-quyền-trích-dẫn-và-lưu-ý)

---

## 📺 Video hướng dẫn

| # | Nội dung | Xem trên YouTube |
|---|---|---|
| 1 | Nhân bản giọng nói (Voice Clone) chỉ với vài giây âm thanh mẫu | [youtu.be/gEeab9pnitE](https://youtu.be/gEeab9pnitE) |
| 2 | Tạo hội thoại nhiều giọng đọc từ kịch bản | [youtu.be/MeGyPMVkHTA](https://youtu.be/MeGyPMVkHTA) |
| 3 | Giọng nói sang văn bản và phụ đề SRT (Speech to Text) | [youtu.be/UMhGDZTyMoY](https://youtu.be/UMhGDZTyMoY) |
| 4 | Cài đặt môi trường: GPU, VRAM, model | [youtu.be/mUHs6dTabto](https://youtu.be/mUHs6dTabto) |
| 5 | Webhook API & API key — tạo giọng tự động từ phần mềm khác | [youtu.be/4CFR7VdBkDw](https://youtu.be/4CFR7VdBkDw) |

---

## ✨ Tính năng

**Giao diện Vonia**
- **Nhân bản giọng** từ một đoạn âm thanh mẫu 3–10 giây, lưu vào **Kho giọng** để dùng lại. Giọng đã lưu **vẫn còn sau khi khởi động lại** (prompt đã mã hoá được lưu ra đĩa, không phải chạy lại).
- **Văn bản → giọng nói**: nhập hoặc dán văn bản, mỗi dòng thành một câu có thể nghe lại, tạo lại, xuất file.
- **Hội thoại nhiều giọng**: dán kịch bản dạng `Tên: lời thoại`, tự nhận diện nhân vật và gán giọng.
- **Giọng nói → văn bản** bằng Whisper, xuất phụ đề **SRT**.
- **Đọc số tiếng Việt** đúng cách (2026 → "hai nghìn không trăm hai mươi sáu"), sửa phát âm.
- **Tự giải phóng VRAM** khi máy rảnh để GPU còn dùng việc khác.
- **API + API key cá nhân** (chuẩn OpenAI `Authorization: Bearer`), có trang Webhook trong giao diện.
- Đăng nhập Google hoặc email; người đăng ký đầu tiên là Quản trị viên.

**Từ model OmniVoice**
- Hỗ trợ **hơn 600 ngôn ngữ** ([danh sách](docs/languages.md)), có tiếng Việt.
- **Voice Design**: tạo giọng từ mô tả (giới tính, tuổi, cao độ, giọng thì thầm, accent…) mà không cần audio mẫu.
- **Ký hiệu biểu cảm** như `[laughter]`, `[sigh]`; sửa phát âm tiếng Anh bằng phiên âm CMU.
- Tốc độ nhanh: RTF thấp tới 0.025 (nhanh gấp 40 lần thời gian thực trên GPU mạnh).

---

## 💻 Yêu cầu máy

| Hạng mục | Tối thiểu | Khuyến nghị |
|---|---|---|
| Hệ điều hành | Windows 10/11, macOS 13+, Linux x86_64 | Windows 11, macOS 14+, Ubuntu 22.04+ |
| Phần cứng | Chạy được bằng CPU nhưng **rất chậm** | GPU NVIDIA ≥ 8 GB VRAM (Windows/Linux) hoặc MacBook chip **M1/M2/M3/M4** |
| Ổ đĩa trống | ~10 GB (model + thư viện) | 20 GB |
| Mạng | Cần internet để tải model lần đầu (vài GB) | |

Model TTS chiếm khoảng **2,2 GB VRAM** (float16); Whisper (dùng cho nhân bản giọng không nhập lời mẫu và Speech to Text) cần thêm khoảng 2 GB.

Script build tự cài mọi thứ còn thiếu: [uv](https://docs.astral.sh/uv/) (quản lý Python 3.12), [bun](https://bun.sh) (build giao diện web, nếu máy chưa có Node.js), thư viện Python theo `uv.lock`, và PyTorch đúng loại máy (CUDA 12.8 / Apple MPS / CPU).

---

## 🪟 Cài đặt trên Windows

**1. Cài công cụ cần có** (mở PowerShell):

```powershell
winget install --id Git.Git -e
winget install --id Gyan.FFmpeg -e
winget install --id Docker.DockerDesktop -e
```

- **Git** để tải mã nguồn, **FFmpeg** để xử lý âm thanh/video (xuất mp3, đọc file mp4…).
- **Docker Desktop** để chạy **Redis** (lưu tài khoản và phiên đăng nhập). Nếu chỉ dùng một mình trên máy, có thể bỏ qua và tắt đăng nhập (xem [mục chạy](#-chạy-vonia-và-đăng-nhập)).
- Có card NVIDIA: cập nhật **driver NVIDIA** mới nhất (driver hỗ trợ CUDA 12.8 trở lên). Không cần cài CUDA Toolkit riêng.

**2. Tải mã nguồn và build**:

```powershell
git clone https://github.com/locphamnguyen/vonia.git
cd vonia
.\build.cmd
```

`build.cmd` (hoặc `.\build.ps1`) sẽ:
1. Tự cài `uv` và `bun` nếu thiếu.
2. Cài Python 3.12 + thư viện vào `.venv` (torch CUDA 12.8 nếu có `nvidia-smi`, ngược lại bản CPU).
3. Build giao diện web vào `omnivoice/server/webdist`.
4. Tạo file `.env` từ `.env.example` (kèm khoá phiên ngẫu nhiên).
5. In ra thiết bị torch nhận được, ví dụ `cuda (NVIDIA GeForce RTX 4060)`.

Tuỳ chọn hữu ích: `.\build.cmd --download-model` (tải sẵn model), `--torch cpu` (ép bản CPU), `--skip-web` (không build lại giao diện).

**3. Chạy**: bấm đúp **`start-vonia.cmd`**. File này tự bật Docker Desktop + Redis, thêm FFmpeg vào PATH, chạy server và mở trình duyệt tại <http://127.0.0.1:8002> sau khoảng 20 giây.

> ⚠️ Đường dẫn thư mục nên **không có dấu tiếng Việt** và không quá dài, ví dụ `C:\vonia` hoặc `E:\0project\vonia`.

---

## 🍎 Cài đặt trên macOS (MacBook)

Hỗ trợ tốt nhất trên **MacBook chip Apple Silicon (M1–M4)** — model chạy bằng GPU qua **MPS**. Mac chip Intel chạy được bằng CPU nhưng chậm.

**1. Cài công cụ** (mở Terminal):

```bash
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git ffmpeg redis
brew services start redis
```

**2. Tải mã nguồn và build**:

```bash
git clone https://github.com/locphamnguyen/vonia.git
cd vonia
./build.sh
```

Trên macOS script luôn cài torch bản PyPI (có MPS). Cuối quá trình sẽ in `thiết bị: mps (Apple Silicon)`.

**3. Chạy** (file `.env` do build tạo sẵn đã trỏ `REDIS_URL=redis://127.0.0.1:6379`, khớp với Redis vừa cài):

```bash
.venv/bin/omnivoice-serve --host 127.0.0.1 --port 8002
```

Mở <http://127.0.0.1:8002>.

> 💡 Nếu muốn dùng `normalize_text` của OmniVoice cho tiếng Anh/Trung trên Mac, cần `conda install -c conda-forge pynini` trước khi cài nhóm `tn` (pynini chưa có wheel cho Apple Silicon). Vonia không cần phần này để đọc số tiếng Việt.

---

## 🐧 Cài đặt trên Linux

Ví dụ cho Ubuntu/Debian; các bản khác thay `apt` bằng trình quản lý gói tương ứng.

**1. Cài công cụ**:

```bash
sudo apt update
sudo apt install -y git curl unzip ffmpeg redis-server
sudo systemctl enable --now redis-server
```

Có GPU NVIDIA: cài driver (vd `sudo ubuntu-drivers autoinstall`, rồi khởi động lại) và kiểm tra bằng `nvidia-smi`.

**2. Tải mã nguồn và build**:

```bash
git clone https://github.com/locphamnguyen/vonia.git
cd vonia
./build.sh
```

**3. Chạy** (file `.env` do build tạo sẵn đã trỏ `REDIS_URL=redis://127.0.0.1:6379`, khớp với Redis vừa cài):

```bash
.venv/bin/omnivoice-serve --host 127.0.0.1 --port 8002
```

Muốn chạy nền khi khởi động máy (systemd), public ra Internet qua Cloudflare Tunnel, hay triển khai trên k3s: xem [docs/huong-dan-cai-dat-vonia.md](docs/huong-dan-cai-dat-vonia.md).

---

## ▶️ Chạy Vonia và đăng nhập

```bash
# Windows
.venv\Scripts\omnivoice-serve.exe --host 127.0.0.1 --port 8002
# macOS / Linux
.venv/bin/omnivoice-serve --host 127.0.0.1 --port 8002
```

- Gọi thẳng file trong `.venv` (không qua `uv run`) để giữ đúng bản torch đã chọn khi build.
- Lần đầu chạy, model `k2-fsa/OmniVoice` tự tải từ Hugging Face. Nếu bị chặn, đặt `HF_ENDPOINT=https://hf-mirror.com`.
- **Đăng nhập**: người đăng ký **đầu tiên** tự động là Quản trị viên; người sau phải được duyệt trong mục "Thành viên". Chi tiết: [docs/dang-ky-dang-nhap.md](docs/dang-ky-dang-nhap.md).
- Chỉ dùng một mình trên máy, không muốn cài Redis: thêm `VONIA_AUTH=off` vào `.env` (**chỉ dùng cục bộ**, không mở ra Internet).

Các tham số hay dùng của `omnivoice-serve`:

| Tham số | Ý nghĩa |
|---|---|
| `--port 8002` | Cổng web/API |
| `--device cuda` / `mps` / `cpu` | Chọn thiết bị (mặc định tự nhận) |
| `--voices-dir ~/.cache/omnivoice/voices` | Nơi lưu Kho giọng |
| `--load-asr` | Nạp sẵn Whisper khi khởi động |
| `--model k2-fsa/OmniVoice` | Model hoặc đường dẫn checkpoint |

Biến `.env` quan trọng: `VONIA_SESSION_SECRET`, `REDIS_URL`, `VONIA_ADMIN_EMAILS`, `GOOGLE_CLIENT_ID/SECRET`, `VONIA_VRAM_IDLE_MINUTES`, `VONIA_VI_NUMBERS`. Xem chú thích trong [.env.example](.env.example).

---

## 📣 Thông báo cập nhật và gọi-về trang trung tâm

Khi có bản mới hoặc tin cần biết, một **dải thông báo mỏng** hiện ở đầu vùng làm việc (ngay trên thanh tab) — trên điện thoại thì ngay dưới thanh tiêu đề. Không có gì để báo thì dải ẩn hẳn.

Để có thông báo, máy chủ Vonia định kỳ (30 giây sau khi khởi động, rồi mỗi 12 giờ) gọi về trang trung tâm của dự án và gửi **đúng hai thứ**:

| Trường | Là gì |
|---|---|
| `instanceId` | chuỗi ngẫu nhiên sinh lần đầu chạy, lưu ở Redis (`vonia:instance_id`; không có Redis thì ở tệp `~/.cache/omnivoice/instance_id`) — để đếm "một máy chủ = một bản cài" |
| `version` | số phiên bản Vonia đang chạy |

**Không gửi** gì về người dùng, tài khoản, giọng nói, văn bản hay cấu hình. Phía nhận **không lưu địa chỉ IP**. Máy chủ không có mạng ra ngoài thì bỏ qua êm, không ảnh hưởng gì. Đây là một phần của bản phát hành, **không có biến `.env` để tắt**. Mã ở `omnivoice/server/phone_home.py`, `omnivoice/server/announcement.py` và `web/src/components/ServerAnnouncementBanner.tsx`; phía nhận ở `deploy/phone-home-worker/`.

---

## 🗣️ Giọng có sẵn và Kho giọng

- Source đi kèm sẵn giọng **`nhatnam`** (giọng nam tiếng Việt) trong `omnivoice/server/bundled_voices/`. Lần đầu chạy, giọng này tự xuất hiện trong mục **"Giọng của bạn"** — không cần clone lại. Nếu bạn xoá, Vonia sẽ không tự thêm lại.
- Thêm giọng đi kèm khác: đặt `ref.wav` (đoạn mẫu ≤ 20 giây) và `prompt.pt` vào một thư mục con, rồi khai báo trong `bundled_voices/voices.json`.
- Mỗi giọng trong Kho được lưu ở `~/.cache/omnivoice/voices/<id>/` gồm `ref.*` (audio mẫu) và `prompt.pt` (prompt đã mã hoá). Sao lưu thư mục này là giữ được toàn bộ giọng.

> Mẹo clone giọng đẹp: dùng đoạn mẫu 3–10 giây, sạch tiếng ồn, và **nhập đúng lời** của đoạn mẫu (đủ dấu câu) để AI không đọc thừa chữ.

---

## 🔌 API cho lập trình viên

Tạo API key trong giao diện: **Webhook → API key → Tạo API key** (key dạng `vonia_…`, chỉ hiện một lần).

```bash
curl -X POST http://127.0.0.1:8002/tts \
  -H "Authorization: Bearer vonia_xxx" \
  -H "Content-Type: application/json" \
  -d '{"text": "Xin chào, đây là giọng đọc từ Vonia.", "voice_id": "nhatnam", "language": "vi"}' \
  --output xin-chao.wav
```

- Danh sách giọng: `GET /v1/voices` · Giọng preset: `GET /v1/presets` · Nhận dạng giọng nói: `POST /v1/stt` · Sức khoẻ: `GET /health`.
- Endpoint tương thích OpenAI: `POST /v1/audio/speech` (dùng được với OpenAI SDK).
- Tài liệu đầy đủ: [VONIA_API.md](VONIA_API.md), [docs/api.md](docs/api.md), Postman collection trong [docs/](docs/OmniVoice-API.postman_collection.json).

---

## 🐍 Dùng thẳng OmniVoice bằng Python

Sau khi build, `.venv` đã có gói `omnivoice`, dùng được ngoài giao diện:

```python
import torch
import soundfile as sf
from omnivoice import OmniVoice, VoiceClonePrompt

# device_map: "cuda:0" (NVIDIA), "mps" (MacBook chip M), "xpu" (Intel Arc), "cpu"
model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda:0", dtype=torch.float16)

# 1) Nhân bản giọng
audio = model.generate(
    text="Đây là giọng được nhân bản bằng OmniVoice.",
    language="vi",
    ref_audio="mau.wav",
    ref_text="Lời chính xác của đoạn âm thanh mẫu.",  # bỏ trống thì Whisper tự nghe (cần load_asr=True)
)
sf.write("clone.wav", audio[0], 24000)

# 2) Lưu prompt giọng để lần sau dùng lại, không phải mã hoá lại
prompt = model.create_voice_clone_prompt(ref_audio="mau.wav", ref_text="Lời chính xác của đoạn mẫu.")
prompt.save("giong-cua-toi.pt")
audio = model.generate(text="Dùng lại giọng đã lưu.", voice_clone_prompt=VoiceClonePrompt.load("giong-cua-toi.pt"))

# 3) Thiết kế giọng bằng mô tả (không cần audio mẫu)
audio = model.generate(text="Hello, this is voice design.", instruct="female, low pitch, british accent")

# 4) Để model tự chọn giọng
audio = model.generate(text="Câu này không có giọng mẫu.")
```

Tham số thường dùng: `num_step=32` (hoặc 16 để nhanh hơn), `speed=1.0`, `duration=10.0` (ép độ dài). Xem [docs/generation-parameters.md](docs/generation-parameters.md), [docs/voice-design.md](docs/voice-design.md), [docs/tips.md](docs/tips.md).

Công cụ dòng lệnh của OmniVoice cũng có sẵn trong `.venv`: `omnivoice-demo` (giao diện Gradio), `omnivoice-infer`, `omnivoice-infer-batch`, `omnivoice-merge-lora`. Huấn luyện/fine-tune (kể cả LoRA): [examples/](examples/), [docs/training.md](docs/training.md), [docs/lora_finetuning.md](docs/lora_finetuning.md).

---

## 🛠️ Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Build báo thiết bị `cpu (chậm)` dù có GPU NVIDIA | Cập nhật driver, kiểm tra `nvidia-smi`, rồi chạy lại `build --torch cuda` |
| `Redis connection refused` khi đăng nhập | Bật Redis (Docker / `brew services start redis` / `systemctl start redis-server`) và kiểm tra `REDIS_URL` trong `.env`; hoặc `VONIA_AUTH=off` khi dùng cục bộ |
| Tải model lỗi hoặc rất chậm | Đặt `HF_ENDPOINT=https://hf-mirror.com`; nếu có token thì đặt `HF_TOKEN` |
| Windows báo `WinError 1314` (symlink) khi tải model | Bật **Developer Mode** của Windows, hoặc chạy lại lệnh — lỗi thường chỉ xảy ra một lần |
| Hết VRAM (CUDA out of memory) | Bật tự giải phóng VRAM trong tab Cài đặt môi trường, đóng ứng dụng khác dùng GPU, dùng đoạn mẫu ngắn hơn |
| Giọng clone đọc thừa chữ ở đầu câu | Nhập đúng lời của đoạn mẫu; thử tạo lại (seed khác) |
| Số tiếng Việt đọc sai | Đặt `VONIA_VI_NUMBERS=on` trong `.env` (mặc định `off`: để model tự đọc số) hoặc gửi `normalize: true` khi gọi API |

Thêm chi tiết: [docs/huong-dan-cai-dat-vonia.md](docs/huong-dan-cai-dat-vonia.md#11-xử-lý-sự-cố).

---

## 📜 Bản quyền, trích dẫn và lưu ý

- Mã nguồn phát hành theo giấy phép **Apache-2.0** ([LICENSE](LICENSE)), giống OmniVoice gốc.
- Model và phần lõi TTS: **OmniVoice (default, powered by k2-fsa/OmniVoice)** — <https://github.com/k2-fsa/OmniVoice>. Các dự án cộng đồng khác dùng OmniVoice: [docs/community-projects.md](docs/community-projects.md).

Nếu dùng trong nghiên cứu, vui lòng trích dẫn bài báo OmniVoice:

```bibtex
@article{zhu2026omnivoice,
      title={OmniVoice: Towards Omnilingual Zero-Shot Text-to-Speech with Diffusion Language Models},
      author={Zhu, Han and Ye, Lingxuan and Kang, Wei and Yao, Zengwei and Guo, Liyong and Kuang, Fangjun and Han, Zhifeng and Zhuang, Weiji and Lin, Long and Povey, Daniel},
      journal={arXiv preprint arXiv:2604.00688},
      year={2026}
}
```

> ⚠️ **Sử dụng có trách nhiệm**: nghiêm cấm dùng Vonia/OmniVoice để nhân bản giọng khi chưa được phép, mạo danh, lừa đảo hay bất kỳ mục đích trái pháp luật hoặc trái đạo đức nào. Người dùng tự chịu trách nhiệm tuân thủ pháp luật nơi mình sinh sống; nhóm phát triển không chịu trách nhiệm cho việc lạm dụng.
