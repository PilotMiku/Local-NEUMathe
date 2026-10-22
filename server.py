"""NeuMathe local practice server. Binds only to this computer's loopback address."""
import argparse
import hashlib
import io
import json
import pathlib
import re
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

import fitz
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent
INDEX = json.loads((ROOT / 'data/render-index.json').read_text())
REPORT = json.loads((ROOT / 'data/extraction-report.json').read_text())
MANIFEST = json.loads((ROOT / 'dist/data/manifest.json').read_text())
if INDEX['revision'] != REPORT['revision'] or INDEX['revision'] != MANIFEST['revision']:
    raise RuntimeError('题库文件版本不一致，请重新运行 scripts/index_pdf_bank.py')
CACHE = ROOT / '.local/cache' / INDEX['revision']
CACHE.mkdir(parents=True, exist_ok=True)
RENDER_LOCK = threading.RLock()  # PyMuPDF operations are serialized across HTTP threads.
SCALE = 2.5


def render_part(qid, part, number):
    question = INDEX['questions'][qid]
    clip = question['parts'][part][number]
    key = hashlib.sha256(f'{qid}/{part}/{number}/v2'.encode()).hexdigest()
    target = CACHE / (key + '.webp')
    if target.exists():
        return target
    with RENDER_LOCK:
        if target.exists():
            return target
        document = INDEX['documents'][question['documentId']]
        with fitz.open(ROOT / document['path']) as pdf:
            pix = pdf[clip['page']].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=fitz.Rect(clip['rect']), alpha=False)
        bitmap = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        draw = ImageDraw.Draw(bitmap)
        for box in clip['hideAnswerLabels']:
            # Coordinates use the raster's actual integer origin; the original PDF is untouched.
            draw.rectangle([(box[0]*SCALE-pix.x-2, box[1]*SCALE-pix.y-2),
                            (box[2]*SCALE-pix.x+2, box[3]*SCALE-pix.y+2)], fill='white')
        buffer = io.BytesIO()
        bitmap.save(buffer, 'WEBP', lossless=True, method=4)
        temp = target.with_suffix('.tmp')
        temp.write_bytes(buffer.getvalue())
        temp.replace(target)
    return target


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        # Revalidate HTML, modules and data after a local update. Question images
        # carry a source revision in their URL and can be cached independently.
        if not urlsplit(self.path).path.startswith(('/api/question-image/', '/source-pdf/')):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def file_response(self, path, content_type, head=False, cache=False, ranges=False):
        size = path.stat().st_size
        start, end, status = 0, size - 1, 200
        if ranges and self.headers.get('Range'):
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers['Range'])
            if not match or not any(match.groups()):
                return self.send_error(416)
            if match[1]:
                start = int(match[1])
                end = min(int(match[2]), end) if match[2] else end
            else:
                start = max(0, size - int(match[2]))
            if start > end or start >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            status = 206
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(end-start+1))
        if ranges:
            self.send_header('Accept-Ranges', 'bytes')
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if cache else 'no-cache')
        self.end_headers()
        if not head:
            with path.open('rb') as stream:
                stream.seek(start)
                remaining = end-start+1
                while remaining:
                    chunk = stream.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

    def dispatch(self, head=False):
        path = unquote(urlsplit(self.path).path)
        if path == '/api/health':
            body = json.dumps({'ok': True, 'service': 'local-neumathe', 'name': 'Local-NEUMathe', 'revision': INDEX['revision'],
                               'questions': REPORT['questions'], 'documents': REPORT['documents'],
                               'subjects': REPORT['subjects'],
                               'host': '127.0.0.1'}, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if not head:
                self.wfile.write(body)
            return
        match = re.fullmatch(r'/api/question-image/([a-z0-9-]+)/(stem|analysis|option-[A-H])/(\d+)\.webp', path)
        if match:
            try:
                target = render_part(match[1], match[2], int(match[3]))
            except (KeyError, IndexError):
                return self.send_error(404, 'Unknown original question image')
            return self.file_response(target, 'image/webp', head, cache=True)
        match = re.fullmatch(r'/source-pdf/(s-[a-f0-9]+)\.pdf', path)
        if match:
            document = INDEX['documents'].get(match[1])
            if not document:
                return self.send_error(404)
            return self.file_response(ROOT / document['path'], 'application/pdf', head, ranges=True)
        if path.startswith(('/api/', '/source-pdf/')):
            return self.send_error(404)
        return super().do_HEAD() if head else super().do_GET()

    def do_GET(self):
        try:
            self.dispatch()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_HEAD(self):
        self.dispatch(True)

    def list_directory(self, path):
        self.send_error(404)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4178)
    args = parser.parse_args()
    class LocalServer(ThreadingHTTPServer):
        # A page requests its stem, four choices, logo and scripts concurrently.
        request_queue_size = 128

    server = LocalServer(('127.0.0.1', args.port), Handler)
    print(f'Local-NEUMathe: http://127.0.0.1:{args.port}/ | {REPORT["questions"]} questions', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
