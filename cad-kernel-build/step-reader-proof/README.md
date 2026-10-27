# Separate STEP reader proof

Run on Windows with Node and Python 3.10+:

```powershell
pwsh -File cad-kernel-build/step-reader-proof/run.ps1
```

This explicit integration gate requires the materialized common CAD kernel and
downloads pinned official portable binaries into `work/cad-independent-step`.
Missing binaries, bad hashes, native reader errors or failed assertions fail the
command. No skip, package installation, global environment change or upload is
used. FreeCAD receives a separate task profile, configuration files and temporary
directory. Downloaded assets and generated STEP/BRep/evidence stay outside Git.

The official FreeCAD 1.1.4 Windows x86_64 py311 executable was actually run:
FreeCAD commit `4fd3bf320d9566a27e60069fc8387448aaa3a094`, native OCCT **7.8.1**.
Formnaro exports through its own extended common OCCT **8.0.1** WASM build.
This is an independent application, binary, STEP reader invocation and kernel
build/version; it still shares the OCCT algorithm family. It is not proof from
an unrelated geometry algorithm.

Verified official assets:

| Asset | SHA256 |
|---|---|
| FreeCAD 1.1.4 portable 7z, 418088341 bytes | `4828741fc91ee37fafcdb97a1abacb18b04ba451ac4372d9ff7a7349b36f4d6d` |
| Official 7zr 26.04, 602624 bytes | `256feca8e274e5da655e2a284fabafd9f554365eb164862089dacd4e8276d282` |
| steputils commit 547860b349a36cf24c564d6c87ffd8f60484f6fb source zip | `4848d0957de54be6853db1b33dc35c83306757cf8f047700ebbf8ca5aa61a215` |

Real native reader results on 11 October 2026:

- Unmodified AP214 bore + box STEP: 2 valid closed solids, 10 faces, 2 exact
  cylinders, 8 planes, correct millimetre bounds, preserved `Bohrkörper`/`Quader`
  labels. Volume 6032.698629533248 versus analytic 6032.698629533424 mm³. Native
  point classification proves the bore remains empty and annular material solid.
- Unmodified AP214 left two-start screw + internal nut + helical gear STEP:
  3 valid closed solids, 188 faces including 153 B-spline surfaces. Each body's
  native optimal bounds agree within 0.0001 mm. Original names are preserved.
- FreeCAD exports its independently parsed solids as native BRep. A separate
  Formnaro invocation compares accurate GK volume and positive native Common
  against regenerated original shapes, within an explicit 0.0001 mm³ mass
  integration budget. This volume comparison alone is not a general Hausdorff
  distance bound.
- Independent Python `steputils` parser: 566 entities, zero unbound references,
  no tessellated entities, exact Unicode labels, millimetres, red/blue and
  0.300000011921 transparent style. This proves syntax/graph/metadata, and is
  explicitly not described as a geometric reader.

FreeCAD's plain `BoundBox` overextends untrimmed B-spline surfaces; the proof uses
`optimalBoundingBox(False, False)` to match the no-triangulation CAD bound API.
Its `TopoShape.Volume` calls fixed `BRepGProp::VolumeProperties(shape, props)`;
small mass integration differences on trimmed splines and different values for
compound versus summed solids are recorded separately. The imported geometry
cross-check uses Formnaro's span-aware Gauss-Kronrod integration instead.

An unrelated-algorithm native reader was also genuinely attempted: BRL-CAD
7.42.2/OpenNURBS `step-g`, official Debian binary SHA1
`ae8abb66ae5d5805c6ecff789ae61bee4949ecd0` (SHA256
`caeb10414131c75091c3e398ca3febb7271a9a58de089ecff9eb668daec0f958`). It failed to
construct either solid although it exited zero. The unchanged STEP uses
`SEAM_CURVE`/`SURFACE_CURVE` unsupported by this reader. A separately exported
native `write.surfacecurve.mode=0` experiment also failed its OpenNURBS trim-loop
checks. Those failures are retained in work logs and are not counted as a pass.
Production p-curves remain enabled.

Source references: [FreeCAD release](https://github.com/FreeCAD/FreeCAD/releases/tag/1.1.4),
[FreeCAD headless/profile documentation](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Start_up_and_Configuration.md),
[FreeCAD volume implementation](https://github.com/FreeCAD/FreeCAD/blob/1.1.4/src/Mod/Part/App/TopoShapePyImp.cpp),
[independent Part21 parser](https://github.com/mozman/steputils),
[BRL-CAD official binary](https://sourceforge.net/projects/brlcad/files/BRL-CAD%20for%20Linux/7.42.2/).
