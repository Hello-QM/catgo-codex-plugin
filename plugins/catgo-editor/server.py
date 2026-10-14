"""CatGo file-editor MCP server. File bytes and writes stay in the host bridge."""
import argparse
import base64
from functools import lru_cache
import json
from pathlib import Path
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
VERSION = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))["version"]
URI = f"ui://catgo/editor/{VERSION}"
MIME = "text/html;profile=mcp-app"
EXTENSIONS = [".cif", ".xyz", ".extxyz", ".poscar", ".vasp"]


def tools():
    file_schema = {"type": "object", "properties": {"file": {"type": "object",
        "properties": {"name": {"type": "string", "minLength": 1}, "resourceUri": {"type": "string", "minLength": 1}},
        "required": ["name", "resourceUri"], "additionalProperties": False}},
        "required": ["file"], "additionalProperties": False}
    common = {"annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False}}
    return [
        {**common, "name": "open_catgo_file", "title": "CatGo Structure Editor",
         "description": "Open a structure file in CatGo. Reads and user saves use the host file interface.",
         "inputSchema": file_schema,
         "_meta": {"ui": {"resourceUri": URI}, "openai/ui": {"entrypoints": [{"type": "file", "extensions": EXTENSIONS}]}}},
        {**common, "name": "open_catgo_editor", "title": "Structure Editor",
         "description": "Open the CatGo file-editor panel. Open a CIF, XYZ or POSCAR file in the host to begin editing.",
         "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
         "_meta": {"ui": {"resourceUri": URI}, "openai/ui": {"entrypoints": [{"type": "thread"}]}}},
    ]


@lru_cache(maxsize=1)
def snapshot_assets():
    """Keep a running app usable if an upgrade removes its version cache."""
    path = ROOT / "assets/editor.html"
    if not path.is_file():
        raise ValueError("Editor artifact missing; run scripts/build-ui.mjs before packaging.")
    manifest = json.loads((ROOT / "assets/program-manifest.json").read_text(encoding="utf-8"))
    parts = {}
    for chunk in manifest["chunks"]:
        data = (ROOT / "assets/program" / chunk["filename"]).read_bytes()
        if len(data) != chunk["bytes"]:
            raise ValueError("Incomplete CatGo program resource.")
        parts[chunk["uri"]] = {"uri": chunk["uri"], "mimeType": "application/octet-stream", "blob": base64.b64encode(data).decode("ascii")}
    return path.read_text(encoding="utf-8"), parts


def resource():
    html, _ = snapshot_assets()
    return {"uri": URI, "mimeType": MIME, "text": html, "_meta": {
        "ui": {"csp": {"connectDomains": ["data:", "blob:"], "resourceDomains": ["data:", "blob:"], "frameDomains": []}},
        "openai/ui": {"preferredDisplayMode": "fullscreen", "availableDisplayModes": ["fullscreen"]},
    }}


def program_resource(uri):
    # Exact generated-resource allowlist: never interpret the URI as a path.
    _, parts = snapshot_assets()
    if uri not in parts:
        raise ValueError("Unknown CatGo program resource; reload the current plugin version.")
    return parts[uri]


def dispatch(method, params):
    if method == "initialize":
        snapshot_assets()
        return {"protocolVersion": params.get("protocolVersion", "2025-06-18"),
                "capabilities": {"tools": {}, "resources": {}}, "serverInfo": {"name": "catgo-editor", "version": VERSION}}
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": tools()}
    if method == "resources/list":
        return {"resources": [{"uri": URI, "name": "CatGo Structure Editor", "mimeType": MIME}]}
    if method == "resources/templates/list":
        return {"resourceTemplates": []}
    if method == "resources/read" and params.get("uri") == URI:
        return {"contents": [resource()]}
    if method == "resources/read" and params.get("uri", "").startswith("catgo-assets://"):
        return {"contents": [program_resource(params["uri"])]}
    if method == "tools/call":
        name, arguments = params.get("name"), params.get("arguments") or {}
        if name == "open_catgo_editor" and not arguments:
            return {"content": [{"type": "text", "text": f"CatGo structure editor {VERSION} panel opened."}], "structuredContent": {"mode": "file-editor", "version": VERSION}}
        if name == "open_catgo_file":
            file = arguments.get("file")
            if not isinstance(file, dict) or set(arguments) != {"file"} or set(file) != {"name", "resourceUri"}:
                raise ValueError("A host-provided file name and resource URI are required.")
            if not all(isinstance(file.get(key), str) and file[key].strip() for key in ("name", "resourceUri")):
                raise ValueError("File name and resource URI must be non-empty strings.")
            return {"content": [{"type": "text", "text": f"Opened {file['name']} in the CatGo editor."}], "structuredContent": {"file": file}}
    raise ValueError(f"Unsupported method or resource: {method}")


def response(request):
    if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid request"}}
    if "id" not in request:
        return None
    reply = {"jsonrpc": "2.0", "id": request["id"]}
    try:
        reply["result"] = dispatch(request.get("method"), request.get("params") or {})
    except Exception as error:
        reply["error"] = {"code": -32602, "message": str(error)}
    return reply


def serve_stdio():
    # MCP JSON is UTF-8 even when a Windows console uses another code page.
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        try:
            reply = response(json.loads(line))
        except json.JSONDecodeError:
            reply = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
        if reply is not None:
            print(json.dumps(reply), flush=True)


class HttpHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/mcp":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1024 * 1024:
                self.send_error(413)
                return
            reply = response(json.loads(self.rfile.read(length)))
        except (json.JSONDecodeError, ValueError):
            self.send_error(400)
            return
        if reply is None:
            self.send_response(202)
            self.end_headers()
            return
        body = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send_error(405)

    def log_message(self, format, *args):
        print(format % args, file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--http", type=int, metavar="PORT", help="Serve stateless streamable HTTP on loopback for testing.")
    args = parser.parse_args()
    if args.http:
        ThreadingHTTPServer(("127.0.0.1", args.http), HttpHandler).serve_forever()
    else:
        serve_stdio()
