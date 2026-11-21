"""Local preview server for the portfolio, matching vercel.json:
clean URLs (/play serves play.html, /about serves about.html, ...) and /work serves the home page.
Run from the project root: python3 .claude/serve.py 4321
"""
import http.server
import os
import sys
from urllib.parse import urlsplit

REWRITES = {"/work": "/index.html"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # always check for a newer file (a quick 304 if nothing changed), so a page never runs
        # with a stale site.js or stylesheet from the browser's cache
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        parts = urlsplit(self.path)
        path = parts.path
        bare = path.rstrip("/")
        if path.endswith("/") and bare and (bare in REWRITES or os.path.isfile(self.translate_path(bare + ".html"))):
            # /work/ → /work (as vercel.json's trailingSlash: false does), so relative asset paths still resolve
            self.send_response(301)
            self.send_header("Location", bare + (("?" + parts.query) if parts.query else ""))
            self.end_headers()
            return None
        if (path.rstrip("/") or "/") in REWRITES:
            path = REWRITES[path.rstrip("/")]
        elif (not path.endswith("/") and "." not in os.path.basename(path)
              and not os.path.isdir(self.translate_path(path))
              and os.path.isfile(self.translate_path(path + ".html"))):
            # a clean URL: serve the matching .html page (folders like /v2/ are left alone)
            path += ".html"
        self.path = path + (("?" + parts.query) if parts.query else "")
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4321
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
