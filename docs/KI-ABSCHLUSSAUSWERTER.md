# Abschlussauswerter und externes Datenpaket

Private Funktionsausgabe Formnaro 0.134.0-r2 vom 07.11.2026. Keine Veröffentlichung oder Änderung einer bestehenden Installation.

## Bedienung

Das KI-Testlabor hat den zusätzlichen Reiter **Abschlussauswertung**. Der dritte Agent verwendet eine eigene DeepSeek-Flash/high-Sitzung. Die standardmäßig eingeschaltete Option „Nach allen Prüfungen des Plans automatisch auswerten“ startet genau eine Auswertung nach dem letzten abgeschlossenen Versuch. Bei einer mehrphasigen internen Kampagne erfolgt sie erst nach allen Phasen. Fehlgeschlagene Modellieraufgaben bleiben reguläre Untersuchungsgegenstände; fehlende, unterbrochene oder abgebrochene Versuche verhindern einen vorgezogenen Abschlussbericht.

Der Agent erstellt eine Zusammenfassung, mit Versuch-IDs belegte Beobachtungen, ausdrücklich gekennzeichnete Vermutungen, konkrete Änderungsvorschläge und gezielte Nachtests. Er verändert keine Modelle, Quellen oder Prüfergebnisse. Der Nutzer hat für diese erste Ausbaustufe ausdrücklich Auswertung und Vorschläge gewählt. Änderungen selbst ausführen ist kein Bestandteil dieses Auftrags.

Fertige Ergebnisse lassen sich auch manuell auswerten. Der in den Ergebnissen gewählte Serienfilter gilt ebenfalls für Auswertung und Export; der Umfang wird im Reiter angezeigt. Ohne Serienfilter ist ein erkannter mehrphasiger Ergänzungslauf einschließlich noch wartender Phasen maßgeblich.

## Externer Agent

„Datenpaket für externen Agenten“ speichert eine ZIP-Datei mit Ergebnisübersicht einschließlich ausstehender Versuche und Quellenständen, ausgewählten Originalprotokollen als bereinigten Kopien, tatsächlich gesendeten Aufgaben, Anbieterantworten und ausgegebenem Anbieter-Denktext, zugehörigen Modellbildern und vorhandenen isolierten Testmodellen sowie Serienplänen, einem kurzen externen Untersuchungsauftrag und SHA256-Nachweisen für die Archivdateien.

Ein Zwischenstand kann exportiert werden und bleibt entsprechend gekennzeichnet. Profile, Zugangsdaten, Verbindungsdateien und andere Verzeichnisinhalte werden nicht eingesammelt. Bekannte Geheimnisse, typische Schlüsselfelder und lokale absolute Pfade werden aus den ausgewählten Daten entfernt. Aufzeichnungen auf dem Datenträger bleiben unverändert.

## Technische Grenzen

Der interne Auswerter erhält alle ausgewählten Laufresultate sowie kompakte Detailbelege: ursprüngliche Aufgaben, Pläne, tatsächliche Zwischenzustände, globale Eigenschaftenänderungen, native Endprüfungen, Überwacherabweichungen und lange Ereignislücken. Detaillierte Abläufe sind begrenzt; ausgelassene Detail-IDs werden ausdrücklich aufgeführt. Das externe Paket enthält zusätzlich die vollständigen bereinigten Ereignisprotokolle und Bilder.

Ein fehlendes natives Ergebnis bleibt ungeprüft. Ein Shadow-stop ist eine Empfehlung ohne Eingriff. continue ersetzt keine native Endabnahme. Unterschiedliche Paketstände, korrigierte Aufgaben und geänderte Prüfer bleiben getrennt. Der Auswerter erhält keine Werkzeuge; sein JSON wird auf Schema, Länge und vorhandene Versuch-IDs geprüft. Seine Schlussfolgerungen und Änderungsvorschläge sind weiterhin KI-Aussagen und keine automatisch validierten Ursachen.

Eine Analyse hat ein eigenes gemeinsames 180-s-Limit, höchstens zwei Anfragen mit jeweils 8192 Ausgabetokens und höchstens eine Formatkorrektur. Verbrauch und unvollständige Meldungen erscheinen unter der separaten Rolle Abschlussauswerter und in der Gesamtsumme. Ein fehlgeschlagener Analyseaufruf überschreibt keine bestandenen Tests. Fertige Analysen werden als `Auswertung-<ID>.json` und Markdown gespeichert und nach Neustart angezeigt; ein Neustart sendet sie nicht erneut.

Mehrphasige externe Prüftreiber müssen jeden Teilplan mit `start(..., deferReview:true)` starten. Erst wenn ihr gesamter Fortschritt als completed gespeichert wurde, darf `labReview` ohne Serienfilter aufgerufen werden. Der bestehende eingefrorene Ergänzungslauf wurde nicht umgebaut oder erneut gestartet.

## Abnahme und aktueller Datenstand

128 Standardtests und 50 gezielte Labor-/Überwacher-/Auswertertests bestanden. Die neuen neun Auswertertests prüfen unter anderem frühe Abschlussverweigerung, Ergebniserhalt, falsche Referenzen, Abbruch, separate Kosten, Export-Rundlauf mit Geheimnisbereinigung und automatische Auswertung erst nach beiden Testabschlüssen. Die Kontrolle verwendet lokale Providerfixtures, keine Cloud-Anfragen.

Gepackter Renderer 0.134.0-r2: neuer Reiter, gespeicherte Automatikoption, IPC-Auswertung mit lokalen Providerantworten, sichtbare Belege, separate Verbrauchsanzeige, echter ZIP-Export und erneutes Öffnen bestanden. Fenster regulär geschlossen, Hostprozess Exit0. Die echte Windows-EXE bestand zusätzlich Vorschau/Schutz, native Bohrung, unabhängige Endprüfung, Screenshot und regulären Kindprozess-Exit0. 277 Backend-/KI-/Eingangsdateien im ASAR sowie 750 Renderer-Eingangsdateien gegen den gebauten Stand bytegleich; fflate für den Backend-Export mitgeliefert und geprüft.

Vorprobe r1 fand eine fehlende Backend-ZIP-Abhängigkeit im Paket; r1 ist nicht abgenommen. Zwei anfängliche UI-Prüftreiberstarts waren falsch isoliert und erreichten die Prüfansicht nicht; diese Belege bleiben erhalten. Die abschließende r2-Prüfung verwendet ein eigenes Daten-/Profilverzeichnis. Bestehende Nutzerprofile und Modelle wurden nicht benutzt oder verändert.

Neuester realer Ergänzungslauf bleibt unverändert bei 43/69, blocked: 34 native Erfolge, 32 vollständige Abnahmen, acht Bedien-/Formatfehler und ein Timeout; 26 Versuche einschließlich drei alter Fehlerfälle fehlen. Es wurde deshalb noch keine echte Cloud-Abschlussanalyse dieses unvollständigen Laufs gestartet und kein wartender Modelliertest ausgeführt.

Externes Paket des Zwischenstands: `F:/Formnaro-Testausgaben/KI-Labor-Ergebnisse-2026-11-07/Formnaro-KI-Labor-Ergebnisse-2026-11-07.zip`, 13.021.557 Bytes, 158 Dateien einschließlich 43 Protokollen, 34 Modellen und 77 Bildern. SHA256 `f93069a4cc7cea0e1ee36a2df9b4dc2d8294b236718900aee767847e9695d0b9`. Alle 157 im Manifest gelisteten Dateien zurückgelesen und gehasht; die 43 Eingangsprotokolle sind bytegleich erhalten.

Private EXE: `F:/Formnaro/Programm-v0.134.0-r2/Formnaro-win32-x64/Formnaro.exe`. ASAR-SHA256 `b90c2af28908822a879d76d9b6a2056f4c49f499aec3fb099b9057463ac4422c`.


## Ergänzung0.135.1-r1

Die Profil-/Modell-/Denkstufenwahl gilt jetzt getrennt für alle drei Rollen. Unterbrochene Rohversuche bleiben unverändert erhalten. Eine Gesamtanalyse darf sie erst dann als erledigte Unterbrechung einbeziehen, wenn der gespeicherte Gesamtplan ausdrücklich einen tatsächlich abgeschlossenen Ersatzversuch derselben Bedingung nennt. IDs und Bedingungsfelder werden gegen die Originalprotokolle geprüft. Das zählt die Unterbrechung nicht als nativen Erfolg und erlaubt keine frühe Analyse einer weiter pausierten Kampagne. Ein fehlgeschlagen beendeter Versuch wird dadurch nicht in einen Erfolg umgeschrieben.
