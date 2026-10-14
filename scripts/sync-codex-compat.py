"""Generate the legacy Codex entrypoints from the portable package metadata."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "plugins/catgo-editor"


def compatibility_files():
    manifest = json.loads((ROOT / "plugin.json").read_text(encoding="utf-8"))
    config = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    overlay = {key: manifest[key] for key in
               ("name", "version", "description", "author", "repository", "license")}
    overlay["interface"] = manifest["extensions"]["com.openai"]["interface"]
    overlay["mcpServers"] = "./.mcp.json"
    servers = {}
    for name, server in config["mcpServers"].items():
        if server["type"] != "stdio":
            raise ValueError("Review the compatibility conversion for a new transport.")
        servers[name] = {key: value for key, value in server.items() if key != "type"}
        servers[name]["args"] = [arg.removeprefix("${PLUGIN_ROOT}/")
                                 for arg in server["args"]]
        # Legacy Codex resolves a relative cwd from the installed plugin root.
        # The launcher then needs no client-specific environment interpolation.
        servers[name]["cwd"] = "."
    return {".codex-plugin/plugin.json": overlay,
            ".mcp.json": {"mcpServers": servers}}


if __name__ == "__main__":
    for name, content in compatibility_files().items():
        path = ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
        print(name)
