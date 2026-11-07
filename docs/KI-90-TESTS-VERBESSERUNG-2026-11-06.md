# Formnaro: Ursachen der 90 Übungstests und gezielte Nachprüfung

Die private Ausgabe **0.132.2 r9** enthält die Korrekturen. 25 gezielt ausgewählte Fall-/Denkstufen-Kombinationen bestehen im jeweils letzten Lauf einschließlich nativer Endprüfung, gültigem Überwacher-Endurteil und bestätigtem regulärem Prozessabschluss. Dafür wurden 36 KI-Versuche in fünf getrennt erhaltenen Kohorten auf vier eingefrorenen Prüfständen beendet. Dies ist eine Entwicklungsnachprüfung, keine neue vollständige 90er-Kohorte und kein unabhängiger Holdout.

## Warum so viele Fälle scheiterten

1. **Fehlende und mehrdeutige Eingangsdaten.** Die Aufgabenübernahme ließ die Ausgangszustandsspalte weg. Maße und Mittelpunkte aus dem Eingangsfixture werden nun mitgegeben. Beim L-Körper werden fertiges Teil und Quellquader eindeutig getrennt. Die unveränderten Geometriefixtures bleiben Grundlage der unabhängigen Prüfung. Die Aufgaben11/20 benennen die geforderte Kreismitte beziehungsweise den Mittelpunkt-Erhalt jetzt ausdrücklich; diese Bedingungen standen zuvor teilweise nur im Prüfkriterium.
2. **Falsche oder unvollständige Werkzeugauskünfte.** Die Suche über den ganzen Auftrag lieferte unpassende Treffer. Deklarierte Werkzeugkennungen und höchstens acht dokumentierte Voraussetzungen bestimmen nun den Einstieg. Tatsächlicher Duplizier-/Einfügeversatz (+10,+10,0), Auswahl der Papiergröße und Menü-Schließen sind beschrieben. Eigenschaften ist korrekt als Eingabebereich mit Feldkennungen ausgewiesen, ohne erfundenen Werkzeugknopf. Erhaltene Skizzen ohne Variablen bekommen keine erfundenen Maßnamen.
3. **Lücken bei der sichtbaren Bedienung.** Transformationsbuttons mit data-mode, Ansichtsbezeichnungen, Gelenkaliase und der sichtbare Abschluss der Isolation werden richtig aufgelöst. Der Kreismusterdialog bietet jetzt die bereits nativ unterstützten Felder für Kreismitte und Startwinkel. Leere Mittelfelder behalten die bisherige Auswahlmitte.
4. **Fehler im Prüfer.** Fehlende Sichtbarkeits-/Sperrflags sind wie false zu vergleichen; JSON-Schlüsselreihenfolge ist bedeutungslos. Sechs archivierte Fälle23/24 bestehen nach separater Neuauswertung. Originalprotokolle wurden nicht verändert. Geometrieänderungen und eine nicht beendete Isolation bleiben Fehler. Bei workplane-top wird die tatsächliche horizontale Oberseitenebene geprüft, ohne nicht vorhandene Flächenanbindung zu verlangen.
5. **Zu spät erkannte Prüfungsformate.** Frei formulierte checks konnten früher erst nach ausgeführten Gelenkschritten scheitern. Host, Renderer und veröffentlichter Praxisvertrag verwenden jetzt das native Schema strukturierter Messprüfungen. Formatfehler gehen vor dem ersten Schritt an die begrenzte Plankorrektur zurück. Gültige Messprüfungen bleiben ausgeführt; eine native Paketkontrolle belegt genau eine tatsächliche Gelenkaktion nach zwei lokalen Planantworten.

## Überwacher

Statt eines gemeinsamen 30-Sekunden-Fensters gelten 45 Sekunden je Anfrage und höchstens zwei Anfragen insgesamt. Ein Timeout, Formatfehler oder erschöpftes Ausgabelimit kann genau einen begrenzten Nachversuch auslösen. Abbruch bleibt Abbruch; ohne gültige Antwort entsteht kein Urteil. Die privaten Schrittbestätigungen decken mit95/100Sekunden beide zulässigen Anfragen ab. Der Gesamtversuch bleibt auf360Sekunden begrenzt.

Die aktuelle tatsächliche Beobachtung bleibt vollständig; vergangene Schritte werden kompakt mit Revision, Aktion und Fehlern mitgeführt. Fehler werden nicht durch Erfolgstexte ersetzt. In diesen 36 KI-Versuchen: **246 gültige Urteile, 0 Überwacherfehler, 0 fehlende Endurteile**. 3 Antworten benötigten einen begrenzten Ausgabelimit-Nachversuch. Kein nativ fehlgeschlagenes oder ungeprüftes Modellergebnis erhielt eine positive Endfreigabe in dieser Stichprobe; das ist keine allgemeine Fehlererkennungsrate.

Eine absichtlich45Sekunden blockierte erste Überwacheranfrage wurde mit der echten privaten UI-/IPC-Kette geprüft: einmaliger Retry, korrekter nativer Verschiebungsbefund und regulärer Exit0;56.590ms Gesamtzeit, synthetischer Transport ohne Cloudanfragen. Der entsprechende Code ist bytegleich in r9. Ein echter Budget-Nachversuch benötigte30.987ms für das gültige Urteil und überschritt damit das alte gemeinsame30s-Fenster.

## Gezielte KI-Kohorten

| Stand | Beendete Versuche | Native Geometrie PASS |
|---|---:|---:|
| r4 | 24 | 17 |
| r6 | 8 | 6 |
| r8 | 2 | 2 |
| r8 · Abschlussnachprobe | 1 | 0 |
| r9 | 1 | 1 |

Die passenden24 alten Vergleichsfälle waren ursprünglich3/24 nativ bestanden; r4 erreichte17/24. Neben Anbietervariation haben sich Eingaben, Werkzeugauskünfte und fehlerhafte Prüfkriterien verändert. Die Zahlen sind daher kein isolierter Beleg für einen allgemeinen Modellleistungsgewinn.

Ein früherer Breitenlauf hatte ein korrektes Modell, aber keinen bestätigten sauberen Exit. Er wurde nicht als vollständig abgenommen gewertet. Die zusätzliche Abschlussnachprobe zeigte den irreführenden Eigenschaften-Eintrag; nach dessen Korrektur besteht der Fall in r9 einschließlich regulärem Exit0. Auch dieser Fehlversuch bleibt erhalten.

| Fall | Denkstufe | Letzte native Prüfung | Endurteil | Abschluss |
|---|---|---|---|---|
| practice-01 | low | PASS | continue | Exit0 |
| practice-02 | low | PASS | continue | Exit0 |
| practice-03 | low | PASS | continue | Exit0 |
| practice-04 | low | PASS | continue | Exit0 |
| practice-05 | low | PASS | continue | Exit0 |
| practice-06 | low | PASS | continue | Exit0 |
| practice-10 | high | PASS | continue | Exit0 |
| practice-10 | low | PASS | continue | Exit0 |
| practice-11 | low | PASS | continue | Exit0 |
| practice-12 | high | PASS | continue | Exit0 |
| practice-13 | high | PASS | continue | Exit0 |
| practice-13 | low | PASS | continue | Exit0 |
| practice-17 | low | PASS | continue | Exit0 |
| practice-20 | low | PASS | continue | Exit0 |
| practice-21 | low | PASS | continue | Exit0 |
| practice-23 | low | PASS | continue | Exit0 |
| practice-24 | low | PASS | continue | Exit0 |
| practice-25 | low | PASS | continue | Exit0 |
| practice-26 | high | PASS | continue | Exit0 |
| practice-26 | low | PASS | continue | Exit0 |
| practice-27 | low | PASS | continue | Exit0 |
| practice-28 | low | PASS | continue | Exit0 |
| practice-29 | low | PASS | continue | Exit0 |
| practice-30 | low | PASS | continue | Exit0 |
| sketch | low | PASS | continue | Exit0 |

## Paketnachweis und verbleibende Grenzen

- 128 Standardtests und70 gezielte Prüfungen bestanden; ergänzend26 fokussierte Referenz-/Kontrolltests nach der letzten Auskunftskorrektur, mit Überschneidungen.
- Sieben tatsächliche UI-/Native-Bedienproben mit festen Plänen sowie die native Prüfkorrektur und die45s-Timeoutkette mit synthetischem Anbietertransport sind getrennte lokale Kontrollen. Sie werden nicht als echte KI-Erfolge mitgezählt.
- Normale gepackte Renderer-Ressourcen: regulärer Start ohne automatisches Labor, Einstellungenzugang, Öffnen/Schließen/erneutes Öffnen,30Funktionsfälle/90Versuche und getrennte Schritt-/Endbefundanzeige geprüft; regulärer Exit0. Native Ausführungstests verwenden die gelieferte EXE.
- 273 Backend-/KI-Dateien und sieben Renderer-Eingangsdateien bytegleich bestätigt. EXE/ASAR erneut perSHA256 geprüft. Belege liegen im Paketordner unter Pruefbelege.
- Der Übungsmodus hat weiterhin keine semantische Auswahl einer bestimmten Modellkante für15/16 und keine passende Zweipunkt-Messaktion für22. Das sind konkrete Übungsbedienlücken; daraus folgt kein allgemeines CAD-Kernelversagen. Diese Fälle wurden nicht über versteckte Geometriebefehle als erfolgreiche Übungen ausgegeben.

EXE: `F:/Formnaro/Programm-v0.132.2-r9/Formnaro-win32-x64/Formnaro.exe`  
ASAR SHA256: `799207e9b63e4e903371cf5351e40878ef115532e9469de4bb21606e97c217b6`  
Privat geprüft; keine bestehende Installation ersetzt und nichts veröffentlicht.
