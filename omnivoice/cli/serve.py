"""CLI entry point for the OmniVoice HTTP API server.

    omnivoice-serve --port 8002
    # or, without reinstalling for the new entry point:
    python -m omnivoice.cli.serve --port 8002
"""
import argparse
import logging
import os

from omnivoice.server.engine import Engine
from omnivoice.server.app import create_app
from omnivoice.server.normalize import DEFAULT_NORMALIZER_SPEC


def get_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="OmniVoice HTTP API server (REST + OpenAI-compatible).")
    p.add_argument("--model", default="k2-fsa/OmniVoice", help="Model checkpoint path or HF repo id.")
    p.add_argument("--host", "--ip", dest="host", default="0.0.0.0", help="Bind address.")
    p.add_argument("--port", type=int, default=8002, help="Bind port (8002 to avoid Higgs on 8000).")
    p.add_argument("--device", default=None, help="cuda / cuda:0 / mps / xpu / cpu. Auto-detected if unset.")
    p.add_argument("--dtype", default="float16", choices=["float16", "float32", "bfloat16"])
    p.add_argument("--voices-dir", default="~/.cache/omnivoice/voices", help="Where to persist registered voices.")
    p.add_argument("--normalizer", default=DEFAULT_NORMALIZER_SPEC,
                   help="Text normalizer spec '<path.py|module>:<func>'. Empty string disables it.")
    p.add_argument("--max-concurrency", type=int, default=1,
                   help="Concurrent GPU generations. WARNING: values >1 are NOT supported — "
                        "the model and the lazy ASR loader are not thread-safe, so >1 risks "
                        "double-loading Whisper / CUDA errors. Keep at 1.")
    p.add_argument("--max-queue", type=int, default=32, help="Max requests queued before returning 503.")
    p.add_argument("--load-asr", action="store_true", help="Preload Whisper ASR at startup.")
    p.add_argument("--web-dir", default=None,
                   help="Directory of the built web UI to serve at '/'. "
                        "Defaults to omnivoice/server/webdist if present.")
    return p


def _default_web_dir():
    import omnivoice.server as _srv
    d = os.path.join(os.path.dirname(_srv.__file__), "webdist")
    return d if os.path.isdir(d) else None


def _load_dotenv():
    """Load KEY=VALUE lines from a .env at the repo root (no extra dependency).
    Existing environment variables win, so CLI/shell overrides still apply."""
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, "..", ".."))  # repo root
    for path in (os.path.join(root, ".env"), os.path.join(os.getcwd(), ".env")):
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    os.environ.setdefault(k, v)
        except OSError:
            pass
        break


def main():
    fmt = "%(asctime)s %(levelname)s [%(filename)s:%(lineno)d] %(message)s"
    logging.basicConfig(format=fmt, level=logging.INFO, force=True)
    _load_dotenv()
    args = get_parser().parse_args()

    import uvicorn

    if args.max_concurrency > 1:
        logging.warning(
            "--max-concurrency=%d requested, but concurrency >1 is NOT supported: "
            "the model and ASR loader are not thread-safe. Forcing 1.",
            args.max_concurrency,
        )
        args.max_concurrency = 1

    logging.info("Loading OmniVoice model '%s' ...", args.model)
    engine = Engine(
        model_id=args.model,
        device=args.device,
        dtype=args.dtype,
        voices_dir=args.voices_dir,
        normalizer_spec=args.normalizer or None,
        max_concurrency=args.max_concurrency,
        max_queue=args.max_queue,
        load_asr=args.load_asr,
    )
    logging.info("Model ready on %s (sr=%d Hz). %d voice(s) in library.",
                 engine.device, engine.sampling_rate, len(engine.voices.list_records()))
    if engine.normalizer.configured:
        err = engine.normalizer.warmup()
        if err:
            logging.warning("Normalizer not ready (normalize=true will 400): %s", err)
        else:
            logging.info("Normalizer ready: %s", engine.normalizer.spec)

    if os.environ.get("VONIA_AUTH_USER") and os.environ.get("VONIA_AUTH_PASS"):
        logging.info("Login enabled for user '%s' (session cookie + Basic auth).",
                     os.environ["VONIA_AUTH_USER"])
    else:
        logging.warning("Login DISABLED (set VONIA_AUTH_USER/VONIA_AUTH_PASS in .env to protect).")

    web_dir = args.web_dir or _default_web_dir()
    if web_dir:
        logging.info("Serving web UI from %s", web_dir)
    app = create_app(engine, web_dir=web_dir)
    logging.info("Serving on http://%s:%d", args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
