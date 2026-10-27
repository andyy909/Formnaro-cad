# Netze teilen und Materialkörper herauslösen – Paket 19

Formnaro 0.42.0 erweitert die vorhandenen Netzwerkzeuge. Im Modus **Normal**
ein sichtbares, entsperrtes vollständiges Netzteil auswählen. Unter
**Netz-Werkzeuge → Netz-Werkzeuge …** das Werkzeug **Mit Ebene teilen** oder
**Materialkörper herauslösen** wählen. Die bisherigen nativen CAD-Werkzeuge
bleiben ebenfalls verfügbar.

## Mit Ebene teilen

- Welt X, Y oder Z, die Richtung der Arbeitsebene oder eine eigene Normale wählen.
- **Schnittposition** als Weltabstand in Millimetern entlang der normierten
  Normalen eingeben. Kommazahlen sind möglich. Bei Welt Z ist dies die Z-Höhe.
  Bei eigener Richtung bleibt der Abstand ein physischer Millimeterwert.
- **Mitte** setzt die Ebene in die Mitte der projizierten Bauteilausdehnung.
  Schrittweite und −/+ erlauben kleine Änderungen. Der Schieberegler setzt eine
  Position zwischen 0 und 100 % der Ausdehnung. Ein Randwert kann tangential
  sein; erst die Vorschau prüft einen echten Materialdurchschnitt.
- Bei Wahl der Arbeitsebenenrichtung liegt die anfängliche Ebene durch den
  Ursprung der Arbeitsebene. Der Zahlenwert bleibt ein Weltabstand und ist
  kein zusätzlicher Abstand relativ zu diesem Ursprung.
- **Vorschau berechnen** erzeugt beide geschlossenen Seiten. Orange steht für
  Seite +, Türkis für Seite −. Eine Ebene außerhalb oder nur am Rand wird mit
  Erklärung abgewiesen; das Original bleibt erhalten.

**Anzeigeabstand** trennt ausschließlich die Darstellung. Vergleich mit dem
Original, Markierungen und einzelne Ansehen-Schaltflächen ändern das Projekt
nicht und berechnen keine neue Teilung. Übernommen werden immer beide Seiten
an ihrer ursprünglichen Position. Eine Schnittseite kann mehrere getrennte
Materialkörper enthalten; diese lassen sich anschließend separat herauslösen.

**Flächen in der Schnittebene hervorheben** zeigt die gespeicherten ebenennahen
Dreiecke gelb. Durchbrüche bleiben in deren tatsächlicher Dreiecksgeometrie
sichtbar. Die Markierung verwendet die angezeigte numerische Abstandstoleranz;
sie kann auch eine schon vorhandene Fläche in derselben Ebene einschließen.
Sie ist keine garantierte Maßprüfung. Die Schnittflächenzahl im Bericht wird
davon unabhängig aus den Oberflächen des berechneten Schnitts ermittelt.

Der Bericht nennt Schnittfläche, Volumen vorher/nachher, fehlendes und
zusätzliches Material sowie die verwendete Volumentoleranz. Die vorhandene
Geometrieprüfung bestätigt geschlossene positive Ergebniskörper und den
Materialerhalt innerhalb dieser Toleranz. Wandstärke, Druckbarkeit und allgemeine
Selbstüberschneidungsfreiheit sind damit nicht vollständig geprüft.

## Materialkörper herauslösen

Die Vorschau listet jeden unabhängigen Materialkörper mit eigener Farbe,
Volumen und **Ansehen**-Schaltfläche. Alle Körper werden als einzelne Objekte
übernommen; kein Eintrag wird durch Ansehen oder einen Anzeigeabstand entfernt.
Geschlossene innere Hohlräume bleiben beim zugehörigen Materialkörper.
Ungeeignete oder mehrdeutige Schalen werden abgewiesen. Ein bereits einzelner
Materialkörper benötigt kein Herauslösen.

## Übernehmen und Abbrechen

**Beide Seiten übernehmen** beziehungsweise **Alle Körper einzeln übernehmen**
erzeugt genau einen gemeinsamen Rückgängig-Schritt. **Abbrechen**, × oder Escape
verwirft den Entwurf einschließlich laufender Berechnungen und später Antworten.
Eine Änderung der Schnittposition verwirft die alte Vorschau. Projekt- oder
Auswahländerungen schließen den Entwurf; veraltete Ergebnisse sind nicht
übernehmbar. Anzeigeabstand und Vergleich bleiben reine Ansichtseinstellungen.

Dateiaufträge, KI-Änderungen und unpassende Tastatur-/Werkzeugaktionen sind während
des Entwurfs gesperrt. F passt die Ansicht ein. Schutzbereiche müssen vor einer
Geometrieänderung separat im Flächenauswahlwerkzeug ausdrücklich freigegeben
werden. Offene oder beschädigte Netze benötigen zunächst eine geeignete Reparatur.

Originalteil mit vollständiger bisheriger Historie, vorhandener CAD-Herkunftsverweis,
Farben, Deckkraft und Organisation bleiben erhalten. Neue Teile erhalten passende
Namen. Unbeteiligte CAD-Körper und Ansichtsvorlagen bleiben unverändert. Vorhandene
Flächenmarkierungen müssen nach geänderter Geometrie neu gewählt werden.

Speichern und Wiederöffnen erhalten beide Seiten beziehungsweise alle Körper
samt Quellen. STL und OBJ exportieren die bestätigten Teile in ursprünglicher
Lage; Vorschauabstand und gelbe Prüfmarkierungen werden nicht exportiert.
Projektformat 8, Arbeitsplatzformat 4 und das 50-MB-Projektlimit einschließlich
Quellenhistorie bleiben bestehen. Vorherige Programmversionen bleiben erhalten.
Paket 20 ergänzt später Passstifte und Steckverbinder.
