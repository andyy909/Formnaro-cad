# Paket 9: Erweiterte Netzreparatur und Flächen

Gezielt abgenommene Windows-Ausgabe 0.116.0-r2 vom 28.10.2026: 112 Tests
und 126 Prüfgruppen in vier echten Windows-Läufen bestanden. Paketbilder,
physische Projekte und unabhängige STL-Rücklesung geprüft. Die allgemeine
Gesamtprüfung folgt nach Paket 10.

Ein sichtbares, entsperrtes Netzteil wählen, **Öffnung schließen** öffnen und
**Erweiterte Netzreparatur und Flächen** wählen. Für Flächenoperationen zuerst
die Netzflächen auswählen und die Auswahl übernehmen. Alle neuen Werkzeuge
berechnen eine unverbindliche Vorschau. **Vergleich** zeigt Original oder
Ergebnis; **Übernehmen** erzeugt einen gemeinsamen Rückgängig-Schritt.
Andere Einstellungen, eine neue Projektrevision oder eine neue Objektauswahl
verwerfen die bisherige Vorschau.

| Werkzeug | Eingabe und Wirkung |
| --- | --- |
| Gekrümmte Öffnung füllen | Einen Randring ausdrücklich wählen. Eine lokale quadratische Anpassung an Rand und Nachbarflächen ergänzt die Öffnung. Der vorhandene Rand bleibt exakt. Krümmung 0 erzeugt die ebene Variante; Reichweite begrenzt die Ergänzung. |
| Zwei Randringe verbinden | Zwei Ringe desselben Teils oder zweier verschiedener Netzteile wählen. Unterschiedliche Kantenzahlen sind möglich. Startversatz und Reichweite bestimmen die Verbindung. Bei zwei Teilen ersetzt das Ergebnis genau diese beiden Wurzeln; beide Originalquellen bleiben erhalten. |
| Bereich gekrümmt ersetzen | Eine zusammenhängende innere Flächenscheibe ausdrücklich auswählen. Nur diese Flächen werden entfernt und aus dem unveränderten Rand und seiner Nachbarschaft ergänzt. Selbstschnitte können mit ihren Nachbarn markiert werden; die so vorgeschlagene Auswahl muss weiterhin die geometrischen Voraussetzungen erfüllen. |
| Flächen extrudieren | Gewählte Flächen in einer gemeinsamen Richtung versetzen und ihre Auswahlränder mit Seitenwänden verbinden. Richtung: mittlere Normale oder Weltachse. Eine vollständige geschlossene Hülle ohne Auswahlrand ist keine Extrusion. |
| Normalversatz | Gewählte Flächen entlang ihrer flächengewichteten lokalen Eckpunktnormalen versetzen; Randseiten entstehen wie bei der Extrusion. Ein großer Versatz kann wegen Selbstschnitt oder entarteter Geometrie abgelehnt werden. |
| Flächenrelief | Rechteck- oder Kreiskontur als weichen örtlichen Netzversatz auf die gewählte Region abbilden. Breite, Höhe und lokale Zielkantenlänge bestimmen Form und Auflösung. |
| Schriftrelief | Konturen der geladenen Schrift einschließlich Innenöffnungen als weichen Netzversatz abbilden. Text, Schrift und vollständige Konturen bleiben in der Quelle gespeichert. |
| Belegte automatische Reparatur | Ausschließlich exakte Duplikate und Nullflächen entfernen und konsistent orientieren. Keine pauschale Lochfüllung, kein Verschweißen und kein Löschen von Komponenten. Ohne passende Änderung oder bei verbleibenden Selbstschnitten wird abgelehnt. |

## Grenzen und Nachweise

Höchstens 30.000 Eingabe- und Ergebnisdreiecke. Die Ergänzung fehlender Flächen
ist eine Annahme über unbekannte Geometrie. Der Anschluss ist G0; Tangenten-
oder Krümmungsstetigkeit sowie die ursprüngliche fehlende Form sind nicht
zugesagt. Nicht einfach projizierbare Ränder und ungeeignete lokale Anpassungen
werden abgelehnt. Die Verbindung ist eine Dreiecksbrücke, keine geglättete
CAD-Übergangsfläche.

Relief und Schrift sind punktweise abgetastete Netzverformungen mit weichem
Rand, keine scharfkantige CAD-Prägung. Lokale konforme Unterteilung schafft
zusätzliche Abtastpunkte. Die eingestellte Höhe ist eine Obergrenze; weicher
Rand und geometrische Sicherheitsprüfung können den tatsächlich erreichten
Versatz verringern. Der Ergebnisbericht nennt beide Werte. Jede wirksame Insel und Innenöffnung benötigt
mindestens drei nicht auf einer Linie liegende aufgelöste Punkte im eigenen
Bereich. Eingeschlossene Kinder können den Nachweis ihres äußeren Bereichs
nicht ersetzen. Zu kleine Details verweigern die gesamte Vorschau; dann die
Zielkante verkleinern oder die Kontur vergrößern.

Alle Ergebnisse durchlaufen Topologie- und vollständige Schnittprüfungen
innerhalb der Rechengrenzen. Überschrittene Grenzen sind ein Fehler, kein
Gesundheitsnachweis. Ein geschlossenes Ergebnis wird zusätzlich im unabhängigen
Manifold-Kern als Materialkörper geprüft. Offene Oberflächen werden ausdrücklich
als offen ausgewiesen. Die beidseitige Vergleichsstichprobe ist eine ungefähre
Diagnose und keine flächendeckende Abweichungsgarantie für neue Geometrie.

Geschützte und nicht gewählte Dreiecke werden unabhängig geometrisch verglichen.
Bestehende unbeteiligte Öffnungen bleiben geometrisch erhalten; konforme
Unterteilung darf Punkte auf deren unveränderter Randlinie ergänzen. Verborgene
oder gesperrte Ziele sind ausgeschlossen. Bei einer Verbindung zweier Teile
werden deren Transformationen einschließlich Spiegelung berücksichtigt. Ein
geschütztes zweites Teil wird zunächst abgelehnt, weil das Einbacken seiner
Koordinaten seine lokale Flächenidentität ändern würde.

Originalquellen und der konkrete Auftrag bleiben als versionierte
`meshSource.operation.type = surgery` gespeichert. OCAD, FNPACK, Autosave sowie
Rückgängig/Wiederholen verwenden die bestehenden Transaktionen. Änderungen
werden weder am Originalimport noch an unbeteiligten CAD-Teilen ausgeführt.

## Gemeinsame Programmschnittstelle

`mesh/toolsQuery` mit `{kind: 'surgeryCatalog', id}` liefert den aktuellen
Geometrie-Digest, vollständige Randringe und die begrenzte vollständige
Schnittdiagnose. Derselbe Katalog ist als `surgeryCatalog` abfragbar.

Der gemeinsame Modellierbefehl heißt `mesh-surgery`, Methode
`local-surgery-v1`, mit einer Aktion `fill`, `bridge`, `replace`, `extrude`,
`offset`, `relief`, `text` oder `repair`. Nur Felder der gewählten Aktion sind
zulässig. Ein Ziel verwendet `id`, zwei ausdrückliche Brückenquellen `ids`;
für die zweite Quelle ist deren aktueller `otherGeometryDigest` nötig.
Die verbindlichen Feldformen stehen in `validateMeshSurgeryOptions` und im
gemeinsamen `AI_PROGRAM_TOOLS`-Vertrag. Auch Programmbefehle verwenden dieselben
Geometrieprüfungen, Quellen und Vorschau-/Übernehmen-Transaktionen.

## Gezielte Entwicklungsprüfung

`npm run test:mesh-surgery` prüft den neuen Kern und Controller sowie die direkt
betroffenen Lochfüllungs-, Ersatz-, Glättungs-, Reparatur- und Programmwege.
Der Windows-Prüfeinstieg verwendet den vorhandenen isolierten
`--verify-mesh-remesh=...`-Lauf mit `FORMNARO_VERIFY_SURGERY_ONLY=1`.
Er verwendet ausschließlich synthetische Netze und ein isoliertes Profil.
Die allgemeine Gesamtprüfung bleibt wie vereinbart nach Paket 10.
