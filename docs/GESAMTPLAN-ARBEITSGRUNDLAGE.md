# Gesamtplan: Arbeitsgrundlage

Stand 02.11.2026: Schritt 1 ist vorbereitet und gezielt geprüft.

Die Entwicklung beginnt in einem eigenen lokalen Repository auf dem Zweig
`codex/gesamtplan-r35`. Grundlage sind exakt die 2.240 Dateien des gesicherten
r35-Quellmanifests, unverändert und per SHA-256 geprüft. Der erste Commit ist
die eingefrorene Ausgangsbasis; nachfolgende Änderungen bleiben separat prüfbar.
Der vorhandene normale Arbeitsordner wird nicht als Quellbasis übernommen.

Abhängigkeiten, eingefrorener Renderer und portable FreeCAD-Laufzeit liegen
als eigene physische Kopien vor. Der gemeinsame native CAD-Kern ist über
`cad-kernel-build/runtime` und sein Integritätsmanifest gebunden. Der WASM-Hash
stimmt mit der eingefrorenen r35-Darstellung überein. Details der lokalen
Herkunft und Dateimanifeste liegen außerhalb von Git im Arbeitsnachweis.

Tests verwenden ausschließlich separate Datenkopien und neue, leere Profile.
Persönliche Modelle, Profile, Verbindungsdateien und Zugangsdaten gehören nicht
in dieses Repository oder in die technische Dokumentation. Desktoptests müssen
alle Datenpfade ausdrücklich an ein eigenes Testprofil binden; die hier
angelegten Profilordner allein stellen noch keinen gestarteten Testhost dar.

Gezielte Baseline: 21 vorhandene Tests für affine Transformationen,
Projektvalidierung und Gelenkautomation einschließlich echter nativer
Kollisionsabfragen bestanden. Zusätzlich startet der gemeinsame CAD-Kern in
einem separaten Node-Prozess und berechnet einen gültigen 320-mm³-Quader.
Eine große private Projektkopie ist vollständig lesbar. Dies ist eine
Arbeitsgrundlagenprüfung, keine neue Desktop-, FreeCAD- oder Gesamtabnahme.

Nachtrag 02.11.2026: Schritte 2–5 sind im getrennten Entwicklungsstand
bearbeitet und gezielt geprüft; Nachweise und Grenzen stehen in
[CNC-REGRESSIONEN.md](CNC-REGRESSIONEN.md). Schritt 1 selbst änderte keine
Produktfunktion. Installation und Veröffentlichung bleiben unverändert.

Nachtrag zu Punkten 6–10: [Direkte Speicherung und Auftragssteuerung](AUTOMATION-SPEICHERN-UND-AUFTRAEGE.md) beschreibt den nächsten umgesetzten Block und seine Zugangswege. Abschließende lokale Einzelbelege liegen außerhalb von Git.

Abschlussprüfung Punkte 6–10: Standardsuite 125/125, gezielter Schlusslauf 19/19 und Python-Feedbacktests 4/4 bestanden; Renderer gebaut. Zwei unabhängige Prüfachsen ohne offene konkrete Befunde nach Korrektur von Vorschauablauf und Exportrevision. Die isolierte Desktopprüfung bestätigt Speicherung großer Projekte in beiden Formaten, kleine Belege, gezielten Abbruch und schnellen Status; sie wurde regulär beendet. Der zuvor bestandene native Normalpfad-/Junction-Test ersetzt keine abschließende Wiederholung nach der späteren Defender-Quarantäne. Punkt 10 bleibt hinsichtlich dieser letzten nativen Abnahme offen.

Punkte 11–15 werden im selben privaten Entwicklungszweig fortgesetzt; technische Umsetzung und verbleibende Nachweisgrenzen stehen in [Nativer Speicher und Gewinde](NATIVER-SPEICHER-UND-GEWINDE.md). Einzelne Betriebsmessungen und der vollständige Schlussstand werden außerhalb von Git im privaten Blocknachweis festgehalten.

Abschluss Punkte 16–20: Größenanker, feste Baugruppen, konkrete Bezugsauskunft und Bohrzielbereiche sowie fokussierte Befehls-/Profilabfragen sind implementiert. 125 Standardtests, 49 gezielte Tests und 12 Python-Tests bestanden. Eine isolierte aktuelle Desktopinstanz bestätigt fünf Abläufe einschließlich beider realer MCP-Profile, sichtbarer neuer Bedienelemente, nativer Bohrungsmessung und normalem Exit 0. Die konkrete CNC-Quelle wurde separat nativ mit beibehaltenem Mittelpunkt und Undo geprüft; Originaldateien bleiben unverändert. Kontext-JSON und Werkzeugdefinitions-Nutzlasten wurden vergleichbar in UTF-8 gemessen; Werte stehen im privaten Blocknachweis. Zwei unabhängige Reviews ohne offene konkrete Befunde nach den Korrekturen. Punkte 21–28 folgen später. Die frühere FreeCAD-Nachweisgrenze bleibt bestehen.


Abschluss Punkte 21–25: Änderungsberichte, Aufnahme über Anzeigematrizen, Schraubtrieb, ebener Spindelantrieb und stichprobenbasierte Bereichsprüfung sind im privaten Entwicklungsstand umgesetzt. 125 Standard-/95 gezielte Tests, 7 Python-Tests und sechs aktuelle isolierte Desktop-Prüfblöcke bestanden; aufgenommenes GIF und Video geprüft, normale Beendigung/Exit 0. Grenzen und Nachweise: [Bewegung, Aufnahme und Antriebe](BEWEGUNG-AUFNAHME-UND-ANTRIEBE.md). Die FreeCAD-Nachabnahme aus Punkt 10 bleibt separat offen; Punkte 26–28 folgen später.


02.11.2026 Gesamtplan 26–28 im getrennten Entwicklungsstand: Native Einzel-/Bereichsprüfungen unterscheiden Durchdringung, Berührung mit ausdrücklicher paarweiser Freigabe und geforderten Mindestabstand; Messpunkte/Fundstellen sind sichtbar anwählbar. Fehlende Mesh-Abstandsmessungen bleiben unbekannt, Gelenke werden nicht ausgenommen. Prüfberichte und erklärte Vereinfachungen/fehlende Kopplungen sind über Vorschau/Apply/Undo in Format32 speicherbar. Oberfläche, Szene und App-Auskunft verwenden denselben vollständigen aktuellen/veralteten Status; FNPACK-Normalisierung verhindert falsche Veraltung beim Nachladen. Malformierte gespeicherte Berichtfelder werden abgewiesen. Alte API-Aufrufe bleiben ausführlich; kompakte MCP-Adapter fordern Zusammenfassungen ausdrücklich an. Native Kopierbatches behalten neue Kopplungsdaten. Seitlich versetzte ebene Mechanik erhält eine ausdrückliche gespeicherte Ebene.

Gezielter Abschlussnachweis: 125 Standard-/109 gezielte Tests, 15 Python-Tests (SDK7/Feedback4/Profil1/UI3), acht begrenzte native CNC-Regressionen, separater echter CNC-Kopienlauf (40 Teile/39 Gelenke/5 Kopplungen/3 echte Innengewinde) und aufgezeichnete Desktopabnahme mit neun Prüfblöcken bestanden. Eine weitere aktuelle aufgezeichnete Instanz prüft reale Node-/Python-MCP-Aufrufe bis Speicherung/Undo; jeweils regulär geschlossen/Exit0. Mistral-Large4/high über vorhandenen ACP-Kontozugang hat genaue Werkzeugauskunft, technische Fehlerrückmeldung und Korrektur auf10Grad mit Übernahme praktisch geprüft. Das ist ein eigener deterministischer Werkzeug-Relay, kein Inferenzqualitätsvergleich und keine neue allgemeine Providerfreigabe. Tokens/Kosten sind separat als Anbieterangaben dokumentiert.

Punkte26–27 sind umgesetzt und gezielt abgenommen. Punkt28 ist hinsichtlich Implementierung und der genannten Zugangs-/CNC-Nachweise bearbeitet, jedoch NICHT vollständig abgenommen: die DeepSeek-Harness-Fensteraktivierung scheiterte vor jeder gesendeten Nachricht; die gesonderte FreeCAD-Nachabnahme aus Punkt10 bleibt durch den weiterhin fehlenden zuvor quarantänisierten Starter blockiert. Keine Schutzumgehung oder Zugangsdatenübernahme. Details: [Prüfstände und Gesamtabnahme](PRUEFSTAENDE-UND-GESAMTABNAHME.md). Keine neue EXE, Installation oder Veröffentlichung; Nutzeroriginale und bestehende Installation bleiben erhalten.
