"""Install with a real Codex CLI in disposable state, then check MCP discovery."""
import argparse
import json
import os
from pathlib import Path
from queue import Queue, Empty
import shutil
import subprocess
import sys
import tempfile
from threading import Thread
import time

ROOT = Path(__file__).resolve().parents[1]


def check(binary, marketplace):
    binary = shutil.which(binary) or binary
    binary = str(Path(binary).resolve())
    version = subprocess.check_output([binary, "--version"], text=True).strip()
    expected = json.loads((ROOT / "plugins/catgo-editor/plugin.json").read_text(
        encoding="utf-8"))["version"]
    with tempfile.TemporaryDirectory(prefix="catgo-cli-install-") as home:
        env = {**os.environ, "CODEX_HOME": home}

        def cli(*args):
            result = subprocess.run([binary, "plugin", *args], env=env,
                                    capture_output=True, text=True, timeout=180)
            if result.returncode:
                raise RuntimeError(f"{args}: {result.stdout}\n{result.stderr}")
            return result.stdout

        cli("marketplace", "add", marketplace)
        cli("add", "catgo-editor@catgo")
        installed = Path(home) / "plugins/cache/catgo/catgo-editor" / expected
        for name in ("plugin.json", ".codex-plugin/plugin.json", "mcp.json", ".mcp.json"):
            if not (installed / name).is_file():
                raise RuntimeError(f"Installation omitted {name}")

        process = subprocess.Popen([binary, "app-server"], env=env,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True,
                                   encoding="utf-8", bufsize=1)
        messages = Queue()

        def read_messages():
            for line in process.stdout:
                messages.put(json.loads(line))
            messages.put(None)

        reader = Thread(target=read_messages, daemon=True)
        reader.start()

        def request(request_id, method, params):
            process.stdin.write(json.dumps({"id": request_id, "method": method,
                                           "params": params}) + "\n")
            process.stdin.flush()
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    reply = messages.get(timeout=max(0.01, deadline - time.monotonic()))
                except Empty:
                    break
                if reply is None:
                    raise RuntimeError("Codex app-server exited")
                if reply.get("id") == request_id:
                    if "error" in reply:
                        raise RuntimeError(reply["error"])
                    return reply["result"]
            raise TimeoutError(f"No response to {method}")

        try:
            request(1, "initialize", {
                "clientInfo": {"name": "catgo-install-check", "version": expected},
                "capabilities": {"experimentalApi": True},
            })
            process.stdin.write(json.dumps({"method": "initialized"}) + "\n")
            process.stdin.flush()
            plugin = request(2, "plugin/read", {
                "pluginName": "catgo-editor",
                "marketplacePath": str(ROOT / ".agents/plugins/marketplace.json"),
            })["plugin"]
            summary = plugin["summary"]
            if not summary["installed"] or not summary["enabled"]:
                raise RuntimeError(f"Installed plugin not active: {summary}")
            if summary["localVersion"] != expected:
                raise RuntimeError(f"Wrong installed version: {summary}")
            if plugin["mcpServers"] != ["catgo-editor"]:
                raise RuntimeError(f"MCP discovery failed: {plugin['mcpServers']}")
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            reader.join(timeout=5)
            process.stdin.close()
            process.stdout.close()

        # Exercise the installed legacy launcher without requiring model access.
        launcher = json.loads((installed / ".mcp.json").read_text(
            encoding="utf-8"))["mcpServers"]["catgo-editor"]
        requests = [{"jsonrpc": "2.0", "id": 1, "method": "initialize",
                     "params": {"protocolVersion": "2025-06-18"}},
                    {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}]
        result = subprocess.run([launcher["command"], *launcher["args"]],
                                cwd=installed / launcher["cwd"], env=env,
                                input="".join(json.dumps(r) + "\n" for r in requests),
                                capture_output=True, text=True, encoding="utf-8",
                                timeout=30, check=True)
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        assert replies[0]["result"]["serverInfo"]["version"] == expected
        assert replies[1]["result"]["tools"][0]["name"] == "open_catgo_file"
        return {"cli": version, "pluginVersion": expected, "platform": sys.platform,
                "marketplace": marketplace, "installed": True, "enabled": True,
                "mcpServers": plugin["mcpServers"], "legacyLauncherStarted": True,
                "nativeCodexRenderingVerified": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex", default="codex", help="Codex executable to test")
    parser.add_argument("--npm-prefix", help="Locate the native executable in an npm installation")
    parser.add_argument("--marketplace", default=str(ROOT),
                        help="Local marketplace or GitHub owner/repo")
    args = parser.parse_args()
    if args.npm_prefix:
        modules = Path(args.npm_prefix).resolve() / "node_modules"
        # Use the native process so cleanup also works on Windows, where a .cmd
        # shim would leave an app-server child behind when terminated.
        candidates = []
        for pattern in ("@openai/codex*/vendor/*/codex/*",
                        "@openai/codex/node_modules/@openai/codex*/vendor/*/codex/*"):
            candidates.extend(path for path in modules.glob(pattern)
                              if path.name in ("codex", "codex.exe"))
        if len(candidates) != 1:
            raise RuntimeError(f"Expected one native npm executable: {candidates}")
        args.codex = str(candidates[0])
    print(json.dumps(check(args.codex, args.marketplace), indent=2))
