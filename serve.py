#!/usr/bin/env python3
"""Static server with HTTP Range support (http.server lacks it, and browsers cannot seek audio without it)."""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Limited:
    def __init__(self, f, n):
        self.f, self.n = f, n

    def read(self, size=-1):
        if self.n <= 0:
            return b''
        size = self.n if size < 0 else min(size, self.n)
        data = self.f.read(size)
        self.n -= len(data)
        return data

    def close(self):
        self.f.close()


class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        m = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers.get('Range', '').strip())
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start = int(m[1]) if m[1] else max(0, size - int(m[2] or 0))
        end = min(int(m[2]), size - 1) if m[1] and m[2] else size - 1
        if start > end or start >= size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        return Limited(f, end - start + 1)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(('', port), RangeHandler).serve_forever()
