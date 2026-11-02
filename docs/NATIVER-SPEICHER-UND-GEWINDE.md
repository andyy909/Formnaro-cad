# Nativer Speicher und Gewinde: Punkte 11 bis 15

Privater Entwicklungsstand, 02.11.2026. Kein Installations- oder Veröffentlichungsauftrag. Die r35-Laufzeit bleibt gebunden; Änderungen betreffen die JavaScript-Ansteuerung des vorhandenen nativen Kerns.

## Betriebsbudget und Messgrößen

`cad-native-memory.js` trennt reservierte WASM-Bytes, JS-Heap (soweit im Host verfügbar), ausgewählte temporäre OCCT-Wrapper und unbekannte native Belegung. `nativeOccupiedBytes: null` bedeutet ausdrücklich nicht null belegte Bytes. Der gebaute Kern exportiert keine verwendbare Allocatorbelegung. Die gezählten Wrapper decken Schraubflächen- und Boolesche Temporärobjekte ab, keine vollständige OCCT-Allokationsbilanz. Cache-/BRep-Größen sind keine Messung nativer Belegung. Windows-Testprozesse erfassen RSS/private Bytes zusätzlich und erhalten vor Kernelstart ein Betriebssystemlimit von 3 GiB.

Die Laufzeitgrenze beträgt 4 GiB. Der CNC-Farbdarstellungsfall begründet die Erneuerungsschwelle: 1 GiB verwarf auch den Worker mit rund 1,31 GiB reserviertem WASM-Speicher nach der Anzeige jedes Mal und verursachte wiederholte native Farbpartitionierung; 1,5 GiB erhält diesen stabilen Zustand unterhalb der 2-GiB-Prüfschwelle. Ab 1,5 GiB reserviertem WASM-Speicher wird der Worker nach Abschluss der bereits angenommenen Aufträge erneuert. Ab 2 GiB wird an den nächsten sicheren Prüfstellen ein neuer nativer Teilauftrag mit `CAD_MEMORY_BUDGET` beendet. Ein synchroner OCCT-Aufruf kann zwischen zwei Prüfstellen wachsen; die 2-GiB-Schwelle ist deshalb kein harter Allokationsdeckel. Der dokumentierte Lastfall wird zusätzlich unter dem 3-GiB-Prozesslimit geprüft; allgemeine Sicherheit beliebig großer Einzeloperationen ist damit nicht bewiesen. Ein bekannter nativer Trap bleibt getrennt als fataler Kernfehler behandelt.

Messpunkte liegen an Auftrags-, Befehls-, Konstruktions-, Prüf-, Darstellungs-, Schraubflächen-, Vernäh- und Booleschen Grenzen. Status kann die begrenzte Speicherprobe des aktuellen Befehls mitgeben. Reservierte Bytes und zugehörige Spitzenwerte werden nicht als Speicherleck oder Fragmentierung interpretiert.

Workererneuerung findet außerhalb einer laufenden nativen Rechnung statt. Der Controller behält bestätigtes Modell, Undo, Gelenkdaten und Vorschauen. Nur intern erzeugte, begrenzte Geometrienachweise werden zum neuen Worker mitgenommen; sie sind weder Dateiformat noch öffentliche Eingabe. Rezept, vollständige Parameter, Konstruktionsbudget, Algorithmusstufe sowie gebundene JS-/WASM-Laufzeitversion bilden den nativen Cache-Schlüssel. Zusätzlich muss jeder gespeicherte BRep-Byte-Digest zum Nachweis passen. Das gilt auch beim kontrollierten Speicherfehler. Abweichende Parameter oder gespeicherte Geometrie werden neu berechnet. Der Nachweis liegt nicht an einem alten nativen Handle.

## Kürzere Lebensdauer und begrenzte Schraubflächen

Große Boolesche Builder und Prüfer werden nach jedem Verknüpfungsschritt geschlossen. Nicht mehr benötigte Schraubkörper, Clipping-Ergebnisse und vorherige Gesamtkörper werden freigegeben. Oberflächen-Kontrollpunkte bleiben nicht bis zum Ende aller Flächen als einzelne native Wrapper erhalten. Cache-Leerung gibt die gehaltenen TopoDS-Handles frei; eine sinkende tatsächliche Allocatorbelegung wird daraus nicht abgeleitet.

Lange Schraubflächen entstehen aus Abschnitten von höchstens acht Umdrehungen. Alle Abschnitte verwenden denselben globalen Winkel und dieselben Ausgangswerte für Profil, Steigung, Phase und Drehsinn. Sie werden gemeinsam mit genau zwei Endkappen zu einer geschlossenen Hülle vernäht und zu einem Solid orientiert. Es entsteht kein Bauteilmuster sichtbarer Spindelstücke. Die Acht-Umdrehungen-Grenze ist auf die dokumentierten Fälle gestützt und bleibt eine überprüfbare Implementierungsentscheidung, keine universelle optimale Abschnittslänge.

Abschnittsgrenzen besitzen dieselben Endpunkte und ersten Ableitungen. Native Vernähung verlangt keine freien oder mehrfachen Kanten; Gültigkeit, einzelner Solid, Volumen und endgültige Topologietoleranz werden weiterhin geprüft. Lange segmentierte Innen- und Außengewinde reservieren zusätzliche Genauigkeit im Schraubflächenaufbau (höchstens ein Viertel des äußeren Budgets, unter Beachtung der bestehenden Mindesttoleranz). Die endgültige zulässige Topologietoleranz bleibt unverändert.

## Innengewinde und Fehlerbelege

Nachlauf 02.11.2026: Eine ungültige native Gewinde-Verknüpfung oder eine
abschließende Topologietoleranzüberschreitung kann genau einen erneuten Aufbau
mit feiner approximierten Schraubflächen auslösen. Deren Budget beträgt dann
höchstens ein Achtel des unveränderten Konstruktionsbudgets, unter Beachtung der
bestehenden Mindesttoleranz. Profil, Kernüberlappung, Steigung, Phase und die
zulässige Endtoleranz bleiben gleich. Die Handles des ersten Versuchs sind vor
dem zweiten freigegeben. Parameterfehler und Speicherbudgetfehler enden sofort.
Der interne Konstruktionsschlüssel ist dafür auf `screw-sections-8-v3` erhöht.

Beim Standard-M8-Fall sank die gemessene Endtoleranz von
0,0000759024 mm auf 0,0000122379 mm; erlaubt bleiben 0,00005 mm. Standardgewinde,
kurzes M8 und Standardmutter wurden als einzelne gültige Körper aufgebaut und
als STEP wieder gelesen. Gültige erste Versuche behalten den bisherigen Weg.
Dies ist eine begrenzte Genauigkeitskorrektur; ein zusätzlicher Versuch kostet
Rechenzeit und begründet keine allgemeine Leistungszusage.

Aufbau des Schraubschneidkörpers, Clipping, Kernvereinigung, Öffnungsfasen und Abzug werden getrennt gemessen. Zwischengeometrien dürfen Bereiche enthalten, die später entfernt werden; ihre Toleranzen werden erfasst, während die unveränderte Endprüfung über die Zulässigkeit entscheidet. Am segmentierten Tr12×4-Mutternfall wurden vor der Verfeinerung 0,0000647337 mm gegenüber erlaubten 0,00005 mm gemessen. Die genauere Schneidkörperfläche beseitigt diese beobachtete Überschreitung. Dies ist keine rückwirkende Behauptung zur Ursache eines nicht reproduzierten historischen Fehlers.

Toleranzfehler liefern `CAD_TOPOLOGY_TOLERANCE`, `measuredTolerance`, `allowedTolerance` und die betroffene Phase. Worker, HTTP/Node-MCP und Python-MCP/CLI erhalten diese Angaben strukturiert; Grenzwerte werden nicht nur im Meldungstext genannt.

## Anzeige und Wiederverwendung

Einstellungen → Modellieren → Anzeigequalität bietet ausdrücklich „Vereinfachte Anzeige“. Der Preset verwendet 0,25 mm / 20°; vollständige Anzeige bleibt Standard (0,02 mm / 8°). Eigene Qualitätswerte sind weiterhin möglich. Quellen, vollständige native Körper, Modellrevision, Undo und Exportqualität bleiben erhalten. Native STEP-Ausgabe nutzt die vollständigen Körper. Die vorhandene lokale Cache-Wiederverwendung für identische Körper und starre Platzierungen bleibt erhalten; eine Parameteränderung erzeugt einen anderen Schlüssel.

## Nachweise und Grenzen

Die versionsgebundene lokale Spezifikation steht in `GESAMTPLAN-11-BIS-15-ANFORDERUNGEN.md`. Native Prüffälle und der Acht-Befehle-Block sind über `scripts/cnc-regressions.mjs` reproduzierbar; Testdaten liegen außerhalb von Git. Die großen Abläufe verwenden Kopien und separate Profile. Der Korrekturblock stellt den ursprünglichen Befehlssinn auf der final gespeicherten CNC-Kopie nach; der damalige Zwischenstand liegt weiterhin nicht vor. Eine konkrete historische Speicherleckursache wird nicht behauptet.

Einzelmessungen, tatsächliche Abschlusszahlen und unabhängige Reviews werden im privaten Abschlussnachweis neben dem Repository festgehalten. Die separate FreeCAD-/Defender-Nachweisgrenze aus Punkt 10 bleibt bestehen; die hier verwendeten nativen WASM-Prüfungen benötigen keinen FreeCAD-Containerstarter.
