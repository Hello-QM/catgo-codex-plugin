import importlib.util
import base64
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("editor_server", ROOT / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class EditorTests(unittest.TestCase):
    def test_portable_mcp_schema(self):
        config = json.loads((ROOT / "mcp.json").read_text())
        self.assertEqual(config["$schema"], "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json")
        self.assertEqual(config["mcpServers"]["catgo-editor"]["type"], "stdio")

    def test_stdio_lifecycle(self):
        requests = [{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
                    {"jsonrpc": "2.0", "method": "notifications/initialized"},
                    {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                    {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "open_catgo_editor", "arguments": {}}},
                    {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "open_catgo_file", "arguments": {"file": {"name": "氧化铱.cif", "resourceUri": "host-resource://氧化铱"}}}}]
        result = subprocess.run([sys.executable, str(ROOT / "server.py")], input="".join(json.dumps(r, ensure_ascii=False) + "\n" for r in requests), encoding="utf-8", capture_output=True, check=True)
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([r["id"] for r in replies], [1, 2, 3, 4])
        version = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))["version"]
        self.assertEqual(replies[0]["result"]["serverInfo"]["version"], version)
        tools = replies[1]["result"]["tools"]
        self.assertEqual(tools[0]["_meta"]["openai/ui"]["entrypoints"][0]["type"], "file")
        self.assertIn(".cif", tools[0]["_meta"]["openai/ui"]["entrypoints"][0]["extensions"])
        self.assertEqual(tools[1]["_meta"]["openai/ui"]["entrypoints"], [{"type": "thread"}])
        self.assertIn("content", replies[2]["result"])
        self.assertEqual(tools[0]["_meta"]["ui"]["resourceUri"], f"ui://catgo/editor/{version}")
        self.assertEqual(replies[3]["result"]["structuredContent"]["file"]["name"], "氧化铱.cif")

    def test_bundled_editor_resource(self):
        resource = server.resource()
        self.assertIn('<div id="app">', resource["text"])
        self.assertEqual(resource["_meta"]["ui"]["csp"]["frameDomains"], [])
        self.assertEqual(resource["mimeType"], "text/html;profile=mcp-app")
        self.assertLess(len(resource["text"].encode()), 384 * 1024)

    def test_program_chunks_reassemble_the_verified_bundle(self):
        manifest = json.loads((ROOT / "assets/program-manifest.json").read_text())
        parts = []
        for chunk in manifest["chunks"]:
            result = server.dispatch("resources/read", {"uri": chunk["uri"]})["contents"][0]
            self.assertEqual(result["uri"], chunk["uri"])
            self.assertLess(len(json.dumps(result)), 600 * 1024)
            parts.append(base64.b64decode(result["blob"]))
        compressed = b"".join(parts)
        self.assertEqual(len(compressed), manifest["compressedBytes"])
        javascript = gzip.decompress(compressed)
        self.assertEqual(len(javascript), manifest["javascriptBytes"])
        self.assertEqual(hashlib.sha256(javascript).hexdigest(), manifest["sha256"])

    def test_program_uri_is_allowlisted(self):
        for uri in ["catgo-assets://editor/old-version/0", "catgo-assets://../../server.py", "catgo-assets://editor/0/9999"]:
            with self.assertRaises(ValueError):
                server.dispatch("resources/read", {"uri": uri})

    def test_running_server_keeps_assets_if_version_cache_is_removed(self):
        manifest = json.loads((ROOT / "assets/program-manifest.json").read_text())
        uri = manifest["chunks"][0]["uri"]
        server.dispatch("initialize", {})
        expected_html, expected_chunk = server.resource(), server.program_resource(uri)
        with patch.object(server, "ROOT", ROOT / "deleted-version-cache"):
            self.assertEqual(server.resource(), expected_html)
            self.assertEqual(server.program_resource(uri), expected_chunk)

    def test_file_opener_does_not_resolve_or_read_host_uri(self):
        result = server.dispatch("tools/call", {"name": "open_catgo_file", "arguments": {"file": {"name": "sample.xyz", "resourceUri": "host-resource://opaque"}}})
        self.assertEqual(result["structuredContent"]["file"]["resourceUri"], "host-resource://opaque")
        with self.assertRaises(ValueError):
            server.dispatch("tools/call", {"name": "open_catgo_file", "arguments": {"path": "/tmp/sample.xyz"}})


if __name__ == "__main__":
    unittest.main()
