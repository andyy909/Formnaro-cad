from pathlib import Path,PureWindowsPath
import hashlib,subprocess
work=Path(__file__).resolve().parents[2]/'work'/'cad-independent-step'
archive=work/'FreeCAD_1.1.4-Windows-x86_64-py311.7z'
extractor=work/'7zr.exe'
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        while block:=stream.read(1024*1024):h.update(block)
    return h.hexdigest()
assert digest(archive)=='4828741fc91ee37fafcdb97a1abacb18b04ba451ac4372d9ff7a7349b36f4d6d'
assert digest(extractor)=='256feca8e274e5da655e2a284fabafd9f554365eb164862089dacd4e8276d282'
listing=(work/'freecad-archive-list.txt').read_text(encoding='utf-8-sig').split('----------',1)[1]
for line in listing.splitlines():
    if line.startswith('Path = '):
        name=PureWindowsPath(line[7:])
        if name.is_absolute() or '..' in name.parts or name.parts[0]!='FreeCAD_1.1.4-Windows-x86_64-py311':raise RuntimeError('Unsafe portable archive path')
target=work/'freecad'
assert target.resolve().is_relative_to(work.resolve())
with (work/'freecad-extraction.log').open('wb') as log:
    result=subprocess.run([str(extractor),'x',str(archive),'-o'+str(target),'-y'],stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
if result.returncode:raise RuntimeError('Portable FreeCAD extraction failed')
print(str(target/'FreeCAD_1.1.4-Windows-x86_64-py311'/'bin'/'FreeCADCmd.exe'))
