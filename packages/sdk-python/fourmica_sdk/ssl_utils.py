from __future__ import annotations

import os
import ssl
from typing import Optional


def ensure_ssl_certs() -> None:
    """Point aiohttp/httpx to certifi's CA bundle when system certs are absent."""
    if os.getenv("SSL_CERT_FILE") or os.getenv("REQUESTS_CA_BUNDLE"):
        return
    try:
        import certifi

        cert_path = certifi.where()
        os.environ["SSL_CERT_FILE"] = cert_path
        os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)
    except Exception:
        pass


def get_web3_ssl_context() -> Optional[ssl.SSLContext]:
    """Return an SSL context backed by certifi, or None to use system defaults."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None
