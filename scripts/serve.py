#!/usr/bin/env python3
"""Serve the static dashboard and safely proxy UNIQLO thumbnails for PDF export."""

from __future__ import annotations

import argparse
import functools
import hashlib
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CACHE = ROOT / ".cache" / "wishlist-images"
ALLOWED_IMAGE_HOST = "image.uniqlo.com"
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - stdlib method name
        parsed = urlparse(self.path)
        if parsed.path != "/image-proxy":
            return super().do_GET()

        source = parse_qs(parsed.query).get("url", [""])[0]
        remote = urlparse(source)
        if remote.scheme != "https" or remote.hostname != ALLOWED_IMAGE_HOST:
            self.send_error(400, "Only UNIQLO product images are allowed")
            return

        CACHE.mkdir(parents=True, exist_ok=True)
        suffix = Path(remote.path).suffix.lower() or ".jpg"
        cache_path = CACHE / f"{hashlib.sha256(source.encode()).hexdigest()}{suffix}"
        try:
            if cache_path.exists():
                payload = cache_path.read_bytes()
            else:
                request = Request(source, headers={"User-Agent": "Mozilla/5.0"})
                with urlopen(request, timeout=15) as response:
                    payload = response.read(MAX_IMAGE_BYTES + 1)
                if len(payload) > MAX_IMAGE_BYTES:
                    raise ValueError("Image is too large")
                cache_path.write_bytes(payload)
        except Exception as error:
            self.send_error(502, f"Could not fetch product image: {error}")
            return

        content_type = mimetypes.guess_type(cache_path.name)[0] or "image/jpeg"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "public, max-age=604800")
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    handler = functools.partial(DashboardHandler, directory=str(DIST))
    print(f"Serving ACROSS at http://{args.host}:{args.port}/")
    ThreadingHTTPServer((args.host, args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
