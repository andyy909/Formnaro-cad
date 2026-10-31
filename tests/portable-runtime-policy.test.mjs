import test from 'node:test';
import assert from 'node:assert/strict';
import {cadExclusion} from '../scripts/portable-runtime-policy.mjs';
test('Portable CAD omits developer inputs but preserves native/Python/GUI functionality and license notices',()=>{
 for(const name of ['sources/freecad_source_1.1.4.tar.gz','bin/python311.pdb','lib/cmake/vtk/VTKConfig.cmake','include/tool.h','lib/Qt6Core.prl','lib/qt6/bin/lupdate.exe','lib/qt6/moc.exe','Mod/Fem/femtest.py','Mod/BIM/Arch.py','Mod/CAM/Path/Main.py','bin/Lib/test/test_math.py','bin/Lib/site-packages/numpy/tests/test_public_api.py','data/examples/Part.FCStd','Mod/Draft/drafttests/test_make.py','Mod/Part/parttests/test_box.py','bin/Lib/tkinter/test/test_widgets.py','bin/Lib/idlelib/idle_test/test_edit.py'])assert(cadExclusion(name),name);
 for(const name of ['bin/FreeCAD.exe','bin/FreeCADCmd.exe','bin/python311.dll','lib/Part.pyd','bin/Qt6Core.dll','lib/qt6/uic.exe','lib/qt6/rcc.exe','bin/Lib/site-packages/cffi/api.py','share/doc/third-party/LICENSE.txt','doc/LICENSE.html','bin/Lib/unittest/__init__.py','bin/Lib/site-packages/numpy/testing/__init__.py','Mod/Draft/InitGui.py','Mod/PartDesign/Init.py','Mod/TechDraw/Init.py'])assert.equal(cadExclusion(name),null,name);
});

test('Core executables, OpenBLAS forwarder target and software GPU fallback survive the deep profile',()=>{
 for(const file of ['bin/FreeCAD.exe','bin/freecadcmd.exe','bin/python.exe','bin/python3.dll','bin/openblas.dll','bin/opengl32sw.dll','bin/MSVCP140.dll','lib/Part.pyd','lib/Sketcher.pyd'])assert.equal(cadExclusion(file),null,file);
 for(const file of ['bin/libclang-13.dll','bin/gmsh.dll','bin/Lib/site-packages/OCC/Core/gp.py','bin/Lib/site-packages/scipy/__init__.py','Mod/Plot/Plot.py','lib/qt6/bin/Qt6Core.dll'])assert(cadExclusion(file),file);
});
