# Gemeinsame Ausbauabnahme 0.117.0-r7

Die beauftragten Pakete 0–10 einschließlich der integrierten CAD-Laufzeit 6a
sind an der neuen Windows-Ausgabe gemeinsam geprüft. Optionale Pakete 11–13
gehören nicht zu diesem Abschluss.

2153 Tests in 352 vollständig ausgeführten Testdateien bestanden;
keine Fehler, übersprungenen oder abgebrochenen Tests. 3312 Prüfgruppen
in 91 tatsächlichen Windows-Prozessläufen bestanden.
Die allgemeinen Bedienpfade werden durch spezielle Nachweise für Foto-
Perspektive/Mehransichten, Merkmalsreferenzen, FCStd, gespeicherte KI-Aufträge,
native Kurven und Flächen sowie gekrümmte Netze ergänzt. Der vollständige Unit-Lauf stammt aus R5; sämtliche Funktionsdateien, Testdateien, Build-Ausgaben und Laufzeiteingaben sind für R7 bytegleich. Ausschließlich drei Windows-Prüfer wurden berichtigt: asynchrone Vorschau mit erzwungener Verzögerung abwarten, tatsächliche Netz-Importoption abschalten und die automatisch nummerierte Exportdatei bytegenau prüfen. Die kopierte Mesh-Belegdatei ist ebenfalls bytegleich geprüft. Alle Windows-Prüfungen wurden am finalen R7-Paket neu ausgeführt. Anbieterantworten
werden lokal simuliert; es erfolgte keine Cloud-Modellinferenz.

Vier externe Spezialprüfer verwenden die tatsächlichen Solid-/Fusion-Menüwege für Projektfotos und Merkmalsbezüge sowie kanonische Laufzeitpfade; alle Geometrie-, Quellen-, Datei- und Undo-Assertions bleiben unverändert.
Diese Korrekturen betreffen fünf isolierte R7-Prüfläufe.
Die eingepackten älteren Prüfselektoren zielten dort auf verborgene Headerknöpfe.
Exakte reversible Prüferkorrekturen, ursprüngliche Fehlberichte und die neuen
Ergebnisse sind separat SHA-gebunden. Der Laufzeitprüfer vergleicht die
kanonischen physischen Pfade beider Seiten eines Windows-Verzeichnislinks.
Sämtliche Geometrie-, Quellen-, Datei-
und Undo-Assertions bleiben erhalten; EXE, ASAR und Funktionscode sind unverändert.

Paket 10: Flächenfarben und Gruppen für CAD/Netze, unterstützte Farbexporte,
ausdrückliche homogene Dichte, native Masse/Schwerpunkt, CSV-Stückliste und
gespeicherte Anzeige-Explosion. OCAD/FNPACK, Autosicherung, Wiederöffnen,
Vorschau/Undo und originale Montage geprüft. Ein unabhängiger FreeCAD-Leser
bestätigt die physische STEP-Ausgabe als zwei gültige geschlossene Körper mit
2600 mm³ und dem erwarteten Volumenschwerpunkt. Separate Standardformatleser
prüfen glTF/GLB/OBJ/3MF/CSV, Maße und ausgewählte native und Netz-Farben.
Physische STL aus den Netzpaketen werden unabhängig dreiecksgenau gelesen.

16 tatsächliche Paketbilder visuell geprüft; vier Bedienmodi,
kleine/dunkle Ansicht, native und Netz-Vorschau sowie gespeicherte Explosion
einbezogen. Die gesamte integrierte CAD-Laufzeit ist SHA-geprüft. Ältere
Ausgaben bleiben unverändert. Frische FreeCAD-Laufzeiten hinter einem
Windows-Verzeichnislink sind durch einen echten AppContainer-Regressionstest
abgesichert: Laufzeitprüfung vor Auflösung des physischen Programmpfads.

Grenzen und Bedienung: [Teile und Baugruppen](TEILE-MATERIAL-BAUGRUPPEN.md),
[Netzflächen](NETZREPARATUR-FLAECHEN.md), [gekrümmte Netze](GEKRUEMMTE-NETZE.md),
[CAD-Flächen](CAD-FLAECHEN.md). Unbekannte Dichte bleibt unbekannt;
Massensummen vereinigen überlappende Bauteile nicht. Explosionsrichtungen
dienen der Anzeige und sind keine Kollisionssimulation.

Quellen und Programm werden zuerst privat bereitgestellt. Die öffentliche
Ausgabe bleibt 0.114.0-r7; sie wird nur auf gesonderten Auftrag aktualisiert.
Eingebettete ASAR-Dokumentation enthält den eingefrorenen Buildstand;
die beiliegenden Abschlussdokumente ergänzen die danach erhobenen Nachweise.

Der nach Nutzerpause unterbrochene R7-Lauf und ein Wiederanlauf mit einem
Hänger beim Beenden der Wartungsprüfung bleiben als eigene Vorlaufbelege
erhalten. Ein separater Wartungskontrolllauf und der anschließend vollständig
neu ausgeführte allgemeine R7-Katalog bestanden am unveränderten Programm.
Die obigen Zählungen beziehen sich auf die vollständig abgenommenen Läufe.
