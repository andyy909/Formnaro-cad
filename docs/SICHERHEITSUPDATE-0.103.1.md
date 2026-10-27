# Sicherheitsaktualisierung 0.103.1

Ausgangspunkt sind 48 offene Dependabot-Einträge: 41 zu Pillow, einer zu
setuptools, drei zu Electron in Hauptprogramm/Minis und drei zu Undici.
Das sind Warnungseinträge mit teilweise gemeinsam betroffenen Bibliotheken.

| Bestandteil | Aktualisierte Version |
| --- | --- |
| Electron, Hauptprogramm und beide Minis | 44.9.3 |
| Undici im npm-Abhängigkeitsbaum | 7.30.1 |
| Pillow im nativen Konverter und Python-WASM | 13.0.0 |
| setuptools im nativen Konverter und Python-WASM | 84.2.1 |
| LibWebP / LibTIFF im neuen Pillow-WASM | 1.6.0 / 4.7.2 |

Pillow und setuptools werden in beiden tatsächlich ausgelieferten Umgebungen
aktualisiert. Das alte native Konverterprogramm und frühere freigegebene Apps
werden erhalten. Der neue Konverter liegt separat unter
`converter/runtime-v010-security`; Herkunft, Quellen-/Binär-SHAs und
Abhängigkeitsänderungen stehen in `converter/provenance.json`. Die Engine- und
Bridge-Pythonmodule bleiben unverändert; nur die Dependency-Konfiguration wurde
angepasst. Die drei bisherigen synthetischen Konverterbeispiele werden durch
das neu gefrorene Programm mit denselben Maß-/Topologieprüfungen verarbeitet.

Da Pyodide 314.0.7 noch kein offizielles Pillow-13-Wheel enthält, wurde es für
die bestehende ABI aus offiziellen Quellarchiven gebaut. Rezepte und Pins:
`python-runtime/security-pillow/`. Die tatsächliche Laufzeit lädt die gesicherten
Paket-SHAs aus dem Formnaro-Manifest. Ein erneuter Setup-Lauf darf nicht auf die
alten Pillow-/setuptools-Versionen zurückfallen. Alte Wheels werden nicht in
die neue Ausgabe übernommen. Sandbox-/Hostgrenzen werden nicht erweitert.

Die npm-Audits der drei Projekte und die frischen GitHub-Alert-Zustände werden
getrennt geprüft. Erst ein von GitHub als behoben zurückgemeldeter Eintrag wird
als geschlossen dokumentiert. Hinweise in früheren Releases bleiben als
historischer Stand erhalten; es werden keine Warnungen nur ausgeblendet.

Diese Ausgabe basiert auf der freigegebenen CAD-Funktionalität 0.103.0.
Unfertige parallele FreeCAD-Erweiterungen sind nicht Teil des Security-Builds.
Die releasebezogenen Prüfberichte identifizieren die getesteten EXE-/ASAR-Dateien.

Quellen: [Pillow 13](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html),
[Electron-Veröffentlichungen](https://releases.electronjs.org/release),
[Undici 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1),
[setuptools](https://pypi.org/project/setuptools/84.2.1/).

Abschluss nach dem Push am 26.10.2026: GitHub bestätigt **0 offene Warnungen**,
alle vorherigen **48 als fixed**, **0 Dismissals**. Die drei npm-Audits und
pip-audit für 68 native Python-Pakete melden 0 bekannte Funde. Die tatsächliche
Windows-Hauptanwendung bestand 471 Prüfgruppen; die Minis 117 beziehungsweise
123. [Release mit Prüfbericht und Prüfsummen](https://github.com/andyy909/Formnaro/releases/tag/v0.103.1).
