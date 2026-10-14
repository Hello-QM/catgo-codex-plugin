"""Package the prebuilt local MCP runtime; source is supplied by the repo."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
version = json.loads((ROOT / 'plugin.json').read_text())['version']
names = ['plugin.json', 'mcp.json', 'server.py', 'README.md', 'LICENSE',
         'CITATION.cff', 'THIRD_PARTY_NOTICES.md']
files = [ROOT / name for name in names]
for name in ['assets', 'third_party']:
    files.extend(file for file in (ROOT / name).rglob('*') if file.is_file())
for file in files:
    if file.is_symlink():
        raise ValueError(f'Symlink cannot enter a release: {file.relative_to(ROOT)}')
directory = REPO / 'dist'
directory.mkdir(exist_ok=True)
archive = directory / f'catgo-editor-{version}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for file in sorted(files):
        info = zipfile.ZipInfo((Path('catgo-editor') / file.relative_to(ROOT)).as_posix(),
                               date_time=(2026, 10, 13, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        package.writestr(info, file.read_bytes())
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n')
print(json.dumps({'archive': str(archive), 'files': len(files),
                  'bytes': archive.stat().st_size, 'sha256': checksum}, indent=2))
