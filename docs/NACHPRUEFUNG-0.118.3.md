# Nachprüfung und Korrekturen 0.118.3

Ein externer Bericht über 0.118.2 wurde gegen die Originalquellen und die
ausgelieferte ASAR geprüft. Bestätigte Fehler werden im Quellprojekt behoben;
vorherige Ausgaben und benutzte Datenordner bleiben erhalten. Diese Wartung
erhält gezielte Tests ihrer direkten Abhängigkeiten und eine neue Windows-Ausgabe.
Sie ist keine erneute allgemeine Gesamtabnahme aller Modellierfunktionen.

| Befund | Bewertung und Änderung |
| --- | --- |
| M1: gemischte Arrays | Backend, Referenzsammler, Referenzerkennung und Nachladen prüfen alle enthaltenen Objekte. Numerische Puffer werden ohne zusätzliche Wertkopien durchsucht. Synthetische Reproduktionen belegen die alte Prüflücke; Datenverlust eines heute gültigen Projekts wurde nicht nachgewiesen. Projektvalidierung, Prüfsummen, Quellerhalt und Dateiformat bleiben bestehen. |
| M2: Sprachpaket im RAM | Binärdateien werden mit einem 1-MiB-Lesepuffer gestreamt und vollständig SHA-256-geprüft. Erfolgreiche Prüfungen bleiben pro Sitzung gecacht; fehlgeschlagene Prüfungen werden wiederholt. Ein isolierter Messlauf gegen das unveränderte 574-MB-Modell sank von etwa 614 auf 73 MB Prozess-RSS. Dies sind Einzelmessungen außerhalb des Electron-Hauptprozesses, keine garantierten Obergrenzen. |
| N1: Token-Endzeichen | Die Tokenmaskierung entfernt auch abschließende Bindestriche, Unterstriche und Gleichheitszeichen. Regressionen verwenden ausschließlich synthetische Zeichenfolgen. |
| N2: Navigation | Renderer-Navigation und Weiterleitungen sind auf das exakte lokale Anwendungsdokument samt ursprünglicher Abfrage beschränkt. Fragmentwechsel und erneutes Laden bleiben möglich. Neue Fenster bleiben gesperrt. Lokale Skript-Sandboxen behalten ihre eigene CSP. |
| N3: IPC | Dateien, Projekte, Layouts, Zeichnungs-PDF, Werkzeugbibliothek, Datenspeicherung, Fehlerprotokoll, Konverter und KI-Rückantworten prüfen zusätzlich den Hauptframe des zugehörigen Fensters. Die bereits abgesicherten KI-/Sprachhandler bleiben bestehen. |
| N4: Save-Fehler | Ein fremder Absender erhält eine strukturierte Ablehnung vor Dateiauswahl oder Schreiben. |
| N5: leere KI-Anfrage | Ungültige Anfragetypen werden mit `INVALID_AI_REQUEST` vor Konfigurationszugriff oder Provideraufruf abgewiesen. |
| N6: Migration | Die spezielle Meldung für zu große frühere KI-Einstellungen bleibt erhalten. Eingabevalidierungen wurden bereits vorher außerhalb des allgemeinen Schreibfehlers geprüft; die ursprüngliche Behauptung war zu pauschal. Schreibfehler behalten eine interne Ursache, ohne Schlüssel oder rohe Konfigurationsdaten anzuzeigen. |
| N7: Login-Lock | Ein zwischen exklusivem Öffnen und Nachlesen verschwundener Lock wird erneut exklusiv angelegt. Die Wiederholung ist begrenzt. Aktive Sitzungen werden weiterhin abgewiesen. |
| N8: Fehlerflut | Höchstens 20 gewöhnliche Protokolleinträge je Sekunde; unterdrückte Einträge werden gezählt. Hauptprozessfehler und Renderer-Abstürze bleiben aufzeichenbar. Duplikatfilter und Rotation bleiben bestehen. |
| N9: STL-Name | Leere Basisnamen, Pfadanteile und Steuerzeichen werden bereits vor dem Konverterstart abgewiesen. Vorher entstand daraus kein nachgewiesener Zugriff auf fremde Pfade. |
| N10: Cache | Die einmalige erfolgreiche Sprachpaketprüfung ist eine bewusste Sitzungsoptimierung. Sie garantiert keine Unveränderbarkeit gegen einen lokalen Angreifer mit Schreibzugriff auf die Programmdateien. Der Bericht weist keinen darüber hinausgehenden Angriff nach; keine wiederholte vollständige Hashprüfung bei jedem Diktat ergänzt. |

Electron wird ausschließlich im Hauptprogramm innerhalb der bestehenden Reihe
von 44.9.3 auf 44.10.0 aktualisiert. Die separat veröffentlichten Minis werden
dadurch nicht geändert. Offizielle Quellen:
[Releasehinweise](https://releases.electronjs.org/release/v44.10.0),
[Navigation und IPC-Sicherheit](https://www.electronjs.org/docs/latest/tutorial/security).

## Auslieferung und Grenzen

Die neue Ausgabe wird aus einer frischen Stage gebaut. Bereits benutzte
`Daten/`- und `Projekte/`-Ordner sind Arbeitsdaten und werden weder kopiert noch
gelöscht. Der Anleitungskopf nennt die aktuelle Version und erklärt den
Unterschied zwischen frischer Ausgabe und benutztem portablem Ordner.
Die mitgelieferte Abnahme enthält relative Programmpfade und Prüfsummen;
detaillierte lokale Belege bleiben im lokalen Arbeitsverzeichnis. Freigabe und
Abnahme sind getrennte Dokumente mit einem Prüfsummenverweis.

Die Prüfmodi sind ausdrücklich aufrufbare interne Abnahmewerkzeuge mit
isolierten Profilen. Ihre Existenz ist kein bestätigter Angriff. Eine vollständige
Verlagerung aller historischen Prüfrouten wäre ein gesonderter Umbau und gehört
nicht zu diesen Fehlerkorrekturen. Namen wie `offlinecad`, `OfflineCAD` und
bisherige Handbuchnamen bleiben aus Kompatibilitätsgründen erhalten. Doppelte
Lizenztexte und historische Leistungsskripte sind keine Funktionsfehler.

Die frühere Gesamtabnahme 0.117.0-r7 umfasst 2153 Tests und 3312 Windows-Prüfgruppen.
Die 0.118.2-Abnahme umfasst gezielt 81 Tests und 46 Windows-Prüfgruppen; die frühere
Basis ersetzt keine Vollprüfung späterer Änderungen. Die vollständige Integrität
der mitgelieferten CAD-Laufzeit wird beim neuen Paketbau erneut geprüft.
Der genaue Umfang der neuen Ausgabe steht in ihrer `Abnahme.json`.

Es werden keine Cloud-Modellaufrufe für diese Prüfung benötigt. Sprachtests
verwenden eine lokale synthetische Aufnahme. Modelle, Quellen, Undo, Formate und
persönliche Zugangsdaten werden durch diese Wartung nicht migriert.
