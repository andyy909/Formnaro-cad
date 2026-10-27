# Gespeicherte KI-Aufträge ab Version 0.111

Im lokalen KI-Chat können feste Vorgaben, die ursprüngliche Modellbasis,
Zwischenstände und der zuletzt besser geprüfte Entwurf dauerhaft gesichert
werden. Unterbrochene Aufträge lassen sich mit dem verbleibenden Budget
fortsetzen. Die ältere Ausgabe 0.110 enthält diese Erweiterung noch nicht.

## Erfolglose Wiederholungen begrenzen

Die Anwendung stoppt nach drei gleichen Fehlerbefunden, drei gleichen
Messbefunden oder drei geometrisch gleichen geprüften Entwürfen in einer
erfolglosen Bildkorrektur. Neue Namen und Abfragekennungen setzen die Zähler
nicht zurück. Sechs Arbeitsschritte ohne belegten Fortschritt beenden ebenfalls
die automatische Bearbeitung. Das eingestellte Arbeitsschrittbudget bleibt
zusätzlich verbindlich.

Tatsächlich bessere Messwerte erlauben weitere Korrekturen. Bei mehreren
weiterhin fehlerhaften Entwürfen zählt auch die gemessene Abweichung vom festen
Sollwert: Ein näher am Soll liegender Kandidat wird durch einen späteren
schlechteren Kandidaten nicht ersetzt. Eine erfolgreiche Messung löscht die
Ursache einer früher gescheiterten Konstruktionsroute nicht.

Die Stoppmeldung zeigt den konkreten letzten Fehler. Eine vorhandene Vorschau
bleibt mit ihren Befunden ausdrücklich ungeprüft beziehungsweise fehlerhaft,
wo entsprechende Nachweise fehlen. Die Anwendung übernimmt sie nicht
automatisch. Verwerfen und Abbrechen verändern das bestätigte Modell nicht.

## Feste Vorgaben und Schutz

Die neue interne Auftragsdefinition hält Ziel, Qualitätsart, Annahmen,
geschützte Teile beziehungsweise erhaltene Quellen und native Sollprüfungen
zusammen. Solche vorgegebenen Prüfungen gelten schon für die erste
Modellantwort. Das Modell kann sie durch eigene schwächere Prüfungen nicht
ersetzen. Eine geschützte Quelle darf einschließlich ihrer Weltlage und
wirksamen Sperr- und Sichtbarkeitszustände nicht verändert werden.

Technische Aufgaben führen feste Maße, native Prüfungen und kalibrierte Bezüge.
Freie Formgestaltung wird zusätzlich qualitativ beurteilt. Auch dort gelten
ausdrückliche Maße, geschützte Quellen und native Geometrieprüfungen weiter.
Eine angenommene Bildprüfung ist kein Maßnachweis.

## Lokale Speicherung

Die interne Desktop-Anbindung speichert Aufträge im privaten Datenordner
`KI-Auftraege`. Vorgaben, ursprünglicher Auftrag, verbrauchte Arbeitsschritte,
Fehlergedächtnis, Messbefunde und native Kandidatendaten lassen sich dort
mit Prüfsumme atomar ablegen. Anbieterzugänge bleiben in den vorhandenen
Anbietereinstellungen.

Ein Schreibfehler ersetzt keinen zuvor gespeicherten Stand. Ein erfolgreicher
Abschluss des Speicher-Hooks wird abgewartet, bevor die Anfrage ihren fertigen
Entwurf zurückgibt. Ein fehlgeschlagener Schreibvorgang wird nicht als weiterer
Modellierversuch wiederholt. Das Lesen eines Auftrags führt kein gespeichertes
Programm aus und übernimmt keine Geometrie.

Revision, vollständige Projektprüfsumme, Auswahl und Referenzprüfsumme müssen
zur Fortsetzung passen. Generationsprüfung und eine Sperre des laufenden
Prozesses verhindern doppelte Fortsetzung. Nach einem tatsächlich beendeten
Besitzerprozess kann die Ablage einen unterbrochenen Auftrag wieder freigeben;
die verbrauchten Schritte bleiben erhalten. Gestoppte oder bereits übernommene
Aufträge werden nicht automatisch erneut ausgeführt.

## Geprüfte Fortsetzung im Anfragekern

Der Anfragekern kann gespeicherte Mess- und Fehlerstände in einem frischen
CAD-Controller fortsetzen. Er prüft zuvor Auftrag, Projekt, Auswahl,
Referenzen, feste Sollprüfungen und Budget. Verbrauchte Schritte und alle
Wiederholungszähler bleiben erhalten. Vollständige Messdateien, ursprüngliche
Analyseprogramme einschließlich Hilfsmodulen und Parametern sowie gesperrte
Konverterrouten werden gemeinsam wiederhergestellt. Analyseprogramme und
ursprüngliche Messergebnisse bleiben gegenüber Modellskripten schreibgeschützt.
Ein voller Arbeitsbereich hinterlässt kein unvollständiges Programmpaket.

Gespeicherte native Kandidaten werden aus ihren archivierten Quellen neu
aufgebaut und erhalten eine neue Vorschaukennung. Die ursprünglichen
Modellprogramme werden dabei nicht erneut ausgeführt. Veränderte BRep-Daten,
Quellen oder Dreiecke beim Aufbau führen zum Abbruch der Wiederherstellung.
Körperprüfungen und Sollmaße stammen aus neuen Messungen; gespeicherte
Prüfberichte erlauben keine Übernahme. Geänderte Materialnetze benötigen einen
frischen Netzkernnachweis. Erforderliche Folgeänderungen erhalten wieder eine
private Bestätigungssperre. Übernahme und Rückgängig bleiben ausdrücklich.

Eine ausstehende Bildprüfung wird nach abgeschlossener lokaler Buchführung
mit neuen Vorschauansichten fortgesetzt. Ihr bereits gezählter Prüfversuch
bleibt gezählt. Gespeicherte Fotoausschnitte sind Datenbeschreibungen, aus denen
die Anwendung die Bilder mit den erneut gebundenen Originalfotos erzeugt.
Unvollständige ältere Kandidatenstände und fehlende Fotodaten werden abgelehnt.

## Auftragsoberfläche und automatische Ablage

Im Chat unter „Modell & Einstellungen“ öffnen „Auftragsvorgaben“ den Editor
und „Gespeicherte Aufträge“ die lokale Liste. Der Editor hält Qualitätsart,
festes Ziel, Annahmen, geschützte Teile oder Quellen und native Sollprüfungen.
Nicht mehr vorhandene geschützte Quellen bleiben als fehlend erkennbar.
Beim Senden eines Modellierauftrags werden die Vorgaben zusammen mit der
ursprünglichen Modellbasis und Auswahl gespeichert. Bilder und Referenzen
bleiben zum ursprünglichen Auftrag gebunden. Zugangsdaten und die aktuelle
Anbieterkonfiguration bleiben getrennt.

Die Liste zeigt Status, verbrauchte Schritte, Vorgaben und konkrete Befunde.
„Fortsetzen“ verwendet das restliche Budget eines unterbrochenen Auftrags.
„Entwurf wiederherstellen“ prüft einen gespeicherten Kandidaten erneut,
auch wenn der Auftrag bereits gestoppt ist; dabei gibt es keinen weiteren
Anbieteraufruf und keinen Budgetverbrauch. Fehlgeschlagene Prüfungen erfordern
weiter die ausdrückliche Übernahme mit Fehlern. Übernahme und Verwerfen werden
im gespeicherten Auftragsstatus vermerkt. Ein Fehler beim anschließenden
Speichern des Status wird zusätzlich gemeldet und stellt die bereits erfolgte
Modelländerung nicht als fehlgeschlagen dar.

Wenn Modell oder Auswahl nicht mehr passen, beginnt keine Fortsetzung.
„Auftragsmodell öffnen“ kann die gesicherte Basis mit ihrer Auswahl über
den vorhandenen Projektwechsel wieder öffnen. Vorhandene ungespeicherte
Änderungen durchlaufen dabei denselben Speichern-/Verwerfen-Dialog wie andere
Projektwechsel. Bloße Format- oder Modellabweichungen werden nicht still
umgebunden. Die Basis sichert auch die vollständigen ursprünglichen
Geometrieblöcke eines Projektpakets; ihre spätere Wiederherstellung benötigt
keine alte Dateifähigkeit. Kandidaten werden vor ihrer Ablage materialisiert.

## Technische Prüfung

Die Prüfungen verwenden synthetische Modelle und Modellantworten. Sie prüfen
CAD-Kern, Desktop-Transport und Speicherweg; sie sind keine Aussage über die
allgemeine Modellierqualität eines KI-Modells.

Zwei vollständig getrennte Anwendungsprozesse prüfen die Wiederaufnahme mit
originaler Modellbasis, Fotokalibrierung und gespeichertem Bildausschnitt. Das
ursprüngliche Projektpaket wird zwischen den Prozessen entfernt. Vollständige
Analyseprogramme einschließlich Hilfsmodulen und große Messbefunde bleiben
erhalten; erfolgreiche Messungen werden beim Fortsetzen nicht erneut ausgeführt.
Die Speicherung als neues Projektpaket und das Wiederöffnen erhalten den Entwurf
und die ursprüngliche bearbeitbare FCStd-Datei. STEP und STL werden physisch
exportiert und unabhängig vermessen; die FCStd-Ausgabe bleibt bytegenau.

Weitere Fälle decken Abbruch, andere Revisionen, geänderte Auswahl und
Merkmalsbezüge, fehlendes FreeCAD, ausgeschöpftes Budget und doppelte Fortsetzung
ab. Der letzte Entwurf kann auch nach Budgetende ohne Anbieteranfrage erneut
geprüft werden. Ein fehlendes FreeCAD stoppt den betroffenen Auftrag mit
konkretem Befund; Einrichtung und Zugangsdaten bleiben in den Einstellungen.

Die abschließende Abnahme einer gepackten Windows-Ausgabe steht separat in
`Freigabe.json` neben dem Programmordner. Erst dieser Bericht bestätigt die
vollständige Paketprüfung und Sichtkontrolle der betreffenden Ausgabe.


Die Windows-Ausgabe **0.111.0-r2** hat die vollständige Abnahme mit 524 Tests und
929 Prüfgruppen in 21 EXE-Läufen bestanden, einschließlich 19 Auftrags-UI- und
41 Prüfungen über zwei echte Hauptprozesse. Sieben Auftragsaufnahmen wurden
visuell geprüft. Die Auftragsablage liegt im eigenen Datenordner; sie gehört
beim Rechner- oder Versionswechsel zu den mitzunehmenden lokalen Daten.
