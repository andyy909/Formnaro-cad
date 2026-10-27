# Local headless converter. Engine sources are pinned in provenance.json.
import os
for variable in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMBA_NUM_THREADS'):
    os.environ.setdefault(variable, '1')
from PyInstaller.utils.hooks import collect_all, copy_metadata
datas, binaries, hiddenimports = [], [], []
for name in ('OCP', 'fast_simplification', 'rtree', 'trimesh', 'winrt'):
    d, b, h = collect_all(name)
    datas += d; binaries += b; hiddenimports += h
for name in ('winrt-runtime', 'winrt-Windows.Foundation', 'winrt-Windows.Foundation.Collections',
             'winrt-Windows.Graphics.Printing3D', 'winrt-Windows.Storage', 'winrt-Windows.Storage.Streams'):
    datas += copy_metadata(name)
a = Analysis([os.path.join(SPECPATH, 'bridge.py')], pathex=[SPECPATH], binaries=binaries, datas=datas,
             hiddenimports=hiddenimports, excludes=['IPython', 'notebook', 'pytest', 'pymeshfix', 'matplotlib', 'tkinter'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Formnaro-Konverter', console=False,
          strip=False, upx=False, disable_windowed_traceback=True)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='Formnaro-Konverter')
