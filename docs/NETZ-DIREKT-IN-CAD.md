# Ausgewähltes Netz direkt in CAD umwandeln · Paket 11 · Formnaro 0.30.0

1. Genau ein vollständiges, sichtbares und entsperrtes **Material-Netzteil**
   auswählen. Bei erhaltenen Quellen die oberste Netzzeile wählen. Eine
   Ansichtsvorlage, ein Lochteil oder ein CAD-Körper ist dafür ungeeignet.
2. **Netz → CAD …** in der Werkzeugleiste oder **Funktionen → Netz als
   CAD-Kopie** öffnen. Die gespeicherten Netzdreiecke werden unmittelbar an den
   vorhandenen lokalen Konverter übergeben. Es ist keine STL-Dateiauswahl nötig.
3. Abweichungsbudget und Verfahren einstellen. Die Einheit ist bereits
   Millimeter; Skalierung, Spiegelung und Scherung des ausgewählten Teils sind
   berücksichtigt. **Netz vor Konvertierung reparieren** ist zunächst aus.
   Reparatur nur ausdrücklich einschalten und ihr Ergebnis prüfen.
4. Bei geeigneter Größe die vorhandene Flächenanalyse und Bereichskorrekturen
   nutzen. **Netz in CAD umwandeln** berechnet und prüft das Ergebnis. Eine
   STEP-Datei muss dafür nicht gespeichert werden.
5. **Original**, **Ergebnis**, **Überlagerung** und **Abweichung** vergleichen.
   Bohrungen, dünne Wände, absichtliche Öffnungen und Anlageflächen gezielt
   ansehen. Bericht und Begleitnetze lassen sich bei Bedarf separat speichern.
6. **CAD-Übernahme prüfen** zeigt den zusätzlichen CAD-Körper in der gemeinsamen
   Arbeitsfläche. Die Darstellung des Quellnetzes wird dafür vorübergehend
   ersetzt. **Vorschau verwerfen** oder Escape stellt die normale Ansicht wieder
   her; der bestätigte Projektstand bleibt unverändert.
7. **Übernehmen** fügt eine unabhängige **CAD-Kopie** hinzu. Ein gemeinsamer
   Rückgängig-Schritt nimmt ihre Erstellung zurück. **Schließen** ohne Übernehmen
   fügt keinen Körper hinzu. **Berechnung abbrechen** beendet den eigenen Auftrag.

Das Quellnetz bleibt mit seinen gespeicherten Dreiecken, Quellen, Parametern,
Farben, Sperren und seiner vollständigen Lage erhalten. Andere Teile bleiben
unverändert. Die neue CAD-Kopie erhält eine eigene Kennung, die Objektfarbe,
Deckkraft, Layer und Ordner des Netzes. Einzelne Netzquellenfarben werden nicht
in CAD-Flächenfarben übersetzt. Skalierung, Drehung, Spiegelung und Scherung
liegen in der neuen CAD-Geometrie; ihre Weltposition bleibt erhalten.

Ein historischer Quellenverweis hält die Netzkennung und den Geometrie-/Lagenstand
fest. Die Kopie wird bei späteren Netzänderungen nicht automatisch nachgeführt.
Ändert sich das Projekt während der Konvertierung oder vor der Übernahme, wird
der Auftrag zur Übernahme gesperrt. Das Werkzeug schließen und das Netz erneut
auswählen, damit kein veraltetes Ergebnis in das aktuelle Projekt gelangt.

Die Option **Nach Übernahme nur die CAD-Kopie anzeigen** ist zunächst eingeschaltet.
Sie betrifft die vorübergehende Ansichtsisolation. **Isolation beenden** zeigt
wieder alle Teile. Das Original wird dadurch nicht dauerhaft ausgeblendet.
**Für einen Export allein der Kopie „Ausgewählte Teile“ wählen.** Eine Isolation
beschränkt den Export nicht.

Die zusätzliche Kopie lässt sich mit vorhandenen CAD-Werkzeugen bearbeiten und
nativ nach STEP ausgeben. Gemeinsames Speichern und Wiederöffnen erhalten beide
Objekte und den Quellenverweis im Projektformat 8. **STEP speichern** im Konverter
ist ein zusätzlicher Dateiexport des geprüften Konverterergebnisses. Nach späteren
CAD-Bearbeitungen die aktuelle CAD-Kopie über den normalen Export ausgeben.

## Grenzen des vorhandenen Konverters

Der lokale Konverter 0.10.0 mit Protokoll 2 bleibt unverändert. Für die direkte
Objektübergabe gelten höchstens 40.000 Dreiecke und 50 MiB STL-Zwischendaten;
dichtere Netze werden ohne automatische Vereinfachung abgewiesen. Der vorhandene
Flächeneditor unterstützt höchstens 20.000 Dreiecke. Größere geeignete Netze
können separat konvertiert werden. STEP-Ergebnisse sind auf 30 MiB begrenzt;
pro Auftrag gilt das bestehende Zeitlimit von zehn Minuten.

Nur ein erfolgreich geprüftes CAD-Ergebnis kann übernommen werden. Offene oder
ungeeignete Hüllen können scheitern. Reparatur betrifft ausschließlich die neue
Variante und rechtfertigt kein ungeprüftes Schließen absichtlicher Öffnungen.
Rekonstruierte Flächen stellen keine ursprüngliche Konstruktionshistorie wieder
her; schwierige Rundungen können facettiert bleiben.

Die Abstände im Bericht sind beidseitige Stichproben mit Vernetzungsreserve.
Die farbige Ansicht misst dargestellte Ergebnis-Dreiecksmitten gegen das Original.
Das ist kein garantierter maximaler Oberflächenfehler. Ein passendes Budget
ersetzt nicht den Vergleich kritischer Maße und technischer Details.

## Ausgabe und Nachweise

Separate Ausgabe: `release-formnaro-netz-cad-v0.30.0/Formnaro-win32-x64`.
Portable ZIP: `output/Formnaro-Netz-CAD-v0.30.0.zip`.
Das gesamte Archiv in einen eigenen kurzen lokalen Ordner entpacken, etwa
`C:\Formnaro030`, und `App/Formnaro.exe` starten. Persönliche Daten einer anderen
portablen Ausgabe werden nicht automatisch kopiert. Frühere Ausgaben bleiben
erhalten.

Getrennte Nachweise für Quelloberfläche, tatsächliche EXE, native Verfahren und
Archive entstehen unter `work/mesh-to-cad/checks`. Eine vorhandene Implementierung
ersetzt keine erfolgreiche Abnahme; maßgeblich sind die zu dieser Ausgabe
gehörenden `final-audit.json`, `archives.json` und `delivery.json`.

Paket 11 ergänzt die ausdrückliche Netz-zu-CAD-Kopie. Die CAD-Netzkopie aus
Paket 10 und die gemeinsame KI-Anbindung bleiben verfügbar. Die Konvertierung
benötigt keine Cloudanfrage. Paket 12 für die übrige Datei-/Einstellungsintegration,
Paket 13 für die Gesamtabnahme und neue Netzverfahren ab Paket 14 bleiben eigene
Arbeitspakete.
