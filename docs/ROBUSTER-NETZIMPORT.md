# Robuster STL-Netzimport

Die Verwendung **Bearbeitbares Netzteil** lädt auch offene oder beschädigte,
noch lesbare STL-Geometrie. CAD-Rekonstruktion bleibt eine getrennte Wahl.
In neuen Einstellungen ist das bearbeitbare Netz vorausgewählt; gespeicherte
Verwendungsentscheidungen bleiben erhalten. Easy Tinker verwendet weiterhin
seinen gewählten CAD-/Netzbereich.

**Automatisch bereinigen** fasst ausschließlich identische Punkte zusammen,
entfernt exakt doppelte und entartete Dreiecke und richtet geeignete zusammen-
hängende Flächen konsistent aus. Keine Abstandstoleranz, keine Verschiebung,
kein Entfernen von Bestandteilen und kein automatisches Schließen von Öffnungen.
Die Grundbereinigung ist abschaltbar. Offene Ergebnisse werden weiterhin geladen.
Auch die bestehende Easy-Hintergrundreparatur darf die so erhaltenen Import-
öffnungen nicht anschließend automatisch verschließen.

Binäre STL-Dateien dürfen bis 256 MiB und 5 Millionen Dreiecke enthalten.
ASCII-STL bleibt auf 64 MiB begrenzt. Ungültige Koordinaten, defekte Dateilängen
und nicht lesbare Dateien werden abgewiesen. Andere Formate und das bestehende
50-MiB-Projektdateibudget werden dadurch nicht größer.

Über 500.000 Dreiecken wird bei eingeschalteter Vereinfachung eine Arbeitskopie
mit Ziel 250.000 versucht. Fehlerwert 0–1 mm, Vorgabe 0,02 mm. Reicht die
gewählte Genauigkeit nicht aus, wird sie nicht automatisch gelockert. Eine
Kopie bis 500.000 Dreiecken darf trotz unerreichtem Wunschziel geladen werden.
Bleibt sie darüber oder besteht sie die Prüfungen nicht, wird der Import
abgebrochen. Große topologisch beschädigte Quellen können deshalb weiterhin
eine vorgelagerte gezielte Reparatur benötigen.

Vereinfachte Kopien zeigen vor dem Laden ihre Dreieckszahlen, den geschätzten
Fehler und Grenzen an. **Arbeitskopie importieren** übernimmt sie erst beim
zweiten Klick. Abbrechen, ein Dialogwechsel oder eine Projektänderung verwirft
die noch nicht übernommene Kopie. Lesen und Vereinfachen laufen in einem eigenen,
beendbaren Worker; der Modellierkern wird dafür nicht neu gestartet.

Die lokale [meshoptimizer-Vereinfachung](https://meshoptimizer.org/) verwendet
vorhandene Punktpositionen. Offene Randkanten werden gesperrt, deutliche
Normalensprünge ab 35 Grad und je ein Extrempunkt pro Achsenrichtung festgehalten.
Kein Sloppy-/Prune-/Permissive-Modus. Genau kollineare Restflächen werden nur
durch Entfernen der Nullfläche und Aufteilen des vorhandenen Nachbardreiecks
am identischen vorhandenen Mittelpunkt aufgelöst. Danach werden Kanteninzidenzen,
Orientierung, Komponentenanzahl, Eulerzahl, die genaue gerichtete Randkantenmenge,
Extremmaße und der Erhalt gesperrter Punkte unabhängig geprüft.

Der Fehlerwert ist eine Algorithmusschätzung, **kein globaler Hausdorff-Abstand**;
auch ein geschätzter Wert null ist kein exakter Formbeweis. Es gibt keinen
allgemeinen Nachweis von Selbstüberschneidungsfreiheit, Bohrungs-/Passmaßtreue,
Wandstärken oder Druckbarkeit. Glatte unerkannte Funktionsflächen können sich
innerhalb der Approximation ändern. Im Bericht steht `selfIntersections:
not-checked` und `solidProven: false`; Körperwerkzeuge prüfen ihre eigenen
Voraussetzungen weiterhin separat.

Der strukturierte Importbericht steht in den Objektnotizen und ist damit auch
für die vorhandene KI sichtbar. Bei großen Quellen erfolgt die begrenzte
Grundbereinigung zunächst nicht; eine sichere Vereinfachung setzt passende
Quelltopologie voraus. Die Originaldatei wird ausschließlich gelesen. Große
Originalnetze werden nicht zusätzlich in Projekt und Undo eingebettet; zum
späteren Import mit anderer Genauigkeit die Quelldatei behalten. Import und
automatische Platzierung ergeben zusammen einen Undo-Schritt.

Die Verarbeitung ist lokal und benötigt keine KI-Anfrage. Eine Sprachmodell-
beratung kann Messdaten interpretieren und Schritte vorschlagen; sie ersetzt
keinen Geometriealgorithmus oder unabhängigen Ergebnisnachweis.
