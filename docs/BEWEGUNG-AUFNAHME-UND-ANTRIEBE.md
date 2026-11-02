# Änderungsberichte, Bewegungsaufnahme und Antriebskopplungen

Gesamtplan Punkte 21–25, privater Entwicklungsstand vom 02.11.2026. Anforderungen:
[Punkte 21–25](GESAMTPLAN-RELEASE-ABNAHME.md). Kein Installations- oder Releasewechsel.

Mit `responseDetail:"summary"` liefern lokale Vorschau-/Übernahmeaufrufe eine
Zusammenfassung: betroffene Wurzelkörper, geänderte numerische Maße und
Platzierungen, Gelenkwerte, Kopplungsänderungen, tatsächliche Prüfberichte,
Warnungen, Revision und nächste Aktionen. `responseDetail:"full"` fordert die
weiterhin verfügbaren ausführlichen Antworten an. Alte Aufrufe ohne diese
Angabe bleiben ausführlich; kompakte MCP-Adapter fordern die Zusammenfassung
ausdrücklich an. Die internen UI-Aufrufe
erhalten zur Kompatibilität ihre ausführlichen Ergebnisse. Keine Kurzfassung
darf fehlgeschlagene Prüfungen oder einen Fehler nach bestätigter Übernahme
in einen Erfolg umdeuten. Die neue Revision bezeichnet den bestätigten Stand;
eine Vorschau nennt ihren unveränderten Ausgangsstand und ihre Kennung.

Der Gelenkdialog ergänzt Schraubtrieb- und ebene Spindelantriebkopplungen,
mehrere wählbare Wiedergabegrößen, PNG-/GIF-Aufnahme und Bereichsprüfung.
Wiedergabe verwendet ausschließlich den kompilierten Gelenkbaum und die
vorhandene Anzeigegeometrie. Sie läuft ohne Modellübernahme, native
Konstruktion oder Messung pro Bild; auch gekoppelte Werte und Beschriftungen
stammen aus diesem Bewegungsstand. Ende, Abbruch und Aufnahmefehler stellen
die Ausgangsanzeige wieder her. GIFs sind auf 160 Bilder mit 480 × 360 Pixeln
in der Oberfläche beschränkt, mit fester RGB332-Farbpalette. Unvollständige
Aufnahmen tragen dies im Namen und im JSON-Beleg; dieser enthält auch die
Gelenkwerte je aufgenommenem Bild. PNG erfasst die aktuelle Vorschau.

`joint/drive-create` mit `drive.kind:"screw"` verbindet `rotary` und `linear`.
`lead` ist der Vorschub in mm/Umdrehung; alternativ `pitch` und `starts` für
Steigung und Gangzahl, `direction` ist +1 oder −1. Die aktuelle Stellung wird
als Nullbezug gespeichert. Bewegung ist von beiden Seiten möglich und mit
bestehenden Zahnradkopplungen kombinierbar. Alle abhängigen Grenzen und
Sperren gelten; widersprüchliche Antriebe werden atomar zurückgewiesen.

`drive.kind:"actuator"` nennt `table`, `swivel`, `extension` und den
Tischanschluss `attachment` in Welt-mm. Tisch- und Schwenkgelenk benötigen
denselben starren Elternkörper mit parallelen Drehachsen. Der Auszug hängt
direkt am Schwenkkörper. Sein Gelenkbezug muss am Tischanschluss liegen,
die Auszugsachse auf der Verbindungslinie. Die Kopplung erhält den Körperbaum
und berechnet Tischwinkel, Schwenkwinkel und Auszug gemeinsam. Rückwärts
wird die nächste Lösung zur bisherigen Stellung innerhalb der Tischgrenzen
gewählt; gleich nahe Lösungen und unerreichbare Anschlüsse werden gemeldet.
Ein Schwenkwinkel allein ist kein eindeutiger Antrieb. Je über Kopplungen
zusammenhängendem Antrieb wird zunächst eine nichtlineare Beziehung unterstützt.
Dies ist kein universeller räumlicher Gelenklöser.

Neue Antriebe verwenden Gelenkdaten Version 3 und Projekt-/Bibliotheksformat
31. Alte Projekte bleiben lesbar, Herabstufung mit neuen Beziehungen wird
abgewiesen. OCAD, FNPACK und vollständige interne Kopien erhalten die
Beziehungen; Teilkopien lösen nicht vollständig enthaltene Kopplungen.
`joint/drive-remove` nennt `driveId`. Die Befehlsauskunft liefert die tatsächlichen
Schemata; `app/joints` ergänzt die gespeicherten Antriebe. Python-SDK-Aufrufe
unterstützen optional `response_detail="summary"|"full"`.

`app/motionRange` ist ein eigener lesender Analyseauftrag. Optionen:
`jointId`, `from`, `to`, optional `step` (Standard 1° bzw. 1 mm), `pairs`
mit expliziten `leftId`/`rightId` und optional `timeLimitMs` (Standard 30 s,
höchstens 300 s). Höchstens 16 Paare und 501 Stellungen werden geprüft;
Start und Ende sind eingeschlossen, falls das Budget sie erreicht. Gekoppelte
Stellungen entstehen über denselben Bewegungslöser. Positive Volumenschnitte
nennen Paar, Antriebswert und Messmethode. Abbruch, Zeit-/Mengenbegrenzung
melden den ungeprüften Rest und etwaige teilweise geprüfte Paarmenge.
Die Prüfung gilt ausdrücklich nur für berechnete Stichproben; keine
kontinuierliche Kontakt-/Kollisions- oder Fertigungsfreigabe. Mindestabstand
und gespeicherte Prüfstände folgen in Punkten 26–27.

Die gesonderte FreeCAD-Nachabnahme aus Punkt 10 bleibt wegen der früheren
Defender-Quarantäne offen. Hier werden weder Schutz noch Laufzeitstarter geändert.

## Gezielter Nachweis

Die Standardsuite besteht mit 125 Tests. Der zusammenhängende gezielte Lauf
prüft die neuen Antriebe zusammen mit bestehenden Gelenken, Zahnradkopplungen,
nativen Messungen, FNPACK, Ergebnisprüfungen, Übernahmebelegen und kompaktem MCP.
Zusätzliche Regressionen decken X/Y/Z und Tisch einzeln und gemeinsam,
Grenzenauswahl inverser Lösungen, Aufnahmeabbruch während der Bilderfassung,
native Deadline und Material-/Unterquellenänderungen ab. Python-SDK prüft den
expliziten Antwortumfang über seinen tatsächlichen HTTP-Transport.

Eine isolierte aktuelle Desktopinstanz bestätigt sechs Prüfblöcke: beide
Kopplungen über sichtbare Bedienelemente, ein beschriftetes GIF mit 31 Bildern,
Stoppen und Schließen während der Wiedergabe, Zusammenfassung/Übernahme/Undo
und eine native Bereichsanalyse mit 25 Stellungen. Im Aufnahmeabschnitt wurde
kein nativer Berechnungs-/Messauftrag gesendet; Revision und Undo blieben gleich.
GIF und abgetastetes Desktopvideo wurden vollständig dekodiert und Bilder
visuell geprüft. Die neue Aufnahme zeigt eine tatsächlich geneigte Tischplatte;
keine zusätzliche Cloud-Inferenz. Normales Fensterende und Exit 0 bestätigt.

Im Review gefundene Probleme wurden korrigiert und regressionsgeprüft:
Analyse- und Unteraufträge besitzen denselben privaten Auftragseigentümer,
Kollisionsstellungen benötigen keine Controller-Vorschau, die inverse Auswahl
berücksichtigt alle gekoppelten Grenzen, Messmethode/Näherungsgrenzen bleiben
auch bei freien Bereichen erhalten und GIF-Beschriftungen priorisieren die
ausgewählten Antriebe. Erfolgreich erfasste Bilder zählen vor einer folgenden
Abbruchprüfung; ein echter Deadline-Abbruch erreicht laufende Messungen.
Beide Prüfachsen hatten nach gezielter Nachprüfung keine offenen konkreten Befunde.

Die Belege sind gezielte Quell-/Desktopnachweise und ersetzen Punkt 28 mit
vollständigem CNC-Ablauf, echten Providerzugängen und Gesamtabnahme nicht.
