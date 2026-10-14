"""Validate the GitHub marketplace and self-contained runtime assets."""
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / '.agents/plugins/marketplace.json').read_text())
assert catalog['name'] == 'catgo'
assert len(catalog['plugins']) == 1
entry = catalog['plugins'][0]
plugin = (ROOT / entry['source']['path']).resolve()
assert plugin.is_relative_to(ROOT)
manifest = json.loads((plugin / 'plugin.json').read_text())
assert manifest['name'] == entry['name'] == 'catgo-editor'
assert re.fullmatch(r'\d+\.\d+\.\d+', manifest['version'])
interface = manifest['extensions']['com.openai']['interface']
assert len(interface['shortDescription']) <= 30
for name in ['logo', 'composerIcon']:
    path = (plugin / interface[name]).resolve()
    assert path.is_relative_to(plugin) and path.is_file()
config = json.loads((plugin / 'mcp.json').read_text())
server = config['mcpServers']['catgo-editor']
assert server == {'type': 'stdio', 'command': 'python3',
                  'args': ['${PLUGIN_ROOT}/server.py']}
assert config['$schema'] == 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
assert (plugin / 'LICENSE').read_bytes() == (ROOT / 'LICENSE').read_bytes()
assert (plugin / 'server.py').is_file()
assert (plugin / 'assets/editor.html').stat().st_size < 384 * 1024
program = json.loads((plugin / 'assets/program-manifest.json').read_text())
chunks = []
for chunk in program['chunks']:
    path = (plugin / 'assets/program' / chunk['filename']).resolve()
    assert path.is_relative_to(plugin / 'assets/program')
    data = path.read_bytes()
    assert len(data) == chunk['bytes']
    chunks.append(data)
compressed = b''.join(chunks)
assert len(compressed) == program['compressedBytes']
javascript = gzip.decompress(compressed)
assert len(javascript) == program['javascriptBytes']
assert hashlib.sha256(javascript).hexdigest() == program['sha256']
receipt = json.loads((plugin / 'assets/build-receipt.json').read_text())
assert receipt['version'] == manifest['version']
wasm = (ROOT / 'vendor/catgo/extensions/rust-wasm/pkg/ferrox_bg.wasm').read_bytes()
assert hashlib.sha256(wasm).hexdigest() == receipt['slabAlignment']['scalarWasmSha256']
print(json.dumps({'marketplace': catalog['name'], 'plugin': manifest['name'],
                  'version': manifest['version'], 'chunks': len(chunks),
                  'programSha256': program['sha256']}, indent=2))
