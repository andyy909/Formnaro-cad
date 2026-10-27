> Historische Referenz. Aktueller Folgeauftrag ab 26.10.2026: [Ausbauplan ab 0.106](AUSBAUPLAN-AB-0.106.md). Die damaligen Pakete sind abgeschlossen; die zusätzliche Druckprüfung bleibt gestrichen.

> Umsetzung ab 15.10.2026: Maßgeblich sind die 27 einzeln beauftragten Arbeitspakete im [Umsetzungsstand](FORMNARO-UMSETZUNGSSTAND.md). Die folgenden größeren Etappen bleiben der technische Hintergrund. Die erste [gemeinsame Projektgrundlage](GEMEINSAME-PROJEKTGRUNDLAGE.md) führt CAD, geschlossene und offene Netze zusammen; die vollständige Werkzeugübernahme läuft weiter.

# Formnaro Gesamtplan für Netz CAD und STL zu STEP

Aktualisierung vom 18.10.2026: Die konkretisierten Pakete 1–26 sind abgeschlossen.
Die zusätzliche Druckprüfung (Paket 27) ist auf Nutzerwunsch gestrichen;
Überhänge und Druckausrichtung bleiben beim Slicer. Modellierpinsel und Symmetrie
sind anschließend beauftragt und in Quellstand 0.58.0 mit vorhandener Vernetzung
implementiert; die separate Abnahme muss Quelle und tatsächliche EXE prüfen.
Die ursprüngliche Planfassung unten dient als Entwicklungshintergrund.

Stand: 15. Oktober 2026. Planfassung 1. Dieser Plan beschreibt den weiteren Ausbau; die nachfolgenden Entwicklungspakete sind noch nicht umgesetzt.

Das Ziel ist **ein Formnaro mit einer Programmdatei, einer gemeinsamen Arbeitsfläche und einem Projekt**, in dem Netzteile, native CAD-Körper und die Ergebnisse des STL-zu-STEP-Konverters zusammen bearbeitet werden. Netz und CAD behalten intern ihre passenden Rechenverfahren. Neue Funktionen werden anschließend als überschaubare Pakete ergänzt.

Der Nutzer hat die Priorität bestätigt: **technische Teile und 3D-Druck; zuerst Reparieren, Teilen und Vereinfachen.** Werkzeuge zum freien Modellieren von Figuren und Scans folgen später.

## Ausgangspunkt

| Bereich | Aktueller geprüfter Stand | Bedeutung für den Gesamtplan |
| --- | --- | --- |
| Formnaro CAD 0.23 | Native CAD-Körper und Quellen mit OCCT, STEP, Netzreferenzen, 3MF/GLB/glTF-Austausch | CAD-Funktionen und gespeicherte BReps übernehmen |
| Formnaro Netz 0.21 | Manifold-Körper, Quellen, Bohrungen, boolesche Operationen, Ebenenteilung, Körper herauslösen, Kantenwerkzeuge mit Grenzen, 3MF/GLB/glTF | Netz-Funktionen in die gemeinsame Anwendung einbinden |
| STL-zu-STEP-Konverter 0.10 | Bereits im CAD-Programm integriert: eigener lokaler Prozess, Flächenanalyse, Bereichskorrekturen, Vorschau, Bericht, STEP-Rückimport | Vorhandene geprüfte Anbindung wiederverwenden und auf ausgewählte Netzobjekte erweitern |
| Gemeinsame Bedienung | Ähnliche Oberflächen, Projekte, Ansichten, KI, Maße und Werkzeuge; bisher zwei Anwendungssteuerungen | Auf eine gemeinsame Steuerung und einen gemeinsamen Projektzustand bringen |

Wesentliche technische Grenze: Der Netz-Modellierpfad erwartet bisher geschlossene gültige Körper. Offene oder beschädigte Oberflächen brauchen einen eigenen Bearbeitungszustand, damit man sie überhaupt untersuchen, auswählen und reparieren kann. Die bisherige optionale STL-Reparatur ist auf 40.000 Dreiecke und bestimmte Fehler beschränkt. Die Wanddickenprüfung arbeitet mit Stichproben. Das sind Grundlagen für den Ausbau, keine vollständigen Meshmixer-Werkzeuge.

## Zielbild der gemeinsamen Anwendung

Oben stehen die Bereiche **Modellieren**, **Netz bearbeiten**, **In CAD umwandeln** und **Prüfen**. Der Wechsel ändert die angebotenen Werkzeuge. Objekte, Auswahl, Kamera, Maße und Arbeitsebene bleiben im gleichen Projekt. Im Objektbaum ist erkennbar, ob ein Teil ein CAD-Körper, ein bearbeitbares Netz oder eine Ansichtsvorlage ist.

Ein typischer Arbeitsweg:

1. STL, 3MF oder GLB importieren und auch ein offenes Netz zunächst ansehen können.
2. Fehler untersuchen, passende Stellen reparieren und einzelne Teile herauslösen.
3. Dreiecke bei Bedarf reduzieren und technische Bereiche schützen.
4. Entweder im Netz weiterarbeiten oder den ausgewählten Stand an den Konverter übergeben.
5. Konvertierung vergleichen und das Ergebnis als zusätzlichen CAD-Körper übernehmen.
6. Native Bohrungen oder weitere CAD-Bearbeitungen ausführen, soweit die Ergebnisgeometrie sie unterstützt.
7. Das ganze Projekt speichern und je nach Zweck STEP, STL, 3MF oder GLB ausgeben.

Eine Netzdatei wird durch den Bereichswechsel nicht automatisch zu präzisen CAD-Flächen. Auch eine geschriebene STEP-Datei kann noch facettierte Flächen enthalten. Die ursprüngliche Konstruktionshistorie entsteht durch Konvertierung nicht neu.

## Schritt 0 Ausgangsstände und Prüffälle festhalten

**Ergebnis:** Eine belastbare Ausgangsbasis für die Zusammenführung. Aufwand: klein.

- Die abgenommenen CAD-, Netz- und Konverterstände mit Quellen und Prüfsummen als Ausgangspunkte erhalten. Vorhandene Prüfbelege verwenden und veränderte Bereiche gezielt erneut prüfen.
- Eine gemeinsame Funktionsliste anlegen: bereits vorhanden, nur in CAD, nur in Netz, neu geplant. So werden vorhandene Werkzeuge weitergeführt und Doppelentwicklungen vermieden.
- Einen eigenen Integrationszweig im Formnaro-Projekt vorsehen. Der getrennte Netz-Stand bleibt bis zur bestandenen Übernahme eine stabile Referenz. Die bisherigen Programmordner bleiben erhalten.
- Eine kleine synthetische Prüfsammlung anlegen: gebohrter Halter, dünnwandiges Gehäuse, mehrere Materialkörper mit Hohlräumen, fehlende Flächen, falsche Orientierung, überzählige Dreiecke, Selbstüberschneidung, dichtes Netz und gemischte CAD-Netz-Baugruppe.

**Fertig, wenn:** Zu jedem vorhandenen Funktionsbereich der verantwortliche Modulpfad, die wichtigsten Erhaltungsregeln und ein prüfbarer Anwendungsfall feststehen.

## Schritt 1 Gemeinsames Projekt und gemeinsame Befehle definieren

**Ergebnis:** Beide Geometriearten passen ohne Datenverlust in dasselbe Projekt. Aufwand: groß; wichtigste Grundlage.

- Gemeinsame Objektkennung, Namen, Farben, Lage, Einheiten, Layer, Ordner, Sichtbarkeit, Sperren und Quellenbeziehungen definieren.
- CAD-Daten als native Quellen/BRep und Netzdaten als Dreiecksnetze erhalten. Für Netze einen Prüfstatus vorsehen: ungeprüft, offen, fehlerhaft oder als geschlossener Körper bestätigt. Ungültige Zahlen und Dateistrukturen weiterhin schon beim Lesen abweisen.
- Einen gemeinsamen Projektzustand mit einer Revision, Vorschau, Übernahme, Abbruch und Rückgängig/Wiederholen schaffen. Ein Werkzeugaufruf ergibt eine gemeinsame Transaktion, auch wenn mehrere Rechenmodule beteiligt sind.
- Die vorhandenen Projektleser durch Importadapter weiterverwenden: CAD-Formate 5/7 sowie Netz-Formate 1–4/6 einschließlich bisheriger Kompression. Das gemeinsame Speicherformat erhält eine eigene Version; Migration erfolgt über eine neue Datei. Alte Dateien werden nicht still überschrieben.
- Große Geometriedaten in gemeinsamen Projekten getrennt vom Arbeitszustand speichern und doppelte Quellgeometrie vermeiden. Vorschaunetze, Worker-Handles und temporäre Konverterdateien gehören nicht als zweite Wahrheit in die Konstruktionsdaten.

**Fertig, wenn:** Eine gemischte Baugruppe mit gesperrtem CAD-Teil, Netzteil und offenem Oberflächennetz gespeichert und wieder geöffnet werden kann. Quellen, Lage, Farbe und Sperren bleiben erhalten; eine fehlgeschlagene Mehrteilaktion verändert kein Objekt.

## Schritt 2 Eine gemeinsame Anwendung aufbauen

**Ergebnis:** Eine Formnaro-EXE mit einer gemeinsamen Szene und Bedienung. Aufwand: groß.

- Programmstart, Projekte, Objektbaum, Auswahl, Kamera, Arbeitsebene, Eigenschaften und Dateidialoge vereinheitlichen. Die beiden bisherigen großen Anwendungssteuerungen schrittweise an diese gemeinsame Oberfläche anschließen.
- OCCT für CAD und Manifold für bestätigte geschlossene Netzoperationen über getrennte Rechenadapter aufrufen. Nur benötigte Module laden; Berechnungen laufen außerhalb der Oberfläche.
- Netzoberflächen auch ohne gültigen Manifold-Körper darstellen können. Noch nicht geeignete Werkzeuge erklären, welche Voraussetzung fehlt.
- Gemischte Auswahl für Verschieben, Drehen, Farben und Organisation ermöglichen. Fachwerkzeuge erhalten passende Ziele; gemischte boolesche Operationen bieten eine ausdrückliche Umwandlungskopie an.
- Vorhandene KI-Funktionen, deutsche/englische Oberfläche, Schriften und Layouts in die gemeinsame Steuerung übernehmen. Anbieterprofile bei einer späteren Migration gezielt übernehmen; bestehende Profilordner dabei erhalten.

**Fertig, wenn:** CAD und Netz im selben Fenster und Projekt bearbeitet werden. Ein Bereichswechsel erhält Auswahl und Ansicht. Ein abgebrochener oder abgestürzter Rechenauftrag lässt das bestätigte Projekt benutzbar.

## Schritt 3 CAD Netz und Konverter durchgängig verbinden

**Ergebnis:** Die erste vollständige gemeinsame Ausgabe von Formnaro. Aufwand: mittel bis groß.

- **CAD zu Netz:** Eine ausdrücklich erzeugte Kopie mit wählbarer Vernetzungsqualität. Die native CAD-Quelle bleibt erhalten.
- **Netz zu CAD:** Den vorhandenen Konverter auf ein ausgewähltes Netzteil oder eine kontrollierte Teileauswahl anwenden. Original, Ergebnis und gemessene Abweichung vor der Übernahme vergleichen.
- Einheit und Transformation genau einmal anwenden. Farben, Namen und Herkunft soweit eindeutig zuordenbar übertragen; eine nicht eindeutige Zuordnung kenntlich machen.
- Quellgeometrie, Revision und Konvertierungsparameter an den Auftrag binden. Ändert sich die Quelle, wird ein altes Ergebnis nicht darübergelegt. Vorhandene Bereichskorrekturen nur bei passender Quellgeometrie weiterverwenden.
- Das Ergebnis als neuen CAD-Körper mit Quellenverweis und Bericht übernehmen; ein Undo nimmt diese Übernahme zurück. Original und bewusst vereinfachte Konvertereingabe getrennt erhalten.
- Eine gemeinsame Import-/Exportübersicht nach Objekttyp definieren. STEP enthält CAD-Geometrie, Netzformate erhalten die passenden triangulierten Teile. Offene Oberflächen dürfen exportierbar sein, werden aber nicht als geprüfte Druckkörper bezeichnet.

**Fertig, wenn:** Der oben beschriebene Arbeitsweg vom Import über Netzbearbeitung und Konverter bis zum gespeicherten gemischten Projekt und Export in einer gepackten EXE funktioniert. Lage, Maße, Originalquellen, Abbruch und Undo sind geprüft.

**Meilenstein A:** Ein benutzbares gemeinsames Programm. Weitere Meshmixer-artige Werkzeuge werden ab jetzt in dieser Anwendung ergänzt.

## Schritt 4 Oberflächen auswählen und schützen

**Ergebnis:** Die Bediengrundlage für lokale Netzwerkzeuge. Aufwand: mittel bis groß.

- Dreiecke, zusammenhängende Oberflächen, Randringe und Flächengruppen auswählen.
- Pinsel, Lasso und Rechteck; nur sichtbare Flächen oder ausdrücklich durchgehende Auswahl; Auswahl erweitern, verkleinern und umkehren.
- Technische Flächen und Bohrungsränder als Schutzbereiche markieren. Objekt-Sperren bleiben davon unabhängig wirksam.
- Auswahlen und Schutzbereiche an die aktuelle Netzversion binden. Nach einer Änderung der Dreiecksstruktur werden sie nachvollziehbar neu zugeordnet oder als überprüfungsbedürftig markiert.

Meshmixer macht solche Oberflächenauswahlen zur Grundlage vieler Bearbeitungen. Für Formnaro ist das deshalb ein eigenes Entwicklungspaket. [Autodesk Select Tool](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-157E6A0E-4B7B-43EF-AFDC-528A79BF2242.htm)

**Fertig, wenn:** Eine Öffnung mit Innen- und Außenrand gezielt ausgewählt werden kann, ohne die Rückseite oder benachbarte Teile versehentlich mitzunehmen.

## Schritt 5 Netzinspektor und gezielte Reparatur

**Ergebnis:** Das erste neue Werkzeugpaket für technische STL-Dateien. Aufwand: groß.

- Offene Ränder, doppelte/entartete Dreiecke, falsch orientierte Flächen, nicht eindeutige Kantenverbindungen und kleine getrennte Bestandteile anzeigen. Selbstüberschneidungen als eigene Diagnose ergänzen, sobald deren Erkennung ausreichend geprüft ist.
- Fehler im 3D-Modell anklicken und einzeln bearbeiten. Ein zusammengefasster Reparaturvorschlag zeigt die geplanten Änderungen vor der Übernahme.
- Zunächst einfache und planare Randringe füllen, anschließend auch geeignete größere und gekrümmte Öffnungen. Innen- und Außenränder von Hohlkörpern gemeinsam berücksichtigen, damit keine unbeabsichtigte volle Scheibe entsteht.
- Gezielt ausgewählte Flächen löschen und den Bereich neu schließen, ähnlich Erase & Fill. Überbrücken zweier offener Ränder als gesonderte Erweiterung planen.
- Kleine Bestandteile markieren und nur auf ausdrückliche Auswahl entfernen. Eine kleine Schraube oder dünne Restschale ist nicht automatisch Abfall.

Meshmixers Inspector behandelt Löcher, problematische Verbindungen und kleine Komponenten; die Autodesk-Hilfe weist selbst darauf hin, dass das Entfernen kleiner Komponenten wichtige Details löschen kann. Das begründet die vorsichtige Auswahl in Formnaro. [Inspector](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-83BC663B-FA1C-46D3-8C2F-82EB6892DFC3.htm), [Erase & Fill](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-A39BD725-0326-480B-AA34-4387964AB846.htm)

**Fertig, wenn:** Ein offenes Testgehäuse repariert werden kann, während absichtliche Durchbrüche und innere Hohlräume erhalten bleiben. Nicht sicher reparierbare Fälle bleiben sichtbar und verändern das Original nicht.

## Schritt 6 Teilen und wieder zusammenbauen

**Ergebnis:** Große oder mehrteilige Druckmodelle kontrolliert vorbereiten. Aufwand: mittel.

- Vorhandene Ebenenteilung und Körpertrennung in die gemeinsame Oberfläche übernehmen und komfortabler machen: numerische Schnittlage, Arbeitsebene, beide Seiten behalten, Schnittflächen prüfen.
- Oberflächenauswahl als eigenes Teil herauslösen. Dabei zwischen bloßer Oberflächenkopie und neu geschlossenem Körper unterscheiden.
- Einfache Steckverbinder, Passstifte und passende Aufnahmen mit einstellbarem Spiel ergänzen. Zu dünne Wände oder kollidierende Verbinder vor Übernahme melden.
- Zusammenfügen, Abziehen und Schnittmenge für geeignete geschlossene Netze weiterführen. Für CAD und Netz unterschiedliche Genauigkeitsgrenzen sichtbar halten.

**Fertig, wenn:** Ein Gehäuse in zwei Teile zerlegt und mit passenden Verbindern versehen werden kann. Teilung, Bohrungen, Quellen und Undo bleiben nachvollziehbar.

**Meilenstein B:** Gemeinsames Formnaro mit Netzinspektor, gezielter Reparatur und druckgerechtem Teilen.

## Schritt 7 Vereinfachen neu vernetzen und lokal glätten

**Ergebnis:** Dichte Netze handlicher machen und lokale Fehler bereinigen. Aufwand: groß.

- **Reduce:** Dreiecke nach Zielzahl, Anteil oder Abweichungsziel reduzieren. Objektweise und für ausgewählte Flächen; Öffnungen, scharfe Kanten, Flächengruppen und Schutzbereiche berücksichtigen.
- **Remesh:** Dreiecksverteilung nach gewünschter Kantenlänge erneuern. Für reine Unterteilung und tatsächlich formverändernde Neuvernetzung unterschiedliche Optionen vorsehen.
- **Smooth:** Ausgewählte unruhige Stellen glätten, mit begrenzter Stärke und festgehaltenen technischen Bereichen.
- Vorher/Nachher, Dreiecksanzahl, kritische Maße und beidseitig gemessene Oberflächenabweichung anzeigen. Stichproben als solche bezeichnen. Ein eingestelltes Abweichungsziel ist ohne weitergehenden Nachweis kein garantierter globaler Maximalfehler.

Diese drei Werkzeuge haben unterschiedliche Aufgaben. Autodesk beschreibt Reduce als Verringerung der Dreiecke, Remesh als neue Dreiecksverteilung und Smooth als Glättung ausgewählter Bereiche. Auch dort können Formdetails verändert werden. [Reduce](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-54087649-E962-409E-8565-F646BDA80B33.htm), [Remesh](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-6EF8ABD4-AB4A-426F-A0C4-DE96FAABF520.htm), [Smooth](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-7C2ECD2F-473A-4BFB-BFD9-25911E198562.htm)

**Fertig, wenn:** Ein dichtes gebohrtes Testteil nach nachvollziehbaren Kriterien reduziert werden kann. Geschützte Bohrungen und Anlageflächen erfüllen ihre vorab festgelegten Maßgrenzen; eine stärkere Vereinfachung wird abgewiesen oder als geänderte Variante angeboten.

## Schritt 8 Geschlossene Körper und Aushöhlen

**Ergebnis:** Schwierige Netzformen für weitere Bearbeitung und Druck vorbereiten. Aufwand: groß, vorher Technikversuch.

- **Make Solid:** Eine neue geschlossene Annäherung aus problematischen Oberflächen erzeugen. Auflösung, geschlossene Öffnungen und verlorene Details vergleichbar anzeigen; das Original erhalten.
- **Hollow und Offset:** Für geeignete Formen Wandstärke vorgeben, Innenraum erzeugen und bei Bedarf Ablauföffnungen setzen. Abgeschnittene kleine Hohlräume oder kritische dünne Wände melden.
- Die ursprünglich vorgesehene zusätzliche Druckprüfung mit Wanddickenanzeige, Überhängen und Druckorientierung wurde am 18.10.2026 auf Nutzerwunsch gestrichen. Bestehende Modell- und Werkzeugprüfungen bleiben erhalten.

Make Solid ist eine geometrische Annäherung. Bei voxelbasierten Verfahren können kleine Details verschwinden; Hollow baut in Meshmixer auf einer verwandten Grundlage auf. Diese Werkzeuge brauchen deshalb eigene Qualitätsprüfungen und dürfen technische Reparatur nicht still ersetzen. [Make Solid](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-F8C64203-AFB7-449C-A395-2C029A80BB6C.htm), [Hollow](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-4092B330-FF8D-4523-BB43-9453F60BCF4E.htm)

**Fertig, wenn:** Ein geeignetes Modell mit einstellbarer Wand und Ablauföffnung erzeugt und erneut geprüft werden kann. Zu dünne oder mehrdeutige Bereiche werden erkennbar; das Ausgangsnetz bleibt verfügbar.

**Meilenstein C:** Gemeinsames Formnaro mit den wichtigsten Netz-Werkzeugen für technische Teile und 3D-Druck.

## Spätere Erweiterungen

| Priorität | Werkzeuggruppe | Einordnung |
| --- | --- | --- |
| Nach Meilenstein C | Glättungs-, Auftragen-, Abtragen-, Verschieben- und Abflachen-Pinsel; Symmetrie | Für lokale Formkorrekturen und anschließend Figuren/Scans; auf Auswahl, Schutzbereichen und Neuvernetzung aufbauen |
| Nach Bedarf | Flächen extrudieren, versetzen, verbinden, prägen; Schrift auf Oberflächen | Neue Formgestaltung; getrennt von nativen CAD-Operationen behandeln |
| Nach Bedarf | Weitere Reparaturen für Selbstüberschneidungen und schwierige Randverbindungen | Mit reproduzierbaren Problemfällen priorisieren |
| Nach Bedarf | Bessere Flächenfarben, Materialgruppen und Austauschformate | Bestehende Importgrenzen schrittweise erweitern |
| Später | Automatische Stützstrukturen und erweiterte Druckanordnung | Gegen tatsächlichen Bedarf abwägen; Slicer bleiben zunächst für Druckpfade und Druckprofile zuständig |
| Laufend | CAD-Werkzeuge, Konverterqualität, große Projekte, Speicher und KI | In denselben Entwicklungsplan aufnehmen, ohne gleichzeitig alle Grundlagen umzubauen |

Meshmixer verwendet für Sculpting verschiedene Pinsel und dynamische Neuvernetzung. Der spätere Termin ist eine Priorisierung für technische Teile, keine Streichung dieser Werkzeuge. [Sculpt Tool](https://help.autodesk.com/cloudhelp/2019/ENU/MSHMXR/files/GUID-6D77C4D0-0E73-411F-B00F-F71508D00DEA.htm)

## Technische Umsetzung und offene Entscheidungen

1. **Eine gemeinsame Oberfläche, getrennte Rechenmodule.** Die bestehenden Controller und Funktionen über Adapter übernehmen. Das Zusammenkopieren beider Startdateien schafft noch keinen gemeinsamen Projektzustand.
2. **Ein führender Projektzustand.** Änderungen aller Rechenmodule werden gegen denselben Stand geprüft und atomar übernommen. Netz- und CAD-Geometrie behalten ihre eigenen Genauigkeitsverträge.
3. **Ein zusätzlicher Pfad für Oberflächennetze.** Manifold weiter für geeignete geschlossene Körper verwenden. Offene Netze, Auswahl und Reparatur brauchen davon unabhängige Oberflächenoperationen.
4. **Technikversuche vor den großen Netzpaketen.** Die installierte Manifold-Schnittstelle bietet unter anderem Vereinfachung, Unterteilung und Level-Set-Erzeugung. Das beweist noch keine vollständige Reparatur-, Remesh- oder Hollow-Lösung. Kandidaten an offenen Netzen, dünnen Wänden und geschützten Kanten vergleichen; gegebenenfalls eine geeignete lokale Bibliothek über einen abgekapselten Worker oder Prozess anbinden. Entscheidungskriterien: Ergebnisqualität, Abbruch, Speicher, portable Windows-Auslieferung, Wartbarkeit und passende Lizenzen.
5. **Gemeinsame Funktionen an einer Stelle pflegen.** Nach der Übernahme gemeinsame Module im Integrationsprojekt führen. Die bisherigen Stände dienen als Referenz; Funktionskorrekturen sollen später nicht dauerhaft manuell zwischen zwei Programmen kopiert werden.
6. **KI je Werkzeug ergänzen.** Neue Befehle erst nach bestandener Werkzeugabnahme freigeben. Die KI erhält passende Objektarten, Auswahl, Schutzbereiche, Einheiten, Fehlerrückmeldungen und aktuelle Revision. Vorschau und ausdrückliche Übernahme bleiben erhalten.

## Abnahme für jedes Entwicklungspaket

- Das konkrete Arbeitsbeispiel funktioniert über die normale Oberfläche und in der gepackten Anwendung.
- Abbruch, fehlerhafte Eingaben, gesperrte Teile und veraltete Ergebnisse verändern den bestätigten Projektstand nicht.
- Undo/Redo sowie Speichern, Wiederöffnen und die betroffenen Exportwege funktionieren mit den neuen Daten.
- Unbeteiligte Quellen, kleine Bestandteile, Innenräume, Farben und Maßgrenzen werden nach den Regeln des jeweiligen Werkzeugs geprüft.
- Dichte und dünnwandige Modelle gehören in die Prüfsammlung. Laufzeit und Spitzen-RAM werden auf demselben Testrechner gemessen, bevor eine Leistungsverbesserung zugesagt wird.
- Erforderliche Regressionen bleiben erhalten. Neue Pakete werden separat erstellt und mit ihren Quellen und Lizenzen ausgeliefert.

## Neue Wünsche und Zeitplanung

Jeder neue Wunsch erhält einen kurzen Eintrag: Anwendungsfall, Nutzen, betroffene Geometrieart, Abhängigkeiten, Qualitätsgrenzen und Abnahmebeispiel. Anschließend wird er entweder in das nächste passende Paket eingeordnet oder in die spätere Liste aufgenommen. Ein begonnenes Grundlagenpaket wird nur bei einem Fehler oder einer bewussten Prioritätsänderung unterbrochen.

Die Aufwandsangaben klein/mittel/groß sind relative Planungshilfen. Belastbare Termine ergeben sich nach dem gemeinsamen Projektprototyp und den Technikversuchen für die neuen Netzverfahren. Der Plan verspricht deshalb keine vollständige Meshmixer-Parität zu einem festen Datum.

**Empfohlener nächster Auftrag:** Schritt 0 und Schritt 1 als Paket „Gemeinsames Projektfundament“. Zuerst eine kleine gemischte Baugruppe mit einem geschlossenen und einem offenen Netz speichern, wieder öffnen und transaktional bearbeiten. Danach wird die gemeinsame Oberfläche angeschlossen. Neue große Netz-Werkzeuge werden anschließend in diesem gemeinsamen Fundament entwickelt.

## Lokale Grundlagen der Bestandsaufnahme

- CAD: `src/cad-controller.js`, `src/cad-project.js`, `src/cad-service.js`.
- Konverter: `converter/README.md`, `converter/provenance.json`, `backend/stl-converter.cjs`, `src/cad-stl-converter.js`, `src/cad-stl-workbench.js`.
- Netz im Nachbarprojekt `formnaro-netz`: `src/geometry.js`, `src/mesh-import.js`, `src/mesh-stl-repair.js`, `src/mesh-partition.js`, `src/model-analysis.js`, `src/mesh-function-plugins.js`.
- Austauschformate und aktuelle Grenzen: [Austauschformate 3MF GLB und glTF](AUSTAUSCHFORMATE-3MF-GLB-GLTF.md).

Die Autodesk-Verweise beschreiben Meshmixer-Funktionen. Reihenfolge, technische Architektur und Abnahmekriterien dieses Dokuments sind der vorgeschlagene Formnaro-Entwicklungsplan.
