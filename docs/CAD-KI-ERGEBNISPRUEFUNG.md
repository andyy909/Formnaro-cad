# CAD-Regeln und Ergebnisprüfung für die KI

Ab Formnaro 0.49.1 erstellt die eingebaute API-KI weiterhin dokumentierte
Formnaro-Befehle. Ergänzte Arbeitsregeln verlangen klare Maße und Bezugspunkte,
den Erhalt nicht beauftragter Maße und gezielte Prüfungen des fertigen Teils.
Die Regeln gelten bei der ersten Anfrage und bei jeder automatischen Korrektur.
Es wird kein Python-Generator oder zusätzliches KI-Modell installiert.

## Bedienung

Auftrag wie bisher im KI-Chat oder in der großen KI-Werkstatt eingeben.
Die KI kann passende Sollprüfungen zusammen mit ihren Befehlen zurückgeben.
Formnaro berechnet die Vorschau und misst die angegebenen Anforderungen lokal.
Erst nach bestandenen Prüfungen erscheint ein übernehmbarer Vorschlag.
Unter „Geprüfte Anforderungen anzeigen“ stehen die Soll- und Istwerte.
Ohne zusätzliche Prüfungen wird dies ausdrücklich angezeigt.

Ein Fehler verwirft den Kandidaten. Die eingebaute Korrektur erhält die
fehlgeschlagene Prüfart, Sollwert, Istwert und Toleranz; höchstens zwei
Nachbesserungen sind erlaubt. Die ersten gültigen Sollprüfungen bleiben während
dieser Versuche fest. Weglassen, Aufweiten der Toleranz oder Ändern eines Sollwerts
in einer späteren KI-Antwort schwächt diese Prüfungen nicht ab. Eine falsch
verstandene Anforderung muss der Nutzer gegebenenfalls im nächsten Auftrag
korrigieren. Übernehmen bleibt ausdrücklich erforderlich und erzeugt einen
gemeinsamen Rückgängig-Schritt.

## Unterstützte Messungen

| Prüfart | Bedeutung |
| --- | --- |
| `size` | Drei Objektachsmaße im Bearbeitungsraum (`edit`) oder unter vollständiger Welttransformation (`worldAxes`). Eine Drehung vergrößert diese Maße nicht wie eine achsenparallele Außenbox. |
| `bounds` | Minimum, Maximum, Mitte oder Größe der achsenparallelen Weltbegrenzung. |
| `volume` | Nativ gemessenes CAD-Materialvolumen in Welt-mm³. |
| `solids` | Exakte Anzahl nativer Materialkörper. Innere Hohlraumschalen sind keine zusätzlichen Materialkörper. |
| `distance` | Nativer minimaler Abstand zweier CAD-Geometrien in Welt-mm; Berührung, Überlappung und Einschluss liefern null. Kein Mittelpunktabstand. |
| `clearance` | Ein endlicher freier Weltzylinder zwischen zwei Punkten am sichtbaren fertigen CAD-Materialkörper. Der geprüfte Radius ist `diameter/2 - tolerance`. |

`size` und `bounds` unterstützen auch vorhandene Netzobjekte; der Bericht
kennzeichnet deren Quellenbegrenzung. Natives CAD-Volumen, Körperanzahl,
Abstand und Zylinderprüfung werden für Netze und Ansichtsreferenzen abgewiesen.
Die Ergebnisse stammen aus der berechneten Geometrie und nicht aus von der KI
behaupteten Istwerten oder ungeprüften gespeicherten Statistikfeldern.

## Vertrag für externe KI und lokale API

`POST /v1/preview` akzeptiert zusätzlich das optionale Feld `checks`.
Der vollständige Vertrag einschließlich Schema steht in `GET /v1/context`
unter `resultChecks` und im generierten Kontext in `ai/`.
Maximal 32 Prüfungen mit zusammen höchstens 6000 JSON-Zeichen. Unbekannte
Felder, ausführbarer Code und nicht endliche Werte sind unzulässig.
Numerische Toleranz: 0,000001 bis 0,1; ohne Angabe 0,01 mm beziehungsweise
mm³ für Volumen. Die Körperanzahl wird ohne Toleranz geprüft.

```json
{
  "revision": "AKTUELLE_REVISION",
  "label": "Montageplatte",
  "commands": [
    {"op":"create","type":"box","as":"plate","size":[60,40,6]}
  ],
  "checks": [
    {"kind":"size","target":"$plate","space":"worldAxes","expected":[60,40,6]},
    {"kind":"solids","target":"$plate","expected":1}
  ]
}
```

Prüfziele dürfen vollständige Quellenadressen oder eindeutige Ergebnis-Aliasse
sein. Nach einer Gruppierung können Aliasse Quellen innerhalb des neuen Teils
bezeichnen. Fertige Durchgänge daher am endgültigen Materialkörper prüfen,
nicht am abgezogenen Lochwerkzeug. Array-Aliasse sind als einzelnes Prüfziel
unzulässig. Prüfungen gehen nicht in das Projektformat oder die Geometriehistorie
ein; Bericht und Prüfung gehören zur jeweiligen flüchtigen Vorschau.

## Aussagegrenzen

Gemessen werden nur die aufgeführten Anforderungen. Eine KI, die den Auftrag
falsch versteht, kann auch falsche Sollwerte wählen. Diese Messung ist keine
unabhängige vollständige Übersetzung oder Prüfung natürlicher Sprache.
Die Regeln fordern deshalb Erwartungen aus Nutzerauftrag und aktuellem Modell,
getrennt von der vorgeschlagenen Konstruktion.

Ein freier Zylinder beweist den angegebenen Mindestkorridor, nicht den exakten
Lochdurchmesser, vorhandenes Material ringsherum, eine Anzahl von Bohrungen,
Wandstärke oder allgemeine Druckbarkeit. Seine Endpunkte müssen die verlangte
Tiefe abdecken. Der Bericht nennt den um den radialen Spielraum reduzierten
tatsächlich geprüften Durchmesser. Ein vollständig außerhalb der Zielbegrenzung
liegender Korridor wird abgewiesen. Anzeigen oder Dreiecksproben ersetzen keine
native Messung. Fertigungs- und Festigkeitseigenschaften bleiben eigene Prüfungen.

Ältere lokale API-Clients dürfen `checks` weiterhin weglassen. Vorschau,
Revisionen, Sperren, explizites Übernehmen und Rückgängig bleiben erhalten.
Die gemeinsame Anbieteranbindung des STL-STEP-Konverters verwendet ihren
bisherigen separaten Bereichsvertrag.

## Wiederholbare Prüfung

`npm run test:cad-ai-results` prüft gültige und fehlerhafte Vorschläge mit dem
echten CAD-Worker, Maße unter Scherung/Spiegelung, Körper und Hohlräume,
Abstand, vollständige Bohrungskorridore, beide Anbieterprotokolle,
unveränderbare Sollprüfungen, Abbruch, veraltete Kandidaten und Rückgängig.
`--verify-ai-result-checks=<neuer Berichtspfad>` prüft die wirkliche
Anwendungsoberfläche in einem eigenen synthetischen Profil mit einem lokalen
Testanbieter. Es werden keine Nutzerprojekte oder Cloud-Schlüssel benötigt.
