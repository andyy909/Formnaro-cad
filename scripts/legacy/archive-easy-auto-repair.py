"""Archive only the frozen new program and public sources; never traverse user profiles."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'work/easy-auto-repair/checks'
def sha(file):
 with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def safe(name):
 assert not name.startswith('/') and '\\' not in name
 assert not any(p.lower() in {'..','daten','layouts','projekte','work','node_modules','.git','__pycache__','ai-bridge.json','ai-settings.json'} or p.lower().startswith('.env') for p in name.split('/')),name
def main():
 proof=json.loads((WORK/'final-audit.json').read_text(encoding='utf-8'));assert proof['ok'] and proof['version']=='0.40.0'
 runtime=Path(proof['runtime']);source=runtime.parent/'Formnaro-Quellcode-v0.40.0.zip'
 kernel=ROOT/'release-formnaro-stl-konverter-v0.12.1/Formnaro-CAD-Quellen-v0.12.zip'
 with zipfile.ZipFile(kernel) as z:
  assert z.testzip() is None
  for name in ['upstream-lock.json','wrappers/formnaro-cad-bridge.cpp']:assert z.read('cad-kernel-build/'+name)==(ROOT/'cad-kernel-build'/name).read_bytes()
  assert z.read('generated/build-inputs.json')==(ROOT/'cad-kernel-build/runtime/build-inputs.json').read_bytes()
  for e in json.loads((ROOT/'cad-kernel-build/upstream-lock.json').read_text(encoding='utf-8'))['sources']:
   data=z.read('upstream/'+e['file']);assert len(data)==e['bytes'] and hashlib.sha256(data).hexdigest()==e['sha256']
 with zipfile.ZipFile(source,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
  for e in proof['sourceManifest']:
   safe(e['file']);file=ROOT/e['file'];assert sha(file)==e['sha256'];z.write(file,e['file'])
 entries=[]
 for e in proof['runtimeFiles']:
  file=runtime/e['file'];assert not file.is_symlink() and sha(file)==e['sha256'];safe('App/'+e['file']);entries.append(('App/'+e['file'],file))
 entries += [(source.name,source),(kernel.name,kernel),('Easy-Tinker-und-Layout.md',ROOT/'docs/EASY-TINKER-UND-LAYOUT.md')]
 for name,digest in proof['proofs'].items():assert sha(WORK/name)==digest;entries.append(('Pruefnachweise/'+name,WORK/name))
 entries.append(('Pruefnachweise/final-audit.json',WORK/'final-audit.json'))
 target=ROOT/'output/Formnaro-Easy-Autoreparatur-v0.40.0.zip';target.parent.mkdir(exist_ok=True)
 manifest=[{'file':name,'sha256':sha(file),'bytes':file.stat().st_size} for name,file in entries]
 with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
  for name,file in entries:safe(name);z.write(file,name,compress_type=zipfile.ZIP_STORED if file.suffix=='.zip' else zipfile.ZIP_DEFLATED)
  z.writestr('Paket-Pruefung.json',json.dumps({'version':'0.40.0','includesUserData':False,'files':manifest},ensure_ascii=False,indent=2))
 for file,expected in [(source,proof['sourceManifest']),(target,manifest)]:
  with zipfile.ZipFile(file) as z:
   assert z.testzip() is None
   for e in expected:
    with z.open(e['file']) as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==e['sha256']
 result={'ok':True,'version':'0.40.0','zip':str(target),'zipSha256':sha(target),'bytes':target.stat().st_size,'entries':len(entries)+1,'sourceZip':str(source),'sourceSha256':sha(source)}
 (WORK/'archives.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
if __name__=='__main__':main()
