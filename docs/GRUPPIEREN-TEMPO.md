# Schneller gruppieren – Formnaro 0.78.0

CAD-Gruppen mit vielen Teilen berechnen ihre Vereinigungen in einem ausgewogenen
Baum. Dadurch werden große Zwischenergebnisse seltener erneut verarbeitet.
Nachweislich getrennte Teilmengen werden gemeinsam vereinigt. Die Trennung
wird aus nativen Körpergrenzen und Konstruktionstoleranzen bestimmt.

Berührende und überlappende Körper verwenden weiterhin die geprüften nativen
Vereinigungen mit Schnittvolumenprüfung. Bei einem Berechnungsfehler steht der
bisherige schrittweise Weg als Rückfall zur Verfügung. Schnittmengen und das
Abziehen von Lochformen behalten ihre bisherigen Berechnungswege.

Die Änderung gilt beim Gruppieren in Normal und Easy Tinker sowie für Gruppen
über die lokale Schnittstelle. Alle Originalquellen, Parameter, Farben und
Transformationen bleiben bearbeitbar. Vorschau, ein Rückgängig-Schritt,
Wiederholen, Auflösen und Speichern verwenden weiterhin denselben Vertrag.
Die CAD-Geometrie wird weder vereinfacht noch durch ein Netz ersetzt.

Die Verbesserung betrifft das Berechnen von CAD-Gruppen. Die tatsächliche
Wartezeit hängt von Anzahl, Detailgrad und Überlappung der Teile ab.
