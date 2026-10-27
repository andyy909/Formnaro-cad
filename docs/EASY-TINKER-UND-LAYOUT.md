# Easy Tinker und eigene Werkzeuganordnung

Formnaro 0.41.0 ergänzt zwei umschaltbare Bedienmodi. Oben neben den
Dateiwerkzeugen stehen **Easy Tinker** und **Normal**. Der gewählte Modus wird
lokal im portablen Datenordner gespeichert.

## Easy Tinker

- Grundformen und Suche stehen rechts, Arbeitsebene und Lineal darüber.
- Oben stehen die grundlegenden Werkzeuge zum Kopieren, Duplizieren,
  Entfernen, Gruppieren, Auflösen, Ausrichten, Spiegeln und Absetzen sowie Undo/Redo.
- Bei Auswahl erscheint neben der Formenleiste eine kompakte Eigenschaftenkarte:
  Körper/Loch, Farbe, Maße und grundlegende Formparameter.
- Links bleiben die Ansichten erreichbar, die Bewegungswerkzeuge stehen unten.
- Objektbaum, Layer-/Ordnerverwaltung, KI-Chat, Umwandlungen und Spezialwerkzeuge
  sind ausgeblendet. Sie sind nach dem Wechsel zu Normal wieder verfügbar.

Ein Moduswechsel verändert weder Modell noch Undo-Verlauf noch die gespeicherte
normale Anordnung. Während einer offenen Bearbeitungsvorschau muss zuerst
übernommen oder abgebrochen werden. Eingeklappte normale Leisten bleiben als
solche gespeichert; Easy zeigt die benötigten Inhalte vorübergehend wieder an.

## CAD oder Netz in Easy Tinker

Oben neben dem Bedienmodus steht der Schalter **CAD / Netz**, mit der Anzahl
fertiger Teile je Bereich. Beim ersten Start ist CAD gewählt.

- **CAD**: neue Formen sind native CAD-Körper; STEP ist beim Export verfügbar.
- **Netz**: neue Formen entstehen direkt als bearbeitbare Netze mit gespeicherten
  Formquellen, auch Text und Formenpakete. „Formparameter …“ öffnet ihre Quellen.
  Gruppieren und Lochformen verwenden die Netzwerkzeuge mit Vorschau/Übernehmen.
- Nur der gewählte Bereich erscheint auf der Arbeitsfläche und wird ausgewählt,
  kopiert oder exportiert. Fremde Zwischenablage-Inhalte erfordern den passenden
  Bereich. Grundformen lassen sich in beiden Bereichen hinzufügen und platzieren.
- Der Wechsel verändert keine Geometrie und erzeugt keinen Rückgängig-Schritt.
  Andere Teile bleiben im selben Projekt gespeichert. Es findet keine automatische
  CAD-/Netz-Umwandlung statt; dafür sind die Werkzeuge in Normal verfügbar.
- **Speichern** sichert das vollständige Projekt einschließlich des anderen
  Bereichs. **Export** schreibt nur sichtbare Teile des aktiven Bereichs.
  Eine normale Projektdatei öffnet stets das ganze Projekt; Easy zeigt daraus
  den gewählten Bereich. Ansichtsvorlagen sind in Normal erreichbar.
- Im Netzbereich bleiben STL/OBJ/3MF/glTF Netze. STEP gehört in den CAD-Bereich;
  CAD-STL-Import öffnet den vorhandenen Rekonstruktionsdialog. SVG verwendet den
  gewählten Bereich. Hinweise erklären, wenn eine Datei den anderen Bereich braucht.

Die Wahl wird lokal gespeichert und nach Neustart wiederhergestellt. Offene
Dialoge, laufende Erstellung und Werkzeugvorschauen müssen vor einem Wechsel
abgeschlossen oder abgebrochen werden. Normal zeigt beide Bereiche gemeinsam.

## Automatischer Reparaturversuch im Easy-Netzbereich

Sobald Easy Tinker im Bereich Netz bereit ist, prüft Formnaro sichtbare,
entsperrte Netzteile im Hintergrund. Das gilt auch nach Import, Öffnen oder
Umschalten. Ein beschädigtes Netz löst einen Reparaturversuch ohne zusätzliche
Rückfrage und ohne Übernehmen-Dialog aus. Eine kurze Meldung nennt das Ergebnis.

Zuerst werden sicher entartete und zusätzliche doppelte Flächen entfernt und
geeignete Flächenrichtungen vereinheitlicht. Falls das keinen gültigen Körper
ergibt, versucht die bestehende begrenzte Netzreparatur, unter anderem kleine
Öffnungen mit drei oder vier Randkanten zu schließen. Dabei können auch bewusst
offene kleine Stellen geschlossen werden. Kleine Nebenbestandteile werden
nicht automatisch gelöscht. Verwendete Punktkoordinaten bleiben erhalten.

Nur ein Ergebnis, das die vorhandene Prüfung auf geschlossene Materialkörper
besteht, wird übernommen. Die vollständige Originalquelle bleibt gespeichert;
**Rückgängig** stellt den vorherigen Zustand wieder her. Ein gescheiterter Versuch
lässt das Teil unverändert. Der gleiche Geometriestand wird in derselben Sitzung
nicht laufend erneut bearbeitet, auch nach Rückgängig nicht. Neue Geometrie kann
erneut geprüft werden. Sehr große Netze und komplexe Schäden können verbleiben:
Bereinigung bis 500.000 Dreiecke, weitere Lückenreparatur bis 40.000 Dreiecke.

Gesperrte oder ausgeblendete Teile, Ansichtsvorlagen, CAD und Netze mit
Schutzbereichen werden übersprungen. Laufende Bearbeitungen und Dialoge haben
Vorrang; die automatische Reparatur wartet bis zum freien Arbeitsplatz.
Normal verwendet weiterhin die bestehenden manuellen Reparaturwerkzeuge.

## Normal

Die Werkzeugleiste ist in **Bearbeiten**, **Anordnen**, **CAD-Werkzeuge**,
**Netz-Werkzeuge**, **Umwandeln** und **Extras** gegliedert. Die Menüs verwenden
die vorhandenen Werkzeuge mit ihren aktuellen Freigaben und Sperren.
Je nach eigener Anordnung erscheinen weitere Werkzeuge in einer zusätzlichen
Kategorie oder unter „Weitere“ in der Dateileiste.

Die Leisten umbrechen bei schmaleren Fenstern in weitere Zeilen. Seitliches
Scrollen ist für diese Leisten im normalen Betrieb nicht erforderlich.
Menüs lassen sich mit Maus und Tastatur bedienen; Escape schließt das Menü.

## Eigene Anordnung

**Einstellungen → Layout → Oberfläche anordnen …** öffnet den bestehenden
Anordnungsmodus. Darin sind die einzelnen Originalschaltflächen zum Verschieben
vorübergehend sichtbar. Auch die Netzwerkzeuge, beide Objektumwandlungen, der
STL-Konverter, Bohren und die Arbeitsebenen-Werkzeuge sind jetzt registriert.

Unter **Alle Werkzeuge und Bereiche anpassen**:

1. Das Werkzeug in der vollständigen Liste wählen, auch wenn es gerade außerhalb
   des sichtbaren Bereichs liegt.
2. Dateileiste, Werkzeugleiste oder Ansichtswerkzeuge als Ziel wählen.
3. Mit „Früher“ und „Später“ die Reihenfolge ändern.
4. „Werkzeug anzeigen“ zum Ein-/Ausblenden verwenden. Einstellungen bleibt
   als Zugang zur Anpassung erhalten.
5. Formen oder Objekte nach oben setzen; ebenso Formeigenschaften oder
   Arbeitsflächeneinstellungen.
6. „Anordnung speichern“ verwenden, optional mit einem eigenen Layoutnamen.

Ziehen und Pfeiltasten bleiben verfügbar. Strg+Pfeil wechselt zyklisch zwischen
Dateileiste, Werkzeugleiste und Ansichtswerkzeugen. Die drei Bewegungswerkzeuge
bleiben gemeinsam in ihrer eigenen Zone. Seitenleisten, Ansichten und
Bewegungswerkzeuge können weiterhin über ihre Bereichsgriffe umgedockt werden;
Breiten und die Teilung der Seitenleisten lassen sich über die Trenner ändern.

Abbrechen/Escape stellt die vorherige Anordnung wieder her. Zurücksetzen stellt
die Standardanordnung einschließlich sichtbarer Werkzeuge wieder her. Alte
Layoutdateien und benannte Profile erhalten die neuen Felder und Werkzeuge bei
der Validierung, ohne bestehende Werkzeugpositionen zu verlieren.

Die Sichtbarkeit und relative Reihenfolge der einfachen Werkzeuge gilt auch
in Easy Tinker; dort bleiben die reduzierten Werkzeugbereiche und Formen rechts
vorgegeben. Für die vollständige frei anpassbare Oberfläche dient Normal.

Technisch bleiben Layoutformat 1, Projektformat 8 und die bisherigen
Arbeitsplatzversionen erhalten. Neue Layoutfelder sind `hiddenTools`,
`objectsFirst` und `workspaceFirst`. Der Modus verwendet einen eigenen
Programmdatenschlüssel `offlinecad-workbench-mode-v1`, Datei `bedienmodus.json`.

Der Arbeitsbereich nutzt `offlinecad-easy-domain-v1`, Datei
`easy-arbeitsbereich.json`; er ändert kein Projekt- oder Layoutformat.

## Ergänzungen aus der erweiterten Easy-Prüfung (0.41)

„Ausrichten“ arbeitet auch mit Netzteilen. Eine ausgewählte sichtbare Form kann
als feste Referenz angeklickt werden; sie bleibt beim Ausrichten unverändert.
Escape schließt auch das Spiegel-Menü. Die Netz-Gewindemutter wird korrekt
angelegt: Sicher zu Nullfläche zusammengefallene Dreiecke aus der Ausgabe des
Netzkerns entfallen vor der Körperprüfung. Es werden keine Punkte verschoben,
Flächenrichtungen geändert oder Öffnungen gefüllt. Benutzte Koordinaten und
alle Parameter bleiben erhalten, importierte Originalnetze durchlaufen diesen
Generatorpfad nicht. Verbleibende Schäden führen weiter zur Ablehnung.

Native CAD-Gewinde benötigten in den Prüfläufen auf dem Entwicklungsrechner
etwa 57–102 Sekunden, CAD-Muttern etwa 25–43 Sekunden. Dies ist eine aufwendige native Berechnung;
„Berechnung abbrechen“ oder Escape bricht sie ab. Die Netzvariante ist schneller.
