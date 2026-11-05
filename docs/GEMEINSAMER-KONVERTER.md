# STL als CAD weiterbearbeiten

Verfügbar in **0.127.0 Nightly r10**. [English](STL-TO-CAD.md)

## STL öffnen und lokal prüfen

Unter **Import** eine STL wählen und **STL als CAD-Körper rekonstruieren** einstellen. Der Konverter ist auch über **Funktionen → STL → STEP** erreichbar. Einheit, angezeigte Eingangsmaße und Abweichungsbudget prüfen.

**Lokal zuerst · KI gezielt einsetzen** erstellt zuerst einen lokal geprüften STEP-Kandidaten. Eine gültige Vorschau kann ohne KI-Anfrage bereitstehen. Original, Ergebnis und Überlagerung vergleichen, dann die CAD-Vorschau übernehmen oder STEP speichern. Übernehmen erzeugt einen gemeinsamen Undo-Schritt.

Die Originalansicht arbeitet unabhängig von der Flächenanalyse. Auch ein Netz oberhalb der 20.000-Dreiecke-Grenze des Flächeneditors kann lokal konvertierbar sein.

## Einzelne Flächen mit KI prüfen

Lokale Abweichungsproben können fragliche Regionen zeigen. Die KI prüft diese Bereiche und ihre direkten Kantennachbarn. Alternativ Flächen analysieren, einige Bereiche markieren und die gezielte Korrektur starten. Scheitert die lokale Konvertierung ohne verwertbare Fehlerposition, zuerst analysieren und markieren.

Die Nachprüfung nutzt höchstens zwei Anbieteranfragen und ein Zeitbudget von 90 Sekunden. Einheit, Toleranz und Konvertereinstellungen bleiben verbindlich. Formnaro prüft Vorschläge lokal und erhält den gültigen Kandidaten bei Fehler, Abbruch oder fehlender gemessener Verbesserung. An den Anbieter gehen Flächenmesswerte; die STL-Dreiecke bleiben lokal. Zugang und Abrechnung verwenden die gemeinsamen KI-Einstellungen.

Manuelle Flächenbearbeitung und manuelle KI-Vorschläge sind ebenfalls verfügbar.

## Ein symmetrisches Teil rekonstruieren

1. **Symmetrie · eine Seite rekonstruieren** öffnen.
2. Die Achse senkrecht zur bekannten Spiegelebene, die Lage in Millimetern und die Vorlagenseite wählen. Eine leere Lage verwendet die Mitte der Eingangsbegrenzung.
3. Überlappung einstellen oder automatisch bestimmen lassen. Automatisch beträgt sie das Fünffache des Budgets. Eine eigene Vorgabe muss größer als das doppelte Budget sein.
4. Prüfung starten. Formnaro vergleicht das Original mit seiner Spiegelung, rekonstruiert eine überlappende Seite und spiegelt und vereinigt die CAD-Körper.
5. Die CAD-Vorschau prüfen. Die STEP muss erneut als ein geschlossener Volumenkörper einlesbar sein und die beidseitigen Oberflächen- und Nahtproben bestehen. Anschließend übernehmen oder verwerfen.

Unterstützt werden eine geschlossene, konsistent orientierte Komponente, eine achsenparallele Ebene, höchstens 40.000 Originaldreiecke und höchstens 20.000 Dreiecke im überlappenden Teilstück. Ein relevanter Unterschied zwischen den Originalseiten führt zur Ablehnung. Koordinatenrundung wird im Genauigkeitsbudget berücksichtigt. Die Vorlagenseite nach der beabsichtigten Form wählen. Welche Seite eines beschädigten Scans die richtige Form zeigt, bestimmt der Modus nicht automatisch.

## Grenzen

- Höchstens 50 MiB STL und 30 MiB STEP. Auch ein Netz unter 20.000 Dreiecken kann eine zu große STEP erzeugen.
- Sehr kleine Eingangsmaße im Verhältnis zum Budget lösen einen Einheitshinweis aus. Die Einheit wird ausdrücklich gewählt.
- Abweichungen sind gemessene Stichproben mit Vernetzungsreserve und kein garantierter globaler Maximalfehler.
- Schwierige Flächen können facettiert bleiben. Die ursprünglichen Skizzen und Konstruktionsschritte werden nicht wiederhergestellt.
- Die Berechnung verwendet temporäre Eingaben. Erst Übernehmen bestätigt die Projektvorschau.

Downloads und Prüfumfang stehen in der [r10-Veröffentlichung](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.127.0-r10).
