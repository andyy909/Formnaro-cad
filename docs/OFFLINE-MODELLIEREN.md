# Offline-Modellieren ab Formnaro 0.79.0

Die wichtigsten Zeichen- und Bearbeitungswerkzeuge stehen direkt in Formnaro.
Der ab 0.66.0 zusätzlich mitgelieferte SolidCraft-Gesamteditor entfällt ab 0.79.0:
Er wird weder mitgeliefert noch aus Formnaro gestartet. Der im Projekt verwendete
Zusatzeditor hieß SolidCraft; eine SolidWorks-Installation gehörte nicht dazu.

Der Einstieg in Skizzen, lokale benannte Maße, Konturwerkzeuge, Anbauten,
Ausschnitte und technische Netzwerkzeuge steht unter
[Kernwerkzeuge direkt in Formnaro](FORMNARO-KERNWERKZEUGE.md).

## Bestehende Projekte

Alte Projekte einschließlich Format 9 bleiben lesbar. Bereits übernommene
CAD-Geometrie bleibt als CAD-Teil verfügbar. Eine eingebettete parametrische
Quelle wird beim Öffnen und Speichern erhalten und nicht automatisch in eine
Formnaro-Skizze umgewandelt. Ihre SolidCraft-Skizzen und Konstruktionsschritte
lassen sich in dieser Ausgabe nicht weiterbearbeiten.

Für solche historischen Entwürfe eine Kopie des Projekts und die bisherige
portable Ausgabe aufbewahren. Die frühere Ausgabe wird durch diese Änderung
nicht ersetzt. Änderungen an der CAD-Geometrie in Formnaro aktualisieren keinen
eingebetteten SolidCraft-Konstruktionsverlauf.

## Umfang

Formnaro behält seine eigenen CAD- und Netzquellen, Vorschauen und Rückgängig.
Lokale Skizzenformeln sind vorhanden; ein allgemeiner geometrischer
Bedingungslöser und globale Abhängigkeiten zwischen Teilen sind nicht enthalten.
Loft, Sweep und Shell aus dem früheren Zusatzeditor wurden nicht in Formnaro
übernommen. Der bestehende separate Netzbefehl **Aushöhlen** bleibt verfügbar.
Die Mini-Ausgaben bleiben eigenständig.
