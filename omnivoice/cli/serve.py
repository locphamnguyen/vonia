"""CLI entry point for the OmniVoice HTTP API server.

    omnivoice-serve --port 8002
    # or, without reinstalling for the new entry point:
    python -m omnivoice.cli.serve --port 8002
"""
import argparse
import logging

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
    p.add_argument("--max-concurrency", type=int, default=1, help="Concurrent GPU generations.")
    p.add_argument("--max-queue", type=int, default=32, help="Max requests queued before returning 503.")
    p.add_argument("--load-asr", action="store_true", help="Preload Whisper ASR at startup.")
    return p


def main():
    fmt = "%(asctime)s %(levelname)s [%(filename)s:%(lineno)d] %(message)s"
    logging.basicConfig(format=fmt, level=logging.INFO, force=True)
    args = get_parser().parse_args()

    import uvicorn

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

    app = create_app(engine)
    logging.info("Serving on http://%s:%d", args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
