# Direkte Speicherung und Berechnungsaufträge

Gesamtplan, Punkte 6–10. Die neuen Wege ergänzen die bestehende lokale API;
Vorschau und Übernahme bleiben getrennt. Quellen, Gelenke, Arbeitsbereich und
Paketblöcke werden über den bestehenden Speicherweg erhalten.

| HTTP | MCP-Werkzeug | Aufgabe |
|---|---|---|
| `POST /v1/save` | `offlinecad_save` | Bestätigte Revision speichern |
| `GET /v1/status` oder `POST /v1/status` | `offlinecad_status` | Laufende Aufträge oder eine `jobId` lesen |
| `POST /v1/cancel` | `offlinecad_cancel` | Genau einen abbrechbaren Auftrag beenden |
| `POST /v1/preview/start` | `offlinecad_preview_start` | Asynchrone Vorschau starten |
| `POST /v1/preview/result` | `offlinecad_preview_result` | Vorschauergebnis oder aktuellen Zustand holen |

`save` verlangt `revision`. Ohne weiteren Dateinamen wird die geöffnete Datei
mit den bestehenden Konfliktprüfungen gespeichert. `filename` legt eine neue
`.ocad`- oder `.fnpack`-Datei im festgelegten Projektordner an; ein vorhandener
gleichnamiger Eintrag wird auch bei einem Schreibrennen nicht überschrieben.
Es gibt keinen frei wählbaren Pfad. Optional legt `format` das Projektformat
fest. Der Beleg enthält `saved`, die gespeicherte `revision`, aktuelle Revision,
Pfad, Format und Dateigröße. Eine Revisionssperre verhindert Modelländerungen
während des Schreibens; Änderungen der Ansicht gelten weiterhin nur dann als
gespeichert, wenn die tatsächlich gesicherte Arbeitsbereichssignatur passt.
Die Datei geht nicht durch die HTTP-/MCP-Antwort oder den Modellkontext.

`preview/start` nimmt dieselbe Anfrage wie `preview` entgegen und gibt sofort
eine `jobId` zurück. Die bisherige synchrone Vorschau bleibt verfügbar. Neue
Clients fragen den Zustand ab und holen bei `ready` das geprüfte Ergebnis.
Erst `apply` übernimmt es. `readyPreviews` ist getrennt von aktiven Berechnungen.
Verworfene, übernommene oder durch eine andere Revision veraltete Vorschauen
werden nicht als offene Ergebnisse ausgegeben.

Status und Abbruch laufen nicht durch die Warteschlange nativer Berechnungen.
Die Rückmeldung nennt Zustand, Ausgangsrevision, bekannte Phase,
Befehlsnummer, Operation und letzten Fortschritt. `estimatedRemainingMs:null`
bedeutet unbekannt; es wird keine Restdauer geschätzt.

Vorschau, Analyse und Export sind abbrechbar. `cancel` benötigt deren genaue
`jobId`. `cancelling` ist noch keine Bestätigung. Erst `cancelled` bestätigt
den Abschluss; bei ausbleibender Bestätigung heißt der Zustand
`cancel-unconfirmed`. Übernahme und Speicherung sind nicht als Berechnungen
abbrechbar. Späte Ergebnisse einer abgebrochenen Vorschau werden verworfen.

`intermediateDisplay` an einer Vorschau ist optional: `inherit` verwendet die
bestehende Einstellung, `final` unterdrückt die Zwischenanzeige nur für diesen
Auftrag. Die Einstellung wird nicht umgeschaltet. Schnelle Zwischenstände
werden zusammengefasst; noch laufende Anzeigen enden vor der endgültigen
Vorschau. Berechnungsfolge und geometrische Prüfungen bleiben gleich.

Die Werkzeugbibliothek löst ausschließlich den festgelegten übergeordneten
Datenordner auf seinen tatsächlichen Speicherort auf. Der Bibliotheksordner
selbst sowie einzelne Werkzeugdateien dürfen keine unerwarteten Links sein.
Die Statusauskunft der CAD-Laufzeit enthält zusätzlich die getrennte
`toolLibrary`-Bereitschaft; die Einstellungen zeigen beide Ergebnisse an.

Die beiden MCP-Adapter, CLI und das CPython-Paket verwenden dieselben kleinen
Anfragen. Im CPython-Client heißen die neuen Methoden `save`, `status`,
`cancel`, `preview_start` und `preview_result`. Im eingebauten isolierten
Analyse-Worker wird dadurch kein Dateizugriff freigegeben.

Prüfungen verwenden ausschließlich eigene Projekte, Profile und Datenordner.
Eine allgemeine Speicher-/Gewindestabilitätsabnahme sowie die Planpunkte
11–28 bleiben getrennt. Die installierte Ausgabe wird nicht automatisch ersetzt.
