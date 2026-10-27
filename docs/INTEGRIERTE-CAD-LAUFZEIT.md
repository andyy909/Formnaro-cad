# Integrierte CAD-Laufzeit – Paket 6a

Stand 27.10.2026: Paket 6a in **0.114.0-r7 abgenommen**.
Die tatsächliche portable Anwendung bestand 92 lokale EXE-Prüfgruppen sowie
167 Prüfgruppen in sechs Läufen auf einer frischen Windows-11-Enterprise-
Evaluation-VM ohne externe FreeCAD-/Python-Installation. Der vollständige
Programmordner wurde dort aus dem ZIP unter einem Pfad mit Leerzeichen und
Umlaut entpackt. [Öffentliche Bereitstellung](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.114.0-r7)
auf ausdrücklichen Folgeauftrag; [private Ausgabe](https://github.com/andyy909/Formnaro/releases/tag/v0.114.0-r7)
mit demselben geprüften Windows-Paket.

Die neue Paketierung enthält die offizielle portable Windows-x64-Ausgabe von
[FreeCAD 1.1.4](https://github.com/FreeCAD/FreeCAD/releases/tag/1.1.4), einschließlich
Python 3.11 und aller mitgelieferten Module. Die bestehenden FCStd-Dokumente,
Python-Programme und archivierten Helfermodule verwenden dieselben APIs.
Optionale Formnaro-Funktionen wie FEM und Blechbearbeitung werden damit nicht
automatisch eingeführt. Die unveränderte vollständige Upstream-Laufzeit enthält
auch Komponenten, die Formnaro zurzeit nicht anbietet.

`npm run setup:cad-runtime` lädt beim **Bau** die fest gepinnte Laufzeit sowie
das FreeCAD-Quellarchiv und prüft deren SHA-256. Beim Anwenderstart gibt es
keinen Download. `npm run package:cad-runtime -- r1` friert die Programmquellen
ein und erzeugt einen eigenen Integrationskandidaten mit gezielten Prüfungen.
Die Laufzeit liegt neben der ASAR-Datei unter `resources/freecad`.
Ein Dateimanifest prüft alle gelieferten Laufzeitdateien. Dessen SHA-256 wird
zusätzlich im gepackten Programm gebunden. Paketierung und Abnahme prüfen
sämtliche Laufzeitdateien. Vor der ersten CAD-Anfrage je Prozess werden die
Kernkomponenten geprüft; Beispiele, Symbole, Lizenztexte und sämtliche optionalen
Module werden dafür nicht erneut vollständig gelesen. Die vollständige
Diagnose bleibt in der gesonderten Laufzeitabnahme enthalten.

Die gepackte Anwendung wählt ausschließlich die integrierte Laufzeit.
Ein fehlendes oder beschädigtes Paket führt zu einer verständlichen Meldung;
kein stiller Wechsel zu einer fremden Installation. Nur ein Entwicklungscheckout
ohne vorbereitete Laufzeit darf die bisherige externe Installation verwenden.

Python, native FCStd-Bearbeitung und nun auch integrierte Datenpläne laufen
im bestehenden Windows-AppContainer ohne Netzwerkfähigkeiten. Nur der eigene
Auftragsordner ist beschreibbar. Die CAD-Laufzeit erhält Leserechte für
AppContainer, auch nach dem Kopieren unter Downloads/OneDrive. Die eigentliche
Formnaro-Anwendung und persönliche Daten erhalten diese zusätzliche Freigabe
nicht. Der vorab kompilierte Starter wird außerhalb des schreibbaren
Auftragsordners ausgeführt; keine Python-Installation und kein C#-Compiler
sind beim Anwender erforderlich. Windows-.NET-Framework bleibt Systembestandteil.

Lizenzen und Herkunft: `resources/freecad/SOURCE-NOTICE.txt`, `packages.txt`,
`doc/LICENSE.html`, `doc/ThirdPartyLibraries.html`, `share/licenses`, `share/doc`
und die Lizenztexte der einzelnen Python-Pakete. Das FreeCAD-Quellarchiv und
der Quelltext des Isolationsstarters liegen unter `sources`. Die Lizenz von
Formnaro ersetzt diese eigenständigen Open-Source-Lizenzen nicht.

Abnahme: 42 native Basisprüfungen mit per SHA gebundenen unveränderten
Geometriearbeitern; abschließend 14 gezielte Integritäts-/Prozessprüfungen,
22 Text-/Schnittstellenprüfungen und fünf Einstiegspunktprüfungen. Die Phasen
überschneiden sich und werden nicht zu einer Gesamtzahl addiert. 92 lokale
EXE-Prüfgruppen umfassen vier Bedienmodi, fehlende/beschädigte Laufzeit und
einen verschobenen Umlautpfad. Die sechs sauberen Windows-Läufe (167
Prüfgruppen) decken zusätzlich Python, native Dokumente, physische
STEP/STL/FCStd/FNPACK-Ausgaben, erweiterte Merkmale und Flächen ab.
Alte FCStd- und archivierte FeaturePython-Quellen wurden separat wiedergeöffnet
und nativ geändert. Aktuelle Paketbilder wurden visuell geprüft.

Die vollständige Laufzeit umfasst 35.586 Manifestdateien und 2.406.017.278 Bytes
(ohne Manifestdatei). Der vollständige Programmordner belegt ungefähr 4,36 GB.
Der Windows-Download liegt bei ungefähr 1,88 GB; die exakte ZIP-Größe und
Prüfsumme stehen im Release. Ein warmer lokaler Start erreichte die
bereitstehende Oberfläche nach 1,73 Sekunden; das ist keine Kaltstartzusage.
Der erste lokale offscreen-GUI-Aufruf dauerte 42,5 Sekunden, spätere Aufrufe
etwa 7,2 Sekunden. Die lokale Basissuite mit vier Modi dauerte 87,6 Sekunden,
die Datenplansuite 19,0 und die erweiterten Modellierprüfungen 35,4 Sekunden.
Diese Messungen stammen vom Entwicklungs-PC unter damaliger Last.

Es erfolgte die gezielte Abnahme von Paket 6a. Die gemeinsame Gesamtprüfung
des weiteren Ausbauplans bleibt für den Abschluss der beauftragten Folge
vorgesehen. Pakete 8–10 sind weiterhin offen.
