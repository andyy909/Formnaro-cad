"""Private VTK type bridge for the frozen, headless STL converter.

OCP's IVtk bindings import the `vtk` umbrella during CadQuery initialization.
The upstream umbrella imports every VTK extension, including viewers, VR,
movie codecs and scientific file readers. The converter has a fixed file
protocol and uses none of those APIs. Retain the real VTK core types used by
OCP; rendering/export modules imported directly by CadQuery remain real modules
and are collected with their normal dependency hooks.

This module is only on the converter freeze path, never on FreeCAD's or the
application's general Python path. It is not a replacement general VTK API.
"""
from vtkmodules.vtkCommonCore import *
from vtkmodules.vtkCommonDataModel import *
from vtkmodules.vtkCommonMath import *
from vtkmodules.vtkCommonTransforms import *
from vtkmodules.vtkCommonExecutionModel import *
from vtkmodules.vtkFiltersCore import *
from vtkmodules.vtkRenderingCore import *
from vtkmodules.vtkCommonCore import vtkVersion

VTK_VERSION = vtkVersion.GetVTKVersion()
