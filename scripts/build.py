"""Cross-platform build for Vonia Voice Studio (OmniVoice backend + web UI).

Chạy qua wrapper (tự cài uv/bun nếu thiếu):
    ./build.sh [options]          # macOS / Linux
    .\\build.ps1 [options]        # Windows PowerShell
    build.cmd [options]           # Windows cmd / double-click

Hoặc trực tiếp (khi đã có uv):
    uv run --no-project --python 3.12 scripts/build.py [options]

Các bước:
  1. Cài thư viện Python theo uv.lock vào .venv (Python 3.12, extras serve + vi).
     Linux/Windows mặc định dùng torch CUDA 12.8; macOS dùng torch PyPI (MPS/CPU).
  2. Build giao diện web (bun nếu có, không thì npm) và copy vào omnivoice/server/webdist.
  3. Tạo .env từ .env.example (kèm VONIA_SESSION_SECRET ngẫu nhiên) nếu chưa có.
  4. Kiểm tra: import server, in thiết bị torch nhận được.
"""

from __future__ import annotations

import argparse
import os
import platform
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
WEBDIST = ROOT / "omnivoice" / "server" / "webdist"
VENV = ROOT / ".venv"
PYTHON_VERSION = "3.12"  # torch 2.8.0 chưa có wheel cho 3.14
TORCH_PINS = ["torch==2.8.0", "torchaudio==2.8.0"]
IS_WIN = os.name == "nt"


def log(msg: str) -> None:
    print(f"\n==> {msg}", flush=True)


def die(msg: str) -> None:
    print(f"\n[LỖI] {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def which(name: str) -> str | None:
    # Trên Windows npm/bun là .cmd/.exe — shutil.which tự thử PATHEXT.
    return shutil.which(name)


def run(cmd: list[str], cwd: Path = ROOT, label: str | None = None) -> None:
    print("   $ " + (label or " ".join(cmd)), flush=True)
    try:
        subprocess.run(cmd, cwd=cwd, check=True)
    except FileNotFoundError:
        die(f"Không tìm thấy lệnh: {cmd[0]}")
    except subprocess.CalledProcessError as e:
        die(f"Lệnh thất bại (mã {e.returncode}): {' '.join(cmd)}")


def venv_bin(name: str) -> Path:
    return VENV / ("Scripts" if IS_WIN else "bin") / (name + (".exe" if IS_WIN else ""))


def has_nvidia_gpu() -> bool:
    smi = which("nvidia-smi")
    if not smi:
        return False
    try:
        return subprocess.run([smi, "-L"], capture_output=True, timeout=15).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


# ── 1. Python ────────────────────────────────────────────────────────────────
def build_python(args: argparse.Namespace) -> None:
    uv = which("uv")
    if not uv:
        die("Chưa có uv. Hãy chạy qua build.sh / build.ps1 để tự cài, "
            "hoặc cài tay: https://docs.astral.sh/uv/getting-started/installation/")

    extras = ["--extra", "serve", "--extra", "vi"]
    if args.dev:
        extras += ["--extra", "dev"]

    log(f"Cài thư viện Python {PYTHON_VERSION} theo uv.lock → .venv")
    # --frozen: cài đúng theo lock, không sửa uv.lock trong repo.
    run([uv, "sync", "--frozen", "--python", PYTHON_VERSION, *extras])

    system = platform.system()
    want_cpu = args.torch == "cpu" or (
        args.torch == "auto" and system in ("Linux", "Windows") and not has_nvidia_gpu()
    )
    if system != "Darwin" and want_cpu:
        # Bản CUDA mặc định vẫn chạy được trên CPU nhưng nặng hơn nhiều; đổi sang
        # wheel CPU cho máy không có GPU NVIDIA.
        log("Không dùng GPU NVIDIA → cài torch bản CPU")
        run([uv, "pip", "install", "--python", str(venv_bin("python")), "--reinstall",
             "--index-url", "https://download.pytorch.org/whl/cpu", *TORCH_PINS])


# ── 2. Web UI ────────────────────────────────────────────────────────────────
def build_web() -> None:
    bun, npm = which("bun"), which("npm")
    if bun:
        log("Build giao diện web bằng bun")
        run([bun, "install", "--frozen-lockfile"], cwd=WEB)
        run([bun, "run", "build"], cwd=WEB)
    elif npm:
        log("Build giao diện web bằng npm")
        run([npm, "install", "--no-audit", "--no-fund"], cwd=WEB)
        run([npm, "run", "build"], cwd=WEB)
    else:
        die("Cần bun hoặc Node.js ≥ 18 để build giao diện. "
            "Chạy qua build.sh / build.ps1 để tự cài bun.")

    dist = WEB / "dist"
    if not (dist / "index.html").is_file():
        die(f"Build web không tạo ra {dist / 'index.html'}")
    log(f"Copy web/dist → {WEBDIST.relative_to(ROOT)}")
    shutil.rmtree(WEBDIST, ignore_errors=True)
    shutil.copytree(dist, WEBDIST)


# ── 3. .env ──────────────────────────────────────────────────────────────────
def ensure_env() -> None:
    env_file, example = ROOT / ".env", ROOT / ".env.example"
    if env_file.exists():
        log(".env đã có — giữ nguyên")
        return
    if not example.exists():
        return
    log("Tạo .env từ .env.example (sinh VONIA_SESSION_SECRET mới)")
    text = example.read_text(encoding="utf-8").replace(
        "VONIA_SESSION_SECRET=replace-with-openssl-rand-hex-32",
        f"VONIA_SESSION_SECRET={secrets.token_hex(32)}",
    )
    env_file.write_text(text, encoding="utf-8")


# ── 4. Kiểm tra ──────────────────────────────────────────────────────────────
VERIFY = """
import torch, omnivoice.server.app  # noqa: F401
if torch.cuda.is_available():
    dev = "cuda (" + torch.cuda.get_device_name(0) + ")"
elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
    dev = "mps (Apple Silicon)"
elif hasattr(torch, "xpu") and torch.xpu.is_available():
    dev = "xpu (Intel)"
else:
    dev = "cpu (chậm)"
print("   torch", torch.__version__, "| thiết bị:", dev)
"""


def verify() -> None:
    log("Kiểm tra cài đặt")
    py = venv_bin("python")
    if not py.exists():
        die(f"Không thấy {py}")
    run([str(py), "-c", VERIFY], label="python -c <kiểm tra torch + import server>")
    if not (WEBDIST / "index.html").is_file():
        die("Thiếu omnivoice/server/webdist/index.html")


def download_model() -> None:
    log("Tải trước model k2-fsa/OmniVoice từ HuggingFace (có thể mất vài phút)")
    run([str(venv_bin("python")), "-c",
         "from huggingface_hub import snapshot_download; "
         "print('   ', snapshot_download('k2-fsa/OmniVoice'))"],
        label="python -c <snapshot_download k2-fsa/OmniVoice>")


def main() -> None:
    p = argparse.ArgumentParser(description="Build Vonia Voice Studio trên Windows/macOS/Linux.")
    p.add_argument("--torch", choices=["auto", "cuda", "cpu"], default="auto",
                   help="Bản torch cho Linux/Windows. auto = CUDA nếu có nvidia-smi, "
                        "ngược lại CPU. (macOS luôn dùng MPS/CPU.)")
    p.add_argument("--skip-python", action="store_true", help="Bỏ qua bước cài Python.")
    p.add_argument("--skip-web", action="store_true", help="Bỏ qua bước build giao diện.")
    p.add_argument("--dev", action="store_true", help="Cài thêm extra dev (pytest...).")
    p.add_argument("--download-model", action="store_true",
                   help="Tải sẵn model (~vài GB) để lần chạy đầu không phải chờ.")
    args = p.parse_args()

    print(f"Vonia build — {platform.system()} {platform.machine()} — {ROOT}")
    if not args.skip_python:
        build_python(args)
    if not args.skip_web:
        build_web()
    ensure_env()
    verify()
    if args.download_model:
        download_model()

    serve = venv_bin("omnivoice-serve")
    log("Build xong")
    print(f"""
   Chạy server (cổng 8002, giao diện web tại http://127.0.0.1:8002):
     {serve} --host 127.0.0.1 --port 8002

   Lưu ý:
   - Server cần Redis cho đăng nhập/phiên: đặt REDIS_URL trong .env
     (vd chạy nhanh: docker run -d -p 6379:6379 redis:7), hoặc VONIA_AUTH=off khi dev cục bộ.
   - Model tự tải từ HuggingFace ở lần chạy đầu (HF_ENDPOINT=https://hf-mirror.com nếu bị chặn).
   - Gọi thẳng file trong .venv (không qua `uv run`) để giữ nguyên bản torch đã chọn.
""")


if __name__ == "__main__":
    main()
