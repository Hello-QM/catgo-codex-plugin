"""Check the installed Codex plugin loader without starting an agent or chat."""
import json
from pathlib import Path
import select
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
MARKETPLACE = next((parent / ".agents/plugins/marketplace.json" for parent in ROOT.parents
                    if (parent / ".agents/plugins/marketplace.json").is_file()), ROOT.parent / ".agents/plugins/marketplace.json")


def check():
    process = subprocess.Popen(
        ["codex", "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, bufsize=1,
    )

    def request(request_id, method, params):
        process.stdin.write(json.dumps({"id": request_id, "method": method, "params": params}) + "\n")
        process.stdin.flush()
        end = time.monotonic() + 15
        while time.monotonic() < end:
            if select.select([process.stdout], [], [], 1)[0]:
                line = process.stdout.readline()
                if not line:
                    raise RuntimeError("Codex app-server exited")
                reply = json.loads(line)
                if reply.get("id") == request_id:
                    if "error" in reply:
                        raise RuntimeError(reply["error"]["message"])
                    return reply["result"]
        raise TimeoutError(f"No response to {method}")

    try:
        request(1, "initialize", {
            "clientInfo": {"name": "catgo-registration-check", "version": json.loads((ROOT / "plugin.json").read_text())["version"]},
            "capabilities": {"experimentalApi": True},
        })
        process.stdin.write(json.dumps({"method": "initialized"}) + "\n")
        process.stdin.flush()
        plugin = request(2, "plugin/read", {
            "pluginName": "catgo-editor", "marketplacePath": str(MARKETPLACE),
        })["plugin"]
        report = {
            "installed": plugin["summary"]["installed"],
            "enabled": plugin["summary"]["enabled"],
            "version": plugin["summary"]["localVersion"],
            "mcpServers": plugin["mcpServers"],
        }
        print(json.dumps(report, indent=2))
        if not report["mcpServers"]:
            raise RuntimeError("Codex did not discover the plugin MCP server")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


if __name__ == "__main__":
    check()
