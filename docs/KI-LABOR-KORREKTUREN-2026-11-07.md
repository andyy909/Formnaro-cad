# KI-Labor: Korrekturen, Rollenwahl und Benchmark

Stand: 07.11.2026. Private Ausgabe **0.135.0-r2**. Keine Installation ersetzt und nichts veröffentlicht. Die echten KI-Versuche bleiben auf ausdrückliche Nutzersteuerung pausiert.

## Ergebnis und Pause

Die gefundenen Integrationsprobleme wurden korrigiert, die betroffenen Bedienwege lokal geprüft und die unabhängige Modell-/Profil-/Denkstufenwahl aller drei Laborrollen aus dem abgestimmten Nebenstand integriert. Zusätzlich ist der Grundbenchmark mit acht Aufgaben und zwei Wiederholungen eingebaut.

Noch NICHT ausgeführt: elf betroffene KI-Kombinationen erneut,26fehlende Versuche, eine echte Abschlussanalyse darüber sowie echte Benchmark-Modellanfragen. Der separate Fortsetzungsplan enthält37neue KI-Versuche.56bereits angenommene Bedingungen bleiben erhalten; kein Überschneiden mit den neuen37. Das ergibt93verschiedene Bedingungen:90Funktionsbedingungen und drei alte Fehlerfälle. Frühere Fehlversuche bleiben zusätzlich in den Rohdaten erhalten. Der neue Benchmark umfasst separat16Versuche und gehört nicht zu den37.

Originalkampagne unverändert:43/69beendet,34native PASS,32vollständig angenommen,8Ausführungsfehler und1Timeout. Die neun Ausführungsfehler besitzen keinen negativen nativen Endbefund, sondern keinen abgeschlossenen nativen Endbefund. Alle43Originalprotokolle sowie Fortschritt.json wurden erneut per SHA256 geprüft und sind unverändert. Die ursprüngliche Kampagne steht weiterhin auf blocked.

## Korrigierte Ursachen

| Befund | Änderung und lokale Prüfung |
|---|---|
| Harmlose select.text-Beschriftungen verursachten Formatkorrekturen | Kurze Beschriftungen für die betreffenden Übungsschritte konsistent zugelassen; unbekannte Felder/ungültige Typen bleiben abgewiesen. |
| Fase16/high änderte die gesamte Breite40→1 statt Fasenbetrag; Aushöhlen17/high verschob den ganzen Körper | Werkzeugauskunft unterscheidet Körperfelder von Werkzeugfeldern. Ein Quellwechsel, der einen aktiven Kanten-/Flächeneditor ungültig macht, wird vor jeder Wiedergabe mit konkreter Rückmeldung abgefangen. Legitime Körperänderung vor Öffnen bzw. mit erneutem Öffnen bleibt möglich. Native Gegenproben zeigen unveränderte Ausgangsmodelle bei abgewiesenen Plänen. |
| Messung22 scheiterte an verdeckten Flächen | Referenz empfiehlt Ziel isolieren und jede Messfläche mit passender Seitenansicht ansteuern; anschließend Gesamtansicht herstellen. Tatsächliche native Messung40mm und unveränderte Geometrie lokal belegt. |
| Zeichnung21/high/max verwendete nach Auswahl ein geschlossenes Menü | Werkzeugweg öffnet das CAD-Menü nach der Zielauswahl neu; lokale A4-/Titel-/Projektionsprüfung bestanden. |
| Isolationsüberwacher hielt ein vorhandenes Schutzteil für neu | Vollständiges Anfangsinventar einschließlich Schutzteilen zusätzlich zur Auswahl. Tatsächlich dargestellte Körper/visible separat von persistentem hidden. Lokale Isolation zeigt genau das Ziel und stellt danach alle ursprünglichen Körper dar. |
| continue wurde als erfolgreicher Abschluss missverstanden | Fortsetzungsempfehlung, native Pflichtbefunde und Abschlussabnahme getrennt. Fehlgeschlagen/ungeprüft bleibt auch bei continue nicht erfolgreich. Anzeige und Reviewer-Datengrundlage berücksichtigen diese Trennung. |
| Abschlussanfrage erhielt nur neun Sekunden Restbudget | Bei aktivem Überwacher bis110sReserve innerhalb desselben360sGesamtbudgets; Ausführung und Endkontrolle besitzen getrennte Signale. Ohne Überwacher keine Reserveabziehung. Schwerpunkt-/Fokus-/Pausen- und Ein-/Ausgabeaktivität wird gespeichert. |
| Gelenk30/high antwortete dreimal mit fehlender äußerer schließender Klammer | Begrenzte, zeichenfolgensichere Rückmeldung über fehlende JSON-Abschlüsse. Keine stille Reparatur und keine Ausführung unvollständiger Antworten. |
| Einzelne ältere Aufgabenbeschreibungen enthielten ungültige UTF8-Bytes | Nur ungültige Legacybytes normalisiert; vorhandene gültige UTF8-Texte erhalten. Fixtures, Geometrieparameter und native Prüfer unverändert. |

Die genaue historische Ursache der langen Wartephasen ist weiterhin nicht bewiesen. Die Rohlogs zeigen lange Lücken nach bereits fertigen Überwacherurteilen. Die neue Aktivitätserfassung macht künftige Fokus-/Pausenwartephasen prüfbar; sie beweist die damalige Ursache nicht. Die Überwacher hatten die Fasen-/Aushöhldrift im alten Lauf tatsächlich erkannt; Shadow griff ausdrücklich nicht ein.

## Drei getrennte Rollen

Modellierer, Überwacher und Abschlussauswerter wählen jeweils vorhandenes Profil, Modell und unterstützte Denkstufe. Die normale Chat-Auswahl wird nicht verändert. Backend prüft Katalog/Denkstufen vor der ersten Modellierantwort; Rolle, angefragtes und zurückgegebenes Modell sowie Verbrauch werden getrennt gespeichert. Feste Modellier-Denkstufe erzeugt genau eine Bedingung, die Planmatrix bleibt als ausdrückliche Option erhalten. Frische Sitzungen, private Zugangsdaten und Redigierung aller Rollen sind zusammengeführt mit Inventar-, Zeitreserve-, Aktivitäts- und Abschlusskorrekturen.

Der dritte Agent bleibt Vorschlagsgeber. Er ändert keine Modelle/Quellen oder Bewertungen. Automatik erst nach dem ganzen angeforderten Umfang; externe mehrphasige Fortsetzung nutzt weiter deferReview und einen einzigen Abschlussauftrag nach allen Phasen. Interne Ergebnisdaten zeigen begrenzte Detailauszüge und deren Auslassungen; externer Export enthält vollständige bereinigte ausgewählte Rohprotokolle und vorhandene Modelle/Bilder.

## Benchmark

Siehe KI-BENCHMARK.md. Eigener Reiter und Startknopf, versionierte Suite1.0.0, acht bekannte Entwicklungsaufgaben, zwei unabhängige Durchläufe, genau eine unterstützte Denkstufe. KontextC, sichtbare Übung, Auswahl, kein Startbild. Standard ohne KI-Schrittüberwacher; Shadow getrennt auswählbar. Keine Ausführung beim Öffnen.

Unabhängige native Pflichtbefunde, unveränderte Vorgaben, regulärer Abschluss und bestätigte Modellkennung bestimmen Erfolg. Einzelwerte0/2bis2/2, Korrekturaufwand, Laufzeiten mit Fallzahl, Rollenverbrauch, fehlende Usage, Infrastruktur und ungeprüfte Ergebnisse bleiben getrennt. Abgebrochene Rohversuche bleiben erhalten. Fortsetzen holt nur ausstehende Bedingungen im gleichen eingefrorenen Programm-/Suite-/Rollenstand nach; fertig beendete Fehlerfälle werden nicht automatisch wiederholt. Abschlussauswerter erst nach allen16Bedingungen. Eigene JSON-/Markdown-Berichte und vollständiges externes Datenpaket.

Der optionale Halter-Grenztest bleibt sichtbar gesperrt, bis seine drei Aufgabenstufen und nativen Prüfer definiert und kalibriert sind. Es gibt keine neue empirische Modellrangfolge, Zuverlässigkeitsquote oder behauptete Leistungsgrenze.

## Lokale Abnahme

- 128Standardtests und106gezielte Tests bestanden. Enthalten sind Rollen-/Schlüsseltrennung, Ausgabeformate, native Ergebnis-/Abschlusssemantik, Inventar, Signale/Zeitreserve, sichere Übungsfelder, Benchmarkumfang, Modellabweichungen, Erhalt alter Bedingungen, Fortsetzung und Abschlusszeitpunkt.
- Fünf tatsächliche Korrektur-Bedienproben16,17,22,24,25 mit unabhängiger nativer Prüfung und regulärem Exit0. Falsche Körperfeldpläne werden vor jeder Eingabe verworfen. Quelle: work/completion-native-1794074002657/result.json.
- Benchmark-Kalibrierung: alle acht unveränderten Gegenmodelle nativ abgewiesen. Fünf zusätzliche positive sichtbare Referenzen03,Baugruppe,14,11,21 bestanden; die drei bereits belegten positiven Wege16,17,22 unverändert weiterverwendet. Acht Testprozesse regulär beendet, Exit0. Quelle: work/benchmark-native-1794075734026/result.json. Dies sind feste lokale Referenzen, keine neuen KI-Leistungsversuche.
- Tatsächlicher ASAR-Renderer/IPC: neun Rollenfelder, drei unabhängige Zugänge, Denkstufe, Wiederöffnen, vollständig lokaler Drei-Rollen-Ablauf, Benchmarköffnung ohne Start, genau16synthetische Modellierantworten ohne Überwacher, Abschlussanalyse danach, keine falsche Erfolgsgutschrift, acht Aufgabenzeilen, JSON und ZIP. Screenshots visuell geprüft; Fenster regulär geschlossen und Prozess beendet. Quelle: work/combined-lab-ui-1794076058509/result.json. Ausschließlich lokale Anbieterfixture,0echte Cloudanfragen.
- Endgültige EXE0.135.0-r2: native Bohrung, Schutzteil, unabhängige Bohrungsprüfung, Bild und regulärer Kindprozessabschluss Exit0 bestanden. Quelle: work/package-native-final/result.json.
- 283Backend-/KI-/Eingangsdateien exakt im ASAR;785Renderer-/Werkzeug-/Asset-Eingaben exakt gegen die eingefrorene Buildquelle. Paketmetadaten entsprechen dem Quellpaket plus ausdrücklich gesetztem diagnosticEdition:false. Seit nativer Benchmarkkalibrierung r1 ist im Renderer nur der Buildhinweis geändert; Fixtures und native Prüfer bytegleich. Die normalisierten Aufgabenbeschreibungen sind ausdrücklich separat ausgewiesen. Quellabgleich.json neben dem Paket.

Ein erster Kalibrierstarter scheiterte vor Testbeginn an seiner nicht vorhandenen historischen Referenz. Die Fixture wurde auf einen festen sichtbaren Bohrweg umgestellt; der erste Fehlversuch wurde als Starterfehler erhalten. Ein erster Quellabgleich verwendete für verschachtelte ASAR-Pfade falsche Windows-Trennzeichen; der Abgleich wurde korrigiert und vollständig wiederholt. Das waren lokale Prüfhelferfehler, keine negativen CAD-Ergebnisse.

Die finale private Ausgabe liegt unter F:/Formnaro/Programm-v0.135.0-r2. ASAR SHA256:8bbcfca63cc8deca941c98a29efd9c7fb785e89418edab28aaec0b38e202a717. EXE SHA256:89e095871b7f34bad115f51996ca314810e064403ce383f7c0093d085cbdf75c. Frühere Ausgaben/Installationen unverändert. Fortsetzungsplan und Pausennachweis liegen daneben. Erfolgreiche ursprüngliche KI-Fälle wurden nicht erneut ausgeführt.
