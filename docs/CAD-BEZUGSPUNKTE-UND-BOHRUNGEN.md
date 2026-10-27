# CAD 0.15.0: Bezugspunkte und Bohrungen

Paket 3 ergänzt die vorherigen Übersicht- und Auflagewerkzeuge. Native CAD-Daten,
Projektformat 5 und die lokale API 1 bleiben erhalten.

## Native Bezugspunkte

**An Bezugspunkt** steht in der Werkzeugleiste und unter **Funktionen**.
Ein sichtbares entsperrtes fertiges CAD-Teil auswählen. Zuerst seinen eigenen
Bezugspunkt wählen, dann ein anderes Zielteil anklicken und dessen Bezug wählen.
Alternativ **Arbeitsebenenursprung als Ziel** verwenden. U/V/N-Versätze einstellen,
die Vorschau berechnen und übernehmen. Die Drehung, Spiegelung, Skalierung und
Scherung bleiben erhalten; nur die Verschiebung ändert sich.

Markierungen zeigen native Eckpunkte, Mitten gerader Kanten, vollständige
Kreismitten und Schwerpunkte ebener Flächen. Mit **Fangziele** kann ein Typ
ausgewählt werden. Ein freier Flächenklick liefert einen nativen CAD-Treffer.
Kreismitten werden für Ellipsen und unvollständige Kreisränder nicht angeboten.
Ungleichmäßige Skalierung wird geprüft: Nur wenn die Kreisebene weiterhin
isometrisch abgebildet wird, bleibt ihr Fangziel eine Kreismitte.

Versätze verwenden die native Bezugsflächenrichtung. Bei einem Bezug ohne
eindeutige Fläche gilt die aktuelle Arbeitsebenenrichtung. Es entstehen keine
dauerhaften Verknüpfungen: Spätere Bewegung des Zielteils bewegt das andere Teil
nicht automatisch mit. Gesperrte Zielteile dürfen als unveränderte Referenz dienen.
Netzreferenzen sind außerhalb dieser Präzisionswerkzeuge.

Die Darstellung begrenzt die gleichzeitig sichtbaren Markierungen auf 256.
Bei sehr großen Teilen bleibt die freie Flächenwahl verfügbar. Verdeckte Punkte
können nicht durch davorliegende sichtbare Geometrie gewählt werden. Native
Punktkennungen gelten ausschließlich für die aktuelle Modellrevision.

## Bohrungsassistent

**Bohrung erstellen** steht unter **Funktionen** und in den Eigenschaften eines
fertigen CAD-Teils. Bezugspunkt oder freien Flächenpunkt am gewählten Körper
wählen. Danach Bohrungstyp, Durchmesser, Tiefe, Kopf-/Senkungsmaße, Senkwinkel
und Spiel einstellen. Vorhandene Passungsvorlagen liefern das **Spiel je Seite**;
das tatsächliche Lochmaß ist Nenndurchmesser plus zweimal Spiel.

- **Normale Bohrung:** durchgehend oder Sackloch mit flachem Grund.
- **Kegelige Senkung:** native parametrisierte Senkbohrung.
- **Schraubenkopfaufnahme:** zylindrische Kopfaufnahme mit flachem Grund.

Die Bohrrichtung folgt der nativen Flächennormalen nach innen. U/V/N-Versätze
liegen im Bezugsflächenrahmen. Durchgangslänge wird beim Erstellen aus den
nativen Körpergrenzen bestimmt; sie verlängert sich bei späteren Änderungen
des Originalkörpers nicht automatisch. Kopfaufnahme muss flacher als die Bohrung
sein. Ein Vorschlag ohne tatsächliche Materialentfernung wird abgewiesen.

Die vorhandene native Senkvorlage unterstützt Bohrung bis 200 mm, Senkung bis
300 mm und 30–150° Winkel. Für Durchgänge länger als 300 mm ergänzt der Assistent
eine separate native Zylinderquelle. Gewöhnliche Bohrungen sind auf 1000 mm
Durchmesser und 10000 mm Länge begrenzt. Ungültige Kombinationen werden erklärt.

Beim Übernehmen entsteht eine äußere native Gruppe. Das vollständige Original
bleibt darin als editierbare Quelle erhalten. Native Lochquellen lassen sich im
Quellenbaum später bearbeiten. Bei mehrteiligen Lochprofilen sind ihre Quellen
unabhängig; Änderungen müssen am jeweils passenden Zylinder oder Senkprofil
vorgenommen werden. Ein Übernehmen ergibt einen Undo-Schritt; Abbruch, Escape,
Sperren und veraltete Vorschauen verändern den bestätigten Modellstand nicht.

## Lokale KI

`placeAtReference` und `drill` nutzen dieselbe native Prüfung. Die lokale Szene
ergänzt für ein ausgewähltes sichtbares fertiges CAD-Teil bis zu 2000 native
Bezugspunkte mit lokalen und Weltkoordinaten. Bei größeren Punktlisten wird der
freie Weltstrahl verwendet. Token nie über eine Modelländerung hinweg verwenden.
Schema, Vorlagen, Quellen und bestehende MCP-Werkzeugnamen bleiben verfügbar.

Die portable Ausgabe enthält passende Quellen, Kernelquellen, Lizenzen und
Prüfnachweise. Vorhandene Installationen und Nutzerprojekte bleiben erhalten.
