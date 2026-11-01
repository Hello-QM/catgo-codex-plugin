"""CatGo structure viewer for Claude Code.

Default (stdio): MCP server whose tools open structure files in a loopback page.
--host: that page's HTTP server. It hosts the packaged editor as an MCP App and
answers its file reads and version-checked saves from the local filesystem.
API calls need the host's random token, kept in a user-only state file, so other
local users and web pages cannot read or write files through the port.
"""
import argparse
import base64
import binascii
import hashlib
import hmac
import json
import os
from pathlib import Path
import queue
import re
import secrets
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlsplit
import urllib.request

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import server as editor  # noqa: E402

VERSION = editor.VERSION
NAME = "catgo-viewer"
PORT = int(os.environ.get("CATGO_VIEWER_PORT", "47821"))
IDLE_SECONDS = int(os.environ.get("CATGO_VIEWER_IDLE", "1800"))
SUFFIXES = {".cif", ".xyz", ".extxyz", ".poscar", ".vasp"}
MAX_BYTES = 64 * 1024 * 1024
HEADER = "X-CatGo-Viewer"
STATE_DIR = Path(os.environ.get("CATGO_VIEWER_STATE", Path.home() / ".cache" / "catgo-viewer"))
TOKEN_FILE = STATE_DIR / f"port-{PORT}.json"
EDITOR_CSP = ("default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; "
              "img-src data: blob:; font-src data:; connect-src data: blob:; worker-src blob:; frame-src 'none'; object-src 'none'")


def structure_path(raw):
    """Only absolute paths to structure files are readable or writable."""
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("A structure file path is required.")
    path = Path(raw.strip()).expanduser()
    if not path.is_absolute():
        raise ValueError("Use an absolute path to the structure file.")
    path = path.resolve()
    if path.suffix.lower() not in SUFFIXES and not re.match(r"(POSCAR|CONTCAR)", path.name, re.I):
        raise ValueError("Supported files: CIF, XYZ, extXYZ, POSCAR/CONTCAR and .vasp.")
    return path


def editor_name(path):
    # The editor detects the format from the name; POSCAR-like names get .vasp.
    if path.suffix.lower() in SUFFIXES or re.fullmatch(r"(POSCAR|CONTCAR)", path.name, re.I):
        return path.name
    return path.name + ".vasp"


def file_uri(path):
    return "catgo-file:" + quote(str(path), safe="")


def etag(data):
    return hashlib.sha256(data).hexdigest()[:20]


def describe(path):
    return {"path": str(path), "name": editor_name(path), "uri": file_uri(path)}


def read_file(path):
    if not path.is_file():
        raise ValueError(f"File not found: {path}")
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("The file is larger than 64 MB.")
    data = path.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("The file is not UTF-8 text.") from None
    return {"text": text, "etag": etag(data), "writable": os.access(path, os.W_OK)}


def write_file(path, text, if_match):
    data = text.encode("utf-8")
    if len(data) > MAX_BYTES:
        return {"outcome": "too-large", "maxBytes": MAX_BYTES}
    current = etag(path.read_bytes()) if path.is_file() else None
    if current != if_match:
        return {"outcome": "conflict", "etag": current}
    temporary = path.with_name(f".{path.name}.catgo-{os.getpid()}.tmp")
    temporary.write_bytes(data)
    if path.exists():
        os.chmod(temporary, path.stat().st_mode & 0o7777)
    os.replace(temporary, path)
    return {"outcome": "saved", "etag": etag(data)}


def export_file(raw, data, overwrite=False):
    """Save an export where the user chose; an existing file is replaced only when confirmed."""
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("Choose where to save the file.")
    target = Path(raw.strip()).expanduser()
    if not target.is_absolute():
        raise ValueError("Use an absolute path.")
    if not target.name or target.name.startswith("."):
        raise ValueError("Choose a visible file name.")
    if not target.parent.is_dir():
        raise ValueError(f"Folder not found: {target.parent}")
    if target.is_dir():
        raise ValueError(f"{target} is a folder.")
    if len(data) > MAX_BYTES:
        raise ValueError("The export is larger than 64 MB.")
    if target.exists() and not overwrite:
        return {"exists": True, "path": str(target)}
    temporary = target.with_name(f".{target.name}.catgo-{os.getpid()}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, target)
    return {"path": str(target)}


class Hub:
    """Connected viewer pages, the current file, files to watch and the last selection."""

    def __init__(self):
        self.lock = threading.Lock()
        self.clients = []
        self.current = None
        self.context = None
        self.watched = {}
        self.active = time.monotonic()

    def publish(self, event, data):
        with self.lock:
            for client in self.clients:
                client.put((event, data))

    def connect(self):
        client = queue.Queue()
        with self.lock:
            self.clients.append(client)
            self.active = time.monotonic()
        return client

    def disconnect(self, client):
        with self.lock:
            self.clients.remove(client)
            self.active = time.monotonic()

    def watch(self, path):
        with self.lock:
            try:
                self.watched[str(path)] = path.stat().st_mtime_ns, path.stat().st_size
            except OSError:
                pass
            while len(self.watched) > 64:
                self.watched.pop(next(iter(self.watched)))

    def poll(self):
        with self.lock:
            entries = list(self.watched.items())
        for name, stamp in entries:
            path = Path(name)
            try:
                now = path.stat().st_mtime_ns, path.stat().st_size
            except OSError:
                continue
            if now != stamp:
                with self.lock:
                    self.watched[name] = now
                self.publish("changed", {"uri": file_uri(path)})


HUB = Hub()


class HostHandler(BaseHTTPRequestHandler):
    server_version = f"CatGoViewer/{VERSION}"

    def allowed(self, api, token=None):
        port = self.server.server_address[1]
        if self.headers.get("Host") not in {f"127.0.0.1:{port}", f"localhost:{port}"}:
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}:
            return False
        given = (token or self.headers.get(HEADER, "")).encode("utf-8")
        return not api or hmac.compare_digest(given, self.server.token.encode("ascii"))

    def reply(self, status, body, content_type="application/json", headers=None):
        data = body if isinstance(body, bytes) else (json.dumps(body) if content_type == "application/json" else body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type if content_type != "application/json" else "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= MAX_BYTES * 2:
            raise ValueError("Request body is missing or too large.")
        return json.loads(self.rfile.read(length))

    def do_GET(self):
        url = urlsplit(self.path)
        query = parse_qs(url.query)
        HUB.active = time.monotonic()
        # EventSource cannot send headers, so the event stream takes the token in its query.
        if not self.allowed(url.path.startswith("/api/") and url.path != "/api/health", query.get("token", [None])[0] if url.path == "/api/events" else None):
            return self.reply(403, {"error": "Forbidden"})
        try:
            if url.path == "/":
                page = (ROOT / "assets/claude-host.html").read_text(encoding="utf-8").replace("__VERSION__", VERSION)
                return self.reply(200, page, "text/html; charset=utf-8")
            if url.path == "/editor":
                html, _ = editor.snapshot_assets()
                # Served as srcdoc, so the policy travels inside the document too.
                html = html.replace("<head>", f'<head><meta http-equiv="Content-Security-Policy" content="{EDITOR_CSP}">', 1)
                return self.reply(200, html, "text/html; charset=utf-8", {"Content-Security-Policy": EDITOR_CSP})
            if url.path == "/resource":
                return self.reply(200, editor.program_resource(query.get("uri", [""])[0]))
            if url.path == "/api/health":
                return self.reply(200, {"name": NAME, "version": VERSION, "pid": os.getpid(), "viewers": len(HUB.clients)})
            if url.path == "/api/file":
                path = structure_path(query.get("path", [""])[0])
                value = read_file(path)
                HUB.watch(path)
                return self.reply(200, value)
            if url.path == "/api/context":
                return self.reply(200, {"context": HUB.context})
            if url.path == "/api/events":
                return self.events()
        except ValueError as error:
            return self.reply(400, {"error": str(error)})
        self.reply(404, {"error": "Not found"})

    def do_POST(self):
        url = urlsplit(self.path)
        HUB.active = time.monotonic()
        if not self.allowed(True):
            return self.reply(403, {"error": "Forbidden"})
        try:
            body = self.body()
            if url.path == "/api/open":
                file = describe(structure_path(body.get("path")))
                if not Path(file["path"]).is_file():
                    raise ValueError(f"File not found: {file['path']}")
                HUB.current = file
                HUB.publish("load", file)
                return self.reply(200, {**file, "viewers": len(HUB.clients)})
            if url.path == "/api/file":
                path = structure_path(body.get("path"))
                result = write_file(path, str(body.get("text", "")), body.get("ifMatch"))
                HUB.watch(path)
                return self.reply(200, result)
            if url.path == "/api/export":
                if "blob" in body:
                    try:
                        data = base64.b64decode(str(body["blob"]), validate=True)
                    except binascii.Error:
                        raise ValueError("The export is not valid base64.") from None
                else:
                    data = str(body.get("text", "")).encode("utf-8")
                return self.reply(200, export_file(body.get("path"), data, body.get("overwrite") is True))
            if url.path == "/api/context":
                HUB.context = {**body, "receivedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
                return self.reply(200, {})
            if url.path == "/api/shutdown":
                self.reply(200, {})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
        except (ValueError, OSError) as error:
            return self.reply(400, {"error": str(error)})
        self.reply(404, {"error": "Not found"})

    def events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        client = HUB.connect()
        client.put(("hello", {"version": VERSION, "current": HUB.current}))
        try:
            while True:
                try:
                    event, data = client.get(timeout=15)
                    chunk = f"event: {event}\ndata: {json.dumps(data)}\n\n"
                except queue.Empty:
                    chunk = ": keep-alive\n\n"
                self.wfile.write(chunk.encode("utf-8"))
                self.wfile.flush()
        except OSError:
            pass
        finally:
            HUB.disconnect(client)

    def log_message(self, format, *args):
        pass


def write_private(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(data, handle)
    os.replace(temporary, path)


def serve_host(port):
    httpd = ThreadingHTTPServer(("127.0.0.1", port), HostHandler)
    httpd.daemon_threads = True
    httpd.token = secrets.token_urlsafe(24)
    token_file = STATE_DIR / f"port-{port}.json"
    write_private(token_file, {"pid": os.getpid(), "version": VERSION, "token": httpd.token})

    def housekeeping():
        while True:
            time.sleep(1)
            HUB.poll()
            if not HUB.clients and time.monotonic() - HUB.active > IDLE_SECONDS:
                httpd.shutdown()
                return
    threading.Thread(target=housekeeping, daemon=True).start()
    try:
        httpd.serve_forever()
    finally:
        try:
            if json.loads(token_file.read_text(encoding="utf-8")).get("pid") == os.getpid():
                token_file.unlink()
        except (OSError, ValueError):
            pass


# Claude Code side: a stdio MCP server that keeps the host running and drives it.

OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
URL = f"http://127.0.0.1:{PORT}/"
INSTRUCTIONS = (
    "CatGo viewer: view_structure shows a CIF/XYZ/POSCAR file in a 3D CatGo editor page. "
    "If the result says no viewer page is connected, open the returned URL once in the Claude desktop "
    "Browser pane (preview_start with that url); in a terminal-only session give the user the URL. "
    "Later view_structure calls load into the already open page. get_viewer_selection returns atoms "
    "the user attached with the editor's 'Send selection' button.")


def host_token():
    try:
        return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))["token"]
    except (OSError, ValueError, KeyError):
        return ""


def page_url():
    return f"{URL}?token={host_token()}"


def call_host(method, path, body=None, timeout=5):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(URL.rstrip("/") + path, data=data, method=method,
                                     headers={HEADER: host_token(), "Content-Type": "application/json"})
    try:
        with OPENER.open(request, timeout=timeout) as response:
            return json.loads(response.read())
    except HTTPError as error:
        try:
            message = json.loads(error.read()).get("error")
        except ValueError:
            message = None
        if error.code == 403:
            message = (f"The CatGo viewer on port {PORT} belongs to another user or session; "
                       "set CATGO_VIEWER_PORT to a free port.")
        raise ValueError(message or f"CatGo viewer returned HTTP {error.code}.") from None


def host_health():
    try:
        health = call_host("GET", "/api/health", timeout=2)
    except (URLError, OSError):
        return None
    except ValueError:
        health = {}
    if health.get("name") != NAME:
        raise ValueError(f"Port {PORT} is used by another program; set CATGO_VIEWER_PORT to a free port.")
    return health


def version_key(version):
    return tuple(int(part) for part in re.findall(r"\d+", str(version)))


def ensure_host():
    health = host_health()
    # Sessions started before an upgrade keep the newer host rather than fighting over it.
    if health and version_key(health["version"]) >= version_key(VERSION):
        return health
    if health:
        call_host("POST", "/api/shutdown", {})
        for _ in range(50):
            time.sleep(0.1)
            if host_health() is None:
                break
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    log = open(STATE_DIR / f"port-{PORT}.log", "ab")
    detach = ({"creationflags": subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
              if os.name == "nt" else {"start_new_session": True})
    subprocess.Popen([sys.executable, str(ROOT / "claude_server.py"), "--host", "--port", str(PORT)],
                     cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log, **detach)
    for _ in range(100):
        time.sleep(0.1)
        health = host_health()
        if health and host_token():
            return health
    raise ValueError(f"The CatGo viewer did not start; see {log.name}.")


def connection_hint(viewers):
    if viewers:
        return ""
    return (f" No viewer page is connected: open {page_url()} in the Browser pane "
            "(Claude desktop: preview_start with this url; terminal: ask the user to open it in a browser).")


def tools():
    closed = {"type": "object", "properties": {}, "additionalProperties": False}
    return [
        {"name": "view_structure", "title": "View structure in CatGo",
         "description": "Show a CIF, XYZ, extXYZ, POSCAR/CONTCAR or .vasp file in the CatGo 3D editor page "
                        "(rotate, select, edit coordinates, cut slabs, save back to the file).",
         "inputSchema": {"type": "object", "properties": {"path": {"type": "string", "description": "Absolute path of the structure file."}},
                         "required": ["path"], "additionalProperties": False},
         "annotations": {"readOnlyHint": True, "openWorldHint": False}},
        {"name": "open_viewer", "title": "Open CatGo viewer",
         "description": "Start the CatGo viewer page and return its URL without loading a file.",
         "inputSchema": closed, "annotations": {"readOnlyHint": True, "openWorldHint": False}},
        {"name": "get_viewer_selection", "title": "Get CatGo selection",
         "description": "Return the atoms the user last sent from the CatGo viewer with 'Send selection' "
                        "(file, atom count, selected atom indices/elements/Cartesian coordinates).",
         "inputSchema": closed, "annotations": {"readOnlyHint": True, "openWorldHint": False}},
    ]


def text_result(text, structured):
    return {"content": [{"type": "text", "text": text}], "structuredContent": structured}


def call_tool(name, arguments):
    if name == "view_structure":
        path = structure_path(arguments.get("path"))
        if not path.is_file():
            raise ValueError(f"File not found: {path}")
        ensure_host()
        opened = call_host("POST", "/api/open", {"path": str(path)})
        connected = opened["viewers"] > 0
        return text_result(f"Opened {path.name} in the CatGo viewer." + connection_hint(opened["viewers"]),
                           {"url": page_url(), "path": str(path), "viewerConnected": connected})
    if name == "open_viewer":
        health = ensure_host()
        return text_result(f"CatGo viewer is running at {page_url()}." + connection_hint(health["viewers"]),
                           {"url": page_url(), "viewerConnected": health["viewers"] > 0})
    if name == "get_viewer_selection":
        if host_health() is None:
            return text_result("The CatGo viewer is not running.", {"context": None})
        context = call_host("GET", "/api/context")["context"]
        if not context:
            return text_result("No selection yet: select atoms in the viewer and press 'Send selection'.", {"context": None})
        texts = [item.get("text", "") for item in context.get("params", {}).get("content", []) if item.get("type") == "text"]
        return text_result(f"From {context.get('file', {}).get('path', 'the viewer')} at {context['receivedAt']}: " + " ".join(texts),
                           {"context": context})
    raise ValueError(f"Unknown tool: {name}")


def dispatch(method, params):
    if method == "initialize":
        return {"protocolVersion": params.get("protocolVersion", "2025-06-18"), "capabilities": {"tools": {}},
                "serverInfo": {"name": NAME, "version": VERSION}, "instructions": INSTRUCTIONS}
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": tools()}
    if method == "tools/call":
        try:
            return call_tool(params.get("name"), params.get("arguments") or {})
        except (ValueError, OSError) as error:
            return {"content": [{"type": "text", "text": str(error)}], "isError": True}
    raise ValueError(f"Unsupported method: {method}")


def serve_stdio():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            print(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}), flush=True)
            continue
        if not isinstance(request, dict) or "id" not in request:
            continue
        reply = {"jsonrpc": "2.0", "id": request["id"]}
        try:
            reply["result"] = dispatch(request.get("method"), request.get("params") or {})
        except Exception as error:
            reply["error"] = {"code": -32601 if "Unsupported" in str(error) else -32602, "message": str(error)}
        print(json.dumps(reply), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", action="store_true", help="Run the loopback viewer page server.")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()
    if args.host:
        serve_host(args.port)
    else:
        serve_stdio()
