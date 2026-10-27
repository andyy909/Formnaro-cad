# Gemeinsamer CAD-Kern für Formnaro 0.11

Dieser Bereich erweitert den vorhandenen `replicad-opencascadejs`-Kern. Die
Produktanwendung Formnaro 0.11 verwendet diesen gemeinsamen nativen CAD-Kern
für Konstruktion und Berechnungen; alle CAD-Körper liegen im selben WASM-Modul.
`src/cad-main.js` und der Worker laden die verifizierte Runtime über
`src/cad-kernel-loader.js`. Die bisherige Mesh-Konstruktion gehört nicht zum
produktiven Einstieg. Alte Releases und Nutzerprojekte werden nicht umgebaut.

`upstream-lock.json` fixiert Replicad 1.1.0, OpenCascade.js, OCCT 8.0.1,
RapidJSON, FreeType, Emsdk 5.0.1 und das ursprüngliche Linux-Buildimage mit
Git-Commits beziehungsweise unveränderlichen SHA256-Digests. Die Quellenarchive
werden durch `prepare.mjs` in einem frischen Checkout heruntergeladen und gegen
ihre SHA256-Werte geprüft. Vorhandene verifizierte Archive unter
`work/v010/upstream/source-archives/` können wiederverwendet werden.

Die erzeugte YAML übernimmt sämtliche bisherigen Replicad-Bindings und ergänzt
`BRepBuilderAPI_GTransform`, `IntCurvesFace_ShapeIntersector`,
`BRepLProp_SLProps`, `TopTools_FormatVersion` sowie `FormnaroCadBridge`.
Die C++-Bridge bietet native Punktklassifikation geschlossener Körper,
allgemeine affine Körpertransformationen, echte
Strahl-/Flächentreffer mit orientierten CAD-Normalen sowie die BRep-Schreibung
mit `withTriangles=false` und `withNormals=false`. Alle TopoDS-Objekte bleiben im
selben WASM-Modul. Eine eigene Export-Tessellierung (`ExportMeshJson`) behält
OCCT-Double-Koordinaten mit 17 signifikanten Stellen und berechnet ihre eigene
Deflektion/Winkeltoleranz. Sie verwendet keine Float32-Anzeigepuffer; ein
Laufzeittest prüft die Präzision auch bei Weltkoordinaten von 10 Millionen mm.
Die Bildschirmausgabe erhält Dreiecke, native Normalen und
einen eindeutigen Faceindex je Indexgruppe; rohe Speicherhashes werden nicht
weitergegeben. Diese Indizes sind aktuelle Zuordnungen, keine dauerhaften
Projektbezüge nach einem Geometrieneuaufbau.

## Build und Prüfungen

```powershell
node cad-kernel-build/prepare.mjs
./cad-kernel-build/build.ps1
```

`build.ps1` startet keine Dienste und verändert keine Docker-Einstellungen.
Es bindet ausschließlich den eigenen Buildordner ein und linkt mit dem
gepinnten Originalimage. Anschließend muss der tatsächlich erzeugte gemeinsame
Kern `tests/cad-kernel-proof-extended.test.mjs` bestehen. Eine fehlende Binärdatei
lässt diese Abnahme scheitern; sie wird nicht als übersprungener Test gewertet.
Die erzeugten Binärdateien liegen zunächst unter `work/cad-v011-build/config/`.
Erst nach bestandener Laufzeitprüfung werden sie materialisiert. Eine neue
Vite-Ausgabe übernimmt die zusammenpassenden JS-/WASM-Dateien; bestehende
Portable-Ausgaben werden durch das Buildskript nicht überschrieben.

Nach erfolgreicher Laufzeitprüfung kopiert `materialize.mjs` genau diese JS-,
WASM- und Typdateien nach `cad-kernel-build/runtime/`. Das private Runtimepaket
enthält LGPL/OCCT-Ausnahme, FreeType/RapidJSON- und Systembibliothek-Lizenzen,
Quellenpins, Build-Provenienz und einen vollständigen SHA256-/Längenmanifest.
Dieser prüft 24 Dateien, darunter 14 vollständige Originallizenz-/Autoren-Dateien.
Eine Kopie wird nur
nach erfolgreicher Originalbuild-Validierung und echtem Runtimegate erstellt.
`node cad-kernel-build/verify-runtime.mjs` prüft alle Paketdateien.
`src/cad-kernel-loader.js` lädt dasselbe Paket in Node und im Browser-Worker
und verlangt alle erweiterten CAD-Schnittstellen; ein fehlendes Artefakt oder
eine fehlende Fähigkeit führt zu einem Fehler.

Für eine Docker-Engine, die nicht startet, gibt es eine isolierte Linux-Route:

```powershell
./cad-kernel-build/build.ps1 -Runner Wsl -Distribution Ubuntu
```

Diese Route verwendet eine bereits vorhandene Linux-Distribution und benötigt
Python 3.11+ und Node 22+ unter Windows sowie Python 3.11+ in Linux. Sie
installiert keine Distro-Pakete. Alternativ `python cad-kernel-build/fetch-image.py`
und danach unter Linux/WSL `python3 cad-kernel-build/run-image-linux.py` ausführen.
Die Route prüft OCI-Manifest, Imagekonfiguration und jeden komprimierten Layer
gegen seinen Digest. Sie verwendet einen eigenen temporären Rootfs und einen
lokalen, ebenfalls SHA256-geprüften offiziellen PRoot-5.5.0-Launcher. Ältere
PRoot-Versionen ohne `statx`-Unterstützung sehen Node-Dateien als nicht vorhanden.
Der temporäre
Rootfs liegt ausschließlich im eigenen `/var/tmp/formnaro-cad-v011-*`-Ordner;
nur `/dev`, `/proc`, `/sys` und der eigene Buildordner sind eingebunden.
Distro-Pakete, Windows-Funktionen,
Docker-Sockets, Einstellungen, Container und Volumes werden nicht verändert.
Der resultierende Kernel muss dieselben erweiterten Laufzeitprüfungen bestehen.

Die historischen Vergleichsprüfungen des ursprünglichen npm-Kerns laufen mit:

```powershell
node --test tests/cad-kernel-proof.test.mjs
```

Sie belegen analytische Zylinder und CAD-Bohrungen, geometrische Grenzen und
Volumen unabhängig von der Anzeigequalität, CAD-Normalen/Facezuordnung,
triangulierungsfreie Speicherung ohne Entfernen des Originalanzeigecaches und
Rotation/gleichmäßige Skalierung/Spiegelung. Ein geschlossener B-Spline-
Schraubkörper prüft die native Gauss-Kronrod-Volumenintegration gegen ein
analytisches Profilmoment. Zusätzlich reproduzieren sie die
fehlenden allgemeinen Affin-/Ray-Bindings und den nicht gebundenen
`TopTools_FormatVersion`-Typ. Solche fehlenden Funktionen führen zu einem
ausdrücklichen Fehler, niemals zu einer Mesh-Ersatzberechnung.

Die verpflichtenden Tests der produktiven erweiterten Runtime laufen mit:

```powershell
npm run test:cad-kernel-extended
node --test tests/cad-plane-volume-proof.test.mjs
```

Der zweite Nachweis trennt Erzeuger und frischen BRep-/STEP-Leser in zwei
eigenständige WASM-Worker. Er prüft affine Schrägzahnräder, Spiegelung,
Zweiganggewinde und eine echte Fase ohne Übernahme des Quellvolumen-Caches.
Die separate STEP-Leser-Abnahme unter `step-reader-proof/run.ps1` verwendet
FreeCAD 1.1.4 mit eigenem nativem OCCT 7.8.1. Sie dokumentiert ausdrücklich die
gemeinsame OCCT-Algorithmusfamilie und ersetzt keinen allgemeinen Genauigkeitsbeweis.

## Quellen und Lizenzen

Replicad/OCJS- und OCCT-Lizenztexte stehen unter `licenses/`. Die neue
Formnaro-Bridge trägt die MIT-Lizenz. Weitere ursprüngliche Lizenztexte bleiben
in den durch SHA256 überprüften Quellenarchiven erhalten. Build-Provenienz
einschließlich Original-YAML- und Bridge-Hash wird als `build-inputs.json`
neben der erzeugten Konfiguration geschrieben. Vollständige entsprechende
Quellen werden als fünf originale Archive mit Bridge, Bindingkonfiguration
und Buildskripten in `Formnaro-CAD-Quellen-v0.11.zip` mitgeliefert. Anwendung und
Prüfungen stehen in `Formnaro-Quellcode-v0.11.zip`; genaue Neubuild- und
JS/WASM-Ersatzanweisungen stehen in `licenses/CAD-Quellen-und-Build.txt`.

Primäre Quellen: [Replicad-Quellstand](https://github.com/sgenoud/replicad/tree/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1/packages/replicad-opencascadejs),
[OpenCascade.js-Quellstand](https://github.com/taucad/opencascade.js/tree/ebd263f15337b440b391492af073662707e86482),
[OCCT-Quellstand](https://github.com/Open-Cascade-SAS/OCCT/tree/b8f597c677811d1f9f4d8a97f5ae2825c0353a42),
[BRepTools-Schreibvertrag](https://www.occt3d.com/dev/doc/refman/html/class_b_rep_tools.html),
[offizieller PRoot-Launcher](https://github.com/proot-me/proot/releases/tag/v5.5.0).
