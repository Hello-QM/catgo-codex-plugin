import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
from urllib.error import HTTPError
from urllib.parse import quote
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("claude_server", ROOT / "claude_server.py")
viewer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(viewer)
WATER = "3\nwater\nO 0 0 0\nH 0.9572 0 0\nH -0.239 0.927 0\n"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class FileRulesTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def test_only_absolute_structure_paths(self):
        for name in ["a.cif", "b.XYZ", "c.extxyz", "POSCAR", "CONTCAR_relaxed", "d.vasp", "e.poscar"]:
            self.assertEqual(viewer.structure_path(str(self.root / name)).name, name)
        for raw in ["a.cif", str(self.root / "notes.txt"), str(self.root / ".ssh/id_rsa"), "", None]:
            with self.assertRaises(ValueError):
                viewer.structure_path(raw)

    def test_editor_names_keep_format_detectable(self):
        self.assertEqual(viewer.editor_name(Path("/x/CONTCAR")), "CONTCAR")
        self.assertEqual(viewer.editor_name(Path("/x/CONTCAR_relaxed")), "CONTCAR_relaxed.vasp")
        self.assertEqual(viewer.editor_name(Path("/x/POSCAR.1")), "POSCAR.1.vasp")
        self.assertEqual(viewer.editor_name(Path("/x/氧化铱.cif")), "氧化铱.cif")

    def test_version_checked_write_preserves_mode(self):
        path = self.root / "water.xyz"
        path.write_text(WATER, encoding="utf-8")
        os.chmod(path, 0o640)
        value = viewer.read_file(path)
        self.assertTrue(value["writable"])
        self.assertEqual(viewer.write_file(path, "changed", "stale")["outcome"], "conflict")
        self.assertEqual(path.read_text(encoding="utf-8"), WATER)
        saved = viewer.write_file(path, WATER.replace("O 0 0 0", "O 1 0 0"), value["etag"])
        self.assertEqual(saved["outcome"], "saved")
        self.assertNotEqual(saved["etag"], value["etag"])
        self.assertIn("O 1 0 0", path.read_text(encoding="utf-8"))
        if os.name != "nt":
            self.assertEqual(path.stat().st_mode & 0o777, 0o640)
        self.assertEqual(sorted(item.name for item in self.root.iterdir()), ["water.xyz"])

    def test_export_saves_where_chosen_and_confirms_replacing(self):
        target = self.root / "INCAR"
        self.assertEqual(viewer.export_file(str(target), b"one"), {"path": str(target)})
        self.assertEqual(viewer.export_file(str(target), b"two"), {"exists": True, "path": str(target)})
        self.assertEqual(target.read_bytes(), b"one")
        viewer.export_file(str(target), b"two", overwrite=True)
        self.assertEqual(target.read_bytes(), b"two")
        image = self.root / "view.png"
        viewer.export_file(str(image), b"\x89PNG")
        self.assertEqual(image.read_bytes(), b"\x89PNG")
        self.assertEqual(sorted(item.name for item in self.root.iterdir()), ["INCAR", "view.png"])
        for raw in [str(self.root / ".bashrc"), "relative.cif", str(self.root / "missing/a.cif"), str(self.root), ""]:
            with self.assertRaises(ValueError):
                viewer.export_file(raw, b"x")


class HostTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "water.xyz"
        self.path.write_bytes(WATER.encode())  # exact bytes; Windows text mode would add CR
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), viewer.HostHandler)
        self.httpd.daemon_threads = True
        self.httpd.token = "test-token"
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.directory.cleanup()

    def call(self, method, path, body=None, token="test-token", host=None):
        headers = {"Content-Type": "application/json", viewer.HEADER: token}
        if host:
            headers["Host"] = host
        request = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method, headers=headers,
                                         data=None if body is None else json.dumps(body).encode())
        with OPENER.open(request, timeout=5) as response:
            return json.loads(response.read())

    def assertForbidden(self, *args, **kwargs):
        with self.assertRaises(HTTPError) as caught:
            self.call(*args, **kwargs)
        self.assertEqual(caught.exception.code, 403)

    def test_api_requires_token_and_loopback_host(self):
        query = f"/api/file?path={quote(str(self.path))}"
        self.assertForbidden("GET", query, token="")
        self.assertForbidden("GET", query, token="wrong")
        self.assertForbidden("GET", query, host=f"evil.example:{self.port}")
        self.assertForbidden("POST", "/api/open", {"path": str(self.path)}, token="")
        self.assertEqual(self.call("GET", "/api/health", token="")["name"], "catgo-viewer")

    def test_read_save_conflict_and_open(self):
        value = self.call("GET", f"/api/file?path={quote(str(self.path))}")
        self.assertEqual(value["text"], WATER)
        conflict = self.call("POST", "/api/file", {"path": str(self.path), "text": "x", "ifMatch": "old"})
        self.assertEqual(conflict, {"outcome": "conflict", "etag": value["etag"]})
        saved = self.call("POST", "/api/file", {"path": str(self.path), "text": WATER + "\n", "ifMatch": value["etag"]})
        self.assertEqual(saved["outcome"], "saved")
        opened = self.call("POST", "/api/open", {"path": str(self.path)})
        self.assertEqual(opened["name"], "water.xyz")
        self.assertTrue(opened["uri"].startswith("catgo-file:"))
        with self.assertRaises(HTTPError):
            self.call("GET", "/api/file?path=/etc/passwd")
        png = str(self.path.with_name("view.png"))
        image = self.call("POST", "/api/export", {"path": png, "blob": "iVBORw=="})
        self.assertEqual(Path(image["path"]).read_bytes(), b"\x89PNG")
        self.assertTrue(self.call("POST", "/api/export", {"path": png, "text": "x"})["exists"])
        self.call("POST", "/api/export", {"path": png, "text": "x", "overwrite": True})
        self.assertEqual(Path(png).read_text(), "x")
        with self.assertRaises(HTTPError):
            self.call("POST", "/api/export", {"path": png, "blob": "not base64!", "overwrite": True})

    def test_editor_page_carries_policy(self):
        with OPENER.open(f"http://127.0.0.1:{self.port}/editor", timeout=5) as response:
            html = response.read().decode()
            self.assertIn("Content-Security-Policy", response.headers)
        self.assertIn('http-equiv="Content-Security-Policy"', html)


class McpTests(unittest.TestCase):
    def test_stdio_tools_and_errors(self):
        requests = [{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
                    {"jsonrpc": "2.0", "method": "notifications/initialized"},
                    {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                    {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "view_structure", "arguments": {"path": "relative.cif"}}}]
        result = subprocess.run([sys.executable, str(ROOT / "claude_server.py")], input="".join(json.dumps(r) + "\n" for r in requests),
                                encoding="utf-8", capture_output=True, check=True)
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([r["id"] for r in replies], [1, 2, 3])
        self.assertIn("Browser pane", replies[0]["result"]["instructions"])
        self.assertEqual([t["name"] for t in replies[1]["result"]["tools"]], ["view_structure", "open_viewer", "get_viewer_selection"])
        self.assertTrue(replies[2]["result"]["isError"])

    def test_claude_manifest_overrides_codex_server(self):
        manifest = json.loads((ROOT / ".claude-plugin/plugin.json").read_text(encoding="utf-8"))
        codex = json.loads((ROOT / ".mcp.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["version"], viewer.VERSION)
        # Claude Code also reads .mcp.json; the same server name replaces the Codex entry.
        self.assertEqual(set(manifest["mcpServers"]), set(codex["mcpServers"]))
        self.assertEqual(manifest["mcpServers"]["catgo-editor"]["args"], ["${CLAUDE_PLUGIN_ROOT}/claude_server.py"])


if __name__ == "__main__":
    unittest.main()
