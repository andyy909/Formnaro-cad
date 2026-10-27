"""Launch only the SHA-verified portable reader using an isolated task profile."""
from pathlib import Path
import os,sys,json,subprocess,hashlib
work=Path(__file__).resolve().parents[2]/'work'/'cad-independent-step'
binary=work/'freecad'/'FreeCAD_1.1.4-Windows-x86_64-py311'/'bin'/'FreeCADCmd.exe'
if not binary.is_file():raise RuntimeError('Verified portable FreeCAD not extracted yet')
profile=work/'freecad-profile'
for child in ('user','data','temp'): (profile/child).mkdir(parents=True,exist_ok=True)
env=dict(os.environ)
env.update(FREECAD_USER_HOME=str(profile/'user'),FREECAD_USER_DATA=str(profile/'data'),FREECAD_USER_TEMP=str(profile/'temp'),PYTHONDONTWRITEBYTECODE='1')
fixture=sys.argv[1] if len(sys.argv)>1 else 'formnaro-ap214'
if fixture not in ('formnaro-ap214','formnaro-complex','help'):raise RuntimeError('Unknown fixture')
env['FORMNARO_STEP_PROOF_STEM']=fixture
arguments=['--user-cfg',str(profile/'user.cfg'),'--system-cfg',str(profile/'system.cfg'),'--log-file',str(work/('freecad-'+fixture+'-native.log'))]
arguments+=['--help'] if fixture=='help' else [str(Path(__file__).resolve().with_name('freecad-proof.py'))]
result=subprocess.run([str(binary),*arguments],env=env,cwd=work,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)
for channel,value in [('stdout',result.stdout),('stderr',result.stderr)]:
    (work/('freecad-'+fixture+'-'+channel+'.log')).write_bytes(value)
    print(channel+': '+value.decode('utf-8',errors='replace')[-6000:])
print(json.dumps({'exitCode':result.returncode,'executableSha256':hashlib.sha256(binary.read_bytes()).hexdigest()}))
if result.returncode:raise RuntimeError('Independent FreeCAD proof failed')
