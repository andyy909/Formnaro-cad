# Formnaro: Ausbau für Alltag, Werkstatt und Maschinenbau

Stand: 29.10.2026. Der Nutzer hat die Umsetzung der ersten Etappe beauftragt. Ausgangspunkt ist der lokale Entwicklungsstand 0.120.0; ältere uncommitted Änderungen bleiben erhalten.

## Erste Etappe: Pakete 1–3

1. **Mitwachsende Bohrungen:** Normale Bohrung, Senkung und Kopfaufnahme als zusammen bearbeitbares Merkmal. Feste Tiefe, Durchgang und bis zu einer ausgewählten ebenen Fläche; bei veränderter Quelle explizite Aktualisierung als atomare Vorschau. Mehrdeutige Bezüge anzeigen und neu wählen. Alte Bohrgruppen nicht automatisch umwandeln.
2. **Verknüpfte Muster:** Reihen, Raster, Kreismuster und Spiegelungen mit dauerhaftem Ursprung, veränderlicher Anzahl und Maßen. Ganze CAD-Teile und Bohrmerkmale, Projektparameter und Varianten, ausgelassene sowie ausdrücklich gelöste Instanzen. Unabhängige Kopien bleiben verfügbar.
3. **Skizzenbedienung:** Maßbedingungen auf der Zeichenfläche bearbeiten, Elemente direkt für Bedingungen wählen, Auswahl und Konflikte hervorheben. Bestimmtheit nur für tatsächlich untersuchte Gruppen angeben. Bestehenden begrenzten Löser und Lösung beim Loslassen erhalten.

Neue versionierte Merkmale müssen die bestehenden Projekt-/Bibliotheksformate, FNPACK, Kopieren, Autosicherung, Export und die lokale KI-Schnittstelle unterstützen. Alte Dateien nicht still umwandeln. Änderungen als Vorschau mit Revision, Übernahme und Undo; verlorene Bezüge und veraltete Ergebnisse dürfen nicht still exportiert werden.

Abnahme je Paket umfasst native Geometrie, Abhängigkeiten, Sperren, Verlust von Bezügen, Vorschau/Abbruch, Undo/Redo, Speichern/Wiederöffnen und betroffene Exporte in der tatsächlichen Windows-Anwendung. Gemeinsame Abschlussbeispiele: Platte mit durchgehenden und gesenkten Bohrungen, veränderlicher Flansch und bemaßte Halterkontur; anschließend allgemeine Gesamtprüfung und unabhängiger STEP-Rückimport. Historische Nachweise getrennt erhalten.

## Priorisierte spätere Pakete

4. Werkstatt- und Normteilassistent mit belegten metrischen Tabellen und Gewindebezeichnungen.
5. Werkstattzeichnungen mit Detailansichten, Mittellinien, Toleranzen und Positionsnummern.
6. Montage über ausgewählte Achsen und Flächen sowie Prüfung mehrerer Teile.
7. Erweiterte Direktbearbeitung importierter STEP-Körper mit ausdrücklich benannten Grenzen.
8. Blech mit konstanter Dicke, Biegungen und DXF-Abwicklung.

FEM, CAM, Schweißkonstruktion, Routing, weitere Freiformflächen und umfangreiche DWG-Arbeitsabläufe folgen nach eigenem Plan. Funktionen bleiben lokal ohne verpflichtende Cloud-KI. Zuvor gestrichene Druckprüfungen bleiben gestrichen; optionale Module und frühere Veröffentlichungsentscheidungen bleiben unverändert.
