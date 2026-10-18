#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / ".output" / "chrome-mv3"
INJECT = Path(__file__).resolve().parent / "mock-browser.js"
PORT = 4177


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.endswith(".html"):
            file_path = (ROOT / path.lstrip("/")).resolve()
            if file_path.is_file() and str(file_path).startswith(str(ROOT)):
                html = file_path.read_text(encoding="utf-8")
                tag = f'<script>{INJECT.read_text(encoding="utf-8")}</script>\n'
                html = html.replace("<head>", "<head>\n" + tag, 1)
                data = html.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        return super().do_GET()


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"serving {ROOT} on http://127.0.0.1:{PORT}", flush=True)
    httpd.serve_forever()
