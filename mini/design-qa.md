# Designprüfung Mini 0.3.0

Geprüfter Umfang: Anordnung der Modellwerkzeuge nach dem vom Nutzer gelieferten
Tinkercad-Ausschnitt. Bestehende Mini-Arbeitsfläche und Seitenbereiche fortgeführt.

Referenz und tatsächlich gerenderte obere Leiste wurden in einem gemeinsamen
Vergleichsbild betrachtet (lokaler Nachweis `work/formnaro-mini-v03/toolbar-comparison.png`).
Außerdem die vollständigen Fenster mit 1440 und 1000 Pixeln logischer Breite
sowie das geöffnete Maßmenü geprüft. Screenshots aus der eigenen Electron-Anwendung;
für aktuelle Menüpixel wurde das Prüffenster kurz ohne Fokus angezeigt.

| Kriterium | Ergebnis |
|---|---|
| Reihenfolge | Links Kopieren/Einfügen/Duplizieren/Löschen, Undo/Redo; rechts Sichtbarkeit, Gruppieren/Aufheben, Ausrichten/Spiegeln, Ablage/Messen/Boden, Import/Export |
| Abstände und Aufbau | Durchgehende 44-px-Leiste, flexible freie Mitte, schmale Trennlinien, keine zweite Bearbeitungsleiste |
| Schrift | Kleine Dateibeschriftungen in vorhandener Systemschrift; Symbolnamen als Tooltips und zugängliche Namen |
| Farben | Heller graublauer Hintergrund, dunkle Symbolstriche, erkennbar deaktivierte Befehle und aktive Menüs |
| Symbole | 17 echte lokale Tabler-SVGs, einheitliche Strichstärke; keine Platzhalter oder nachgezeichneten Markenbilder |
| Schmaleres Fenster | Vollständige Leiste bei 1000-px-Fensterbreite sichtbar, Dateibefehle am rechten Rand erreichbar |
| Aufklappmenüs | Achsen und Maße lesbar; am Bildschirmrand begrenzt; Esc schließt und gibt Fokus zurück |
| Bedienung | 40 Desktop-Prüfpunkte inklusive bisheriger Oberflächenablage und Mehrfachauswahl bestanden |

Keine offenen P0/P1/P2-Befunde im geprüften Umfang. Akzeptierte P3-Abweichung:
Die Symbolzeichnungen stammen aus Tabler und entsprechen nicht exakt Tinkercads
Zeichnungen. Die Leiste bildet die tatsächlich unterstützten Mini-Befehle ab;
es werden keine zusätzlichen, funktionslosen Tinkercad-Werkzeuge eingeblendet.

Ergänzung 0.3.1: Anordnung unverändert; Bedienhilfe nennt nun gedrücktes
Mausrad zum Verschieben der gesamten Ansicht, Rechtsziehen zum Drehen und
Mausradrollen zum Zoomen. Kamerabewegung wird gesondert mit echten Eingaben
in Perspektive und Draufsicht geprüft.
