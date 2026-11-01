"""Developer audit of native dependencies; requires pefile, never shipped.

Includes regular imports, delayed imports and forwarded exports. This is a
conservative native closure, not proof about every possible LoadLibrary call.
The explicit dynamic roots and real packaged feature tests complement it.
"""
import argparse
import concurrent.futures
import json
from collections import defaultdict
from pathlib import Path
import pefile

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', required=True)
parser.add_argument('--kind', choices=['freecad','converter','speech','electron'], default='freecad')
parser.add_argument('--output', required=True)
parser.add_argument('--profile', default=str(Path(__file__).with_name('portable-freecad-profile.json')))
args = parser.parse_args()
root = Path(args.runtime).resolve()
profile = json.loads(Path(args.profile).read_text(encoding='utf-8'))
omitted = {name.lower() for name in profile['omittedPythonPackages']}
excluded = {row['file'].lower() for row in profile['nativeExclusions']}
old_optional = {'fem', 'femgui', 'path', 'pathgui', 'robot', 'robotgui',
                'reverseengineering', 'reverseengineeringgui', 'inspection', 'inspectiongui'}
core = {'bin/freecad.exe', 'bin/freecadcmd.exe', 'bin/python.exe', 'bin/python3.dll',
        'bin/opengl32sw.dll', 'formnaro-container.exe', 'lib/qt6/uic.exe', 'lib/qt6/rcc.exe'}
if args.kind == 'converter':
    omitted, excluded = set(), set()
    core = {'formnaro-konverter.exe'}
elif args.kind in {'speech', 'electron'}:
    omitted, excluded = set(), set()
    core = {'whisper-cli.exe' if args.kind == 'speech' else 'formnaro.exe'}
if core & excluded:
    raise SystemExit('Profile excludes an essential executable/dynamic root')


def parse(file):
    with pefile.PE(str(file), fast_load=True) as pe:
        pe.parse_data_directories(directories=[0, 1, 13])
        imports = {entry.dll.decode('ascii').lower()
                   for kind in ['DIRECTORY_ENTRY_IMPORT', 'DIRECTORY_ENTRY_DELAY_IMPORT']
                   for entry in getattr(pe, kind, [])}
        for symbol in getattr(getattr(pe, 'DIRECTORY_ENTRY_EXPORT', None), 'symbols', []):
            if symbol.forwarder:
                target = symbol.forwarder.decode('ascii').rsplit('.', 1)[0].lower()
                imports.add(target if target.endswith('.dll') else target + '.dll')
    return {'file': file.relative_to(root).as_posix(), 'bytes': file.stat().st_size,
            'imports': sorted(imports)}


files = [file for file in (root.iterdir() if args.kind in {'speech', 'electron'} else root.rglob('*'))
         if file.is_file() and file.suffix.lower() in {'.dll', '.pyd', '.exe'}]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    rows = list(pool.map(parse, files))
index = {row['file']: row for row in rows}
missing_roots = sorted(core - {file.lower() for file in index})
names = defaultdict(list)
roots = []
for row in rows:
    file = row['file']
    lower = file.lower()
    names[Path(file).name.lower()].append(file)
    if lower in excluded:
        continue
    if lower.startswith('bin/lib/site-packages/') and file.split('/')[3].lower() in omitted:
        continue
    if lower.startswith('lib/') and Path(lower).stem in old_optional:
        continue
    if args.kind in {'speech', 'electron'} or lower in core or lower.endswith('.pyd') or '/plugins/' in lower or '/qml/' in lower:
        roots.append(file)
    elif lower.startswith(('bin/tk', 'bin/icu', 'bin/msvc', 'bin/vcruntime', 'bin/concrt', 'bin/vcomp')):
        roots.append(file)
visited, missing, ambiguous = set(), set(), []
todo = list(roots)
while todo:
    file = todo.pop()
    if file in visited:
        continue
    visited.add(file)
    for dependency in index[file]['imports']:
        choices = names.get(dependency, [])
        if not choices:
            missing.add(dependency)
            continue
        target = next((p for p in choices if Path(p).parent == Path(file).parent), None)
        target = target or next((p for p in choices if p.lower().startswith('bin/' if args.kind == 'freecad' else '_internal/') and p.count('/') == 1), None)
        if target:
            todo.append(target)
        else:
            todo.extend(choices)
            if len(choices) > 1:
                ambiguous.append({'file': file, 'dependency': dependency, 'choices': choices})
stock = set('advapi32 authz bcrypt bcryptprimitives bthprops cabinet cfgmgr32 combase comctl32 comdlg32 crypt32 cryptui d2d1 d3d9 d3d11 d3d12 dbghelp dcomp dhcpcsvc dnsapi dwmapi dwrite dxgi gdi32 hid imagehlp imm32 iphlpapi kernel32 mf mfplat mfreadwrite mmdevapi mpr mscoree msi msvcrt msvcp_win ncrypt netapi32 normaliz ntdll odbc32 ole32 oleacc oleaut32 opengl32 pdh propsys psapi rpcrt4 secur32 setupapi shell32 shlwapi tbs ucrtbase uiautomationcore urlmon user32 userenv uxtheme version wevtapi winhttp winmm wintrust winusb ws2_32 wsock32 wtsapi32'.split())
non_system = sorted(name for name in missing if not name.startswith(('api-ms-win-', 'ext-ms-win-'))
                    and Path(name).stem not in stock and name != 'winspool.drv')
blocked = sorted(file for file in visited if file.lower() in excluded)
result = {'ok': not non_system and not blocked and not ambiguous and not missing_roots, 'runtime': str(root),
          'files': rows, 'roots': roots, 'reachable': sorted(visited),
          'unreachableCandidates': [row for row in rows if row['file'] not in visited],
          'unresolvedWindowsImports': sorted(missing - set(non_system)),
          'nonSystemMissingImports': non_system, 'excludedButRequired': blocked,
          'ambiguous': ambiguous, 'missingEssentialRoots': missing_roots, 'includesDelayImportsAndForwarders': True}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({key: result[key] for key in ['ok', 'nonSystemMissingImports', 'excludedButRequired', 'ambiguous', 'missingEssentialRoots']}))
if not result['ok']:
    raise SystemExit('Native dependency audit failed')
