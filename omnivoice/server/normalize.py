"""Optional text-normalization hook for the OmniVoice API server.

OmniVoice has no built-in text frontend, so numbers/dates/percentages/abbreviations
are spoken literally. Clients can opt in per request (``normalize: true``) to run the
text through a normalizer first — by default a Vietnamese normalizer backed by vinorm.

The normalizer is pluggable via a *spec* string, resolved lazily on first use:

    "<path-to-.py-file>:<func>"   e.g. "/root/higgs-v3-spike/norm.py:normalize"
    "<module>:<func>"             e.g. "omnivoice.server.normalize:identity"

The resolved callable must accept a single ``str`` and return a ``str``.
"""
from __future__ import annotations

import importlib
import importlib.util
import os
from typing import Callable, Optional

DEFAULT_NORMALIZER_SPEC = "omnivoice.server.norm_vi:normalize"


class NormalizerError(RuntimeError):
    """Raised when a requested normalizer cannot be loaded or run."""


def identity(text: str) -> str:
    return text


def _load_from_path(path: str, func: str) -> Callable[[str], str]:
    if not os.path.isfile(path):
        raise NormalizerError(f"Normalizer file not found: {path}")
    spec = importlib.util.spec_from_file_location("_omnivoice_normalizer", path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)  # may import vinorm, etc.
    except Exception as exc:  # noqa: BLE001 - surface the real cause to the client
        raise NormalizerError(
            f"Failed to import normalizer '{path}': {exc}. "
            f"For the default Vietnamese normalizer install vinorm: uv pip install vinorm"
        ) from exc
    fn = getattr(module, func, None)
    if not callable(fn):
        raise NormalizerError(f"'{func}' is not a callable in {path}")
    return fn


def _load_from_module(module_name: str, func: str) -> Callable[[str], str]:
    try:
        module = importlib.import_module(module_name)
    except Exception as exc:  # noqa: BLE001
        raise NormalizerError(f"Failed to import module '{module_name}': {exc}") from exc
    fn = getattr(module, func, None)
    if not callable(fn):
        raise NormalizerError(f"'{func}' is not a callable in module {module_name}")
    return fn


class Normalizer:
    """Lazily-resolved text normalizer described by a spec string."""

    def __init__(self, spec: Optional[str] = DEFAULT_NORMALIZER_SPEC):
        self.spec = spec
        self._fn: Optional[Callable[[str], str]] = None
        self._load_error: Optional[NormalizerError] = None

    @property
    def configured(self) -> bool:
        return bool(self.spec)

    def _resolve(self) -> Callable[[str], str]:
        if self._fn is not None:
            return self._fn
        if self._load_error is not None:
            raise self._load_error
        if not self.spec:
            raise NormalizerError("No normalizer configured on this server.")
        target, _, func = self.spec.partition(":")
        func = func or "normalize"
        try:
            if target.endswith(".py") or os.path.sep in target:
                self._fn = _load_from_path(target, func)
            else:
                self._fn = _load_from_module(target, func)
        except NormalizerError as exc:
            self._load_error = exc
            raise
        return self._fn

    def warmup(self) -> Optional[str]:
        """Try to resolve eagerly; return an error string instead of raising."""
        if not self.spec:
            return None
        try:
            self._resolve()
            return None
        except NormalizerError as exc:
            return str(exc)

    def __call__(self, text: str) -> str:
        fn = self._resolve()
        try:
            return fn(text)
        except Exception as exc:  # noqa: BLE001
            raise NormalizerError(f"Normalizer failed: {exc}") from exc
