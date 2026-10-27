# Netze formtreu vereinfachen – Paket 21

Formnaro 0.44.0 reduziert zusätzliche Dreiecke **in ebenen Netzbereichen**.
Bohrungskonturen, Formkanten und die Facetten gekrümmter Flächen bleiben fest.
Markierte Bohrungs- und Anlageflächen behalten ihre Dreiecke geometrisch exakt.
Die Methode eignet sich für technische Teile mit übermäßig unterteilten Flächen.

## Bedienung

1. Im Modus **Normal** ein sichtbares, entsperrtes vollständiges Netzteil wählen.
   CAD-Körper bei Bedarf zuvor mit **CAD → Netzkopie** kopieren.
2. Wichtige Flächen bei Bedarf über **Netzflächen auswählen …** markieren,
   unter **Schutzbereiche** als Bohrung oder Anlagefläche schützen und übernehmen.
3. **Netz-Werkzeuge → Netz vereinfachen …** öffnen.
4. Das ganze Teil oder eine zuvor übernommene Flächenauswahl bearbeiten.
   Das Ziel bezeichnet die verbleibenden Dreiecke im gewählten Bereich:
   beispielsweise **50 Prozent** oder **1.000 Dreiecke**. Kommazahlen sind möglich.
5. Die höchstens zulässige Formabweichung in Millimetern einstellen und
   **Vorschau** wählen. Der Standardwert ist **0,001 mm**.
6. Dreieckszahlen, Schutzflächen, Außenmaße, Abweichungsgrenze und Körperprüfung
   lesen. Mit **Vergleich** zwischen Original und Ergebnis wechseln.
7. **Übernehmen** bestätigt einen gemeinsamen Rückgängig-Schritt. **Abbrechen**
   oder Escape verwirft die Vorschau. Nach geänderten Einstellungen ist eine neue
   Vorschau nötig. Während der Bearbeitung sind Verschieben, Speichern, Export
   und Moduswechsel gesperrt.

## Schutz und Maßvergleich

Die Vereinfachung entfernt innere Punkte geeigneter ebener Bereiche, indem sie
Kanten auf vorhandene Nachbarpunkte zusammenzieht. Verwendete Punktkoordinaten
werden nicht verschoben. Grenzen zwischen Ebenen, Kurvenfacetten und offenen
Rändern bleiben fest. Ebenen werden gegen eine feste Ausgangsebene geprüft;
eine Folge kleiner Winkel darf keine Bohrung allmählich abflachen.

Die Dreiecke geschützter Flächen und aller nicht ausgewählten Bereiche werden
weder gelöscht noch verändert. Schutzbereiche behalten Name, Art und Identität;
ihre Dreiecksnummern werden an das neue Netz angepasst und gegen dessen Geometrie
geprüft. Andere geometrische Werkzeuge behalten ihre bisherige Schutzsperre.
Die allgemeine Flächenauswahl wird nach einer Geometrieänderung verworfen, damit
alte Nummern keine anderen Flächen markieren.

Die Vorschau nennt vorherige und neue Dreieckszahl, die konservative obere
Abweichungsgrenze in Weltkoordinaten und den Unterschied der äußeren Begrenzungen.
Bei geschlossenen Körpern werden Körpergültigkeit und Volumen separat geprüft.
Bei sauberen offenen Flächen bleiben die Öffnungsränder erhalten; sie werden
dadurch nicht zu geschlossenen Körpern. Beschädigte, mehrdeutige, doppelte oder
entartete Netze zuerst gezielt reparieren.

## Grenzen

- Bis zu **150.000 Ausgangsdreiecke je Netzteil**. Zielzahlen und Umfang müssen
  gültig sein; größere Netze werden mit einer Erklärung abgelehnt.
- Das Ziel ist ein Wunsch unter festen Schutzbedingungen. Die Vorschau meldet,
  wenn die Schutzgrenze weniger Reduktion erlaubt. Es werden keine wichtigen
  Flächen entfernt, nur um eine Zielzahl zu erzwingen.
- Die Methode vereinfacht ebene Bereiche. Bei einer Kugel ohne überflüssige
  ebene Unterteilung gibt es gegebenenfalls nichts sicher zu entfernen. Auch
  eine größere Toleranz erlaubt kein gröberes Annähern von Kurven oder Bohrungen.
- Eine Änderung der Dreiecksverteilung mit sichtbarem Formvergleich gehört zu
  Paket 22. Es wird keine allgemeine Drucktauglichkeit zugesichert.

## Speichern, Quellen und Export

Das gemischte Projektformat bleibt **8**, der Arbeitsplatz höchstens **4**.
Das neue Vereinfachungsrezept benötigt **Formnaro 0.44.0 oder neuer**.
Das gesamte Original einschließlich Herkunft, Schutzbereichen und älteren
Quellen bleibt im Rezept erhalten. Rückgängig stellt den exakten vorherigen
Stand wieder her, Wiederholen stellt das vereinfachte Ergebnis wieder her.
Die historische Originalgeometrie ist im Vereinfachungsrezept vor direkten
Änderungen geschützt; für andere Ausgangsgeometrie zuerst zurückgehen und neu
vereinfachen. Lage, Darstellung und allgemeine Eigenschaften bleiben bedienbar.

Projekt speichern und neu öffnen erhält Ergebnis, Original und gültige
Schutzzuordnung. STL und OBJ exportieren das bestätigte vollständige Teil in
seiner ursprünglichen Lage. Originalvergleich und Vorschau werden nicht exportiert.
Easy Tinker bleibt mit CAD-/Netzbereichen, gemeinsamer Historie, Dateiaustausch
und automatischem Netzreparaturversuch enthalten und Bestandteil der Abnahme.

Die getrennte Ausgabe liegt unter
`release-formnaro-vereinfachen-v0.44.0/Formnaro-win32-x64/Formnaro.exe`.
Das Archiv `output/Formnaro-Vereinfachen-v0.44.0.zip` vollständig in einen eigenen
Ordner entpacken und `App/Formnaro.exe` starten. Frühere Programme bleiben erhalten.
Auslieferungsnachweise: `work/mesh-reduce/checks/final-audit.json` und `delivery.json`;
Quelltests, tatsächliche EXE-Prüfungen und unabhängige Datei-/Geometrieprüfung
müssen alle erfolgreich sein.
