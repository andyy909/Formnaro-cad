# Formnaro 0.25.0: Netz-Werkzeuge im gemeinsamen Programm

Paket 6 verbindet die vorhandenen Netzverfahren mit dem gemeinsamen Projekt.
CAD-Körper und Netzteile behalten ihren eigenen Rechenkern. Änderungen verwenden
dieselbe Vorschau, dieselbe Übernahme und dasselbe Rückgängig wie die CAD-Werkzeuge.

## So beginnen

1. Eine STL-/OBJ-/3MF-/GLB-/glTF-Datei importieren und **Bearbeitbares Netzteil**
   wählen. Alternativ unter **Netz-Werkzeuge → Neues Netzteil** eine vorhandene
   Netz-Grundform mit ihren Parametern erzeugen.
2. Ein Netzteil im gemeinsamen Objektbaum oder in der Arbeitsfläche auswählen.
   Für Vereinigung, Abzug und Schnittmenge mehrere Netzteile auswählen.
3. **Netz-Werkzeuge** öffnen. Die Körperprüfung läuft im Hintergrund. Offene
   oder beschädigte Oberflächen bleiben sichtbar und speicherbar; Körperverfahren
   werden erst nach erfolgreicher Prüfung freigegeben.
4. Werkzeug und Maße einstellen, **Vorschau berechnen**, prüfen und **Übernehmen**
   oder **Abbrechen**. Esc verwirft auch eine laufende Berechnung. Eine neue
   Auswahl, eine Projektänderung oder geänderte Werkzeugwerte machen die Vorschau
   ungültig. Strg+Z stellt den vorherigen gemeinsamen Projektstand wieder her.
5. Als gemeinsame `.ocad`-Datei speichern. Die neuen Netzquellen bleiben beim
   Wiederöffnen erhalten. Ältere Ausgaben können diese erweiterten Quellen nicht
   bearbeiten; dafür die neue separate Ausgabe verwenden.

## Angeschlossene Verfahren

| Werkzeug | Verhalten |
|---|---|
| Neues Netzteil | Vorhandene Grundformen und parametrische Generatoren ausdrücklich als Netz erzeugen. Die CAD-Palette erzeugt weiterhin native CAD-Körper. |
| Netz prüfen | Materialkörper im Netz-Rechenkern prüfen; Weltvolumen und Dreieckzahl anzeigen. Die Prüfung verändert das Modell nicht. |
| Vereinigen / Löcher abziehen | Materialteile vereinigen, markierte Lochformen abziehen. Quellen bleiben erhalten. |
| Erstes Teil minus weitere | Die Auswahlreihenfolge bestimmt das Materialteil und die abzuziehenden Teile. |
| Schnittmenge | Gemeinsames Material der ausgewählten Netzteile behalten. |
| Körper / Lochform | Rolle auch über die Eigenschaften setzen. Lose Lochformen werden beim Export ausgelassen. |
| Bohrung erstellen | Durchgangs- und Sackbohrung, kegelige Senkung und Kopfaufnahme; Punkt, äußere Normale, Versatz, Maße und Spiel einstellen. |
| Mit Ebene teilen | Weltachse, Arbeitsebene oder eigene Normalenrichtung und Abstand verwenden. Beide Seiten und ihre Originalquelle behalten. |
| Materialkörper herauslösen | Getrennte Materialkörper herauslösen. Ein geschlossener Innenraum gehört weiter zum umgebenden Materialkörper. |
| Kanten abrunden / fasen | Die vom bisherigen Netzverfahren unterstützten geraden Außenkanten und passenden ebenen Randkonturen bearbeiten. Bis zu 16 Kanten; ungeeignete Kanten und zu große Maße werden abgewiesen. |
| Quellen bearbeiten | Erhaltene Originalquellen mit Parametern, Maßen und Lage bearbeiten. Gruppenquellen können einzeln unterdrückt und wieder aktiviert werden. |
| Gruppe auflösen | Originalteile mit ihren vollständigen Lagen und Metadaten wiederherstellen. Eine Teilung oder Körperextraktion wird damit nicht rückgängig gemacht. |

Vorschauen ersetzen nur die betroffenen Netzteile in der Ansicht. Unbeteiligte
CAD-Körper, offene Netze und Ansichtsvorlagen bleiben normal sichtbar. Gesperrte
Teile sowie gesperrte übergeordnete Ordner oder Layer verhindern die Bearbeitung.
Die vollständigen affinen Lagen einschließlich Spiegelung und Scherung bleiben
erhalten; eine Netzoperation wandelt keinen CAD-Körper um.

## Grenzen dieser Ausgabe

Stand dieser Grundlagenbeschreibung war Paket 6. Inzwischen sind Flächenauswahl,
Schutzbereiche, Inspektor, gezielte Reparaturen, Reduce und konservatives Remesh
in eigenen Paketen hinzugekommen. Aktuelle Anleitungen: NETZE-VEREINFACHEN.md
und NETZE-NEUVERNETZEN.md. Make Solid und Hollow bleiben spätere Pakete.
Easy Tinker besitzt einen begrenzten automatischen Reparaturversuch.
Die Körperprüfung ist keine vollständige Druckprüfung oder Garantie gegen alle
Selbstüberschneidungen. Netzverfahren und Rundungen verwenden die vorhandene
Dreiecksgenauigkeit; ihre Ergebnisse sind keine analytische CAD-Geometrie.

Die Quellenbearbeitung bietet gespeicherte Originalquellen an. Erzeugte
Bohr-/Kantenhilfskörper sind keine zusätzlichen frei editierbaren Originalteile.
Wenn eine Quellenänderung den gewählten Kantenbezug verändert, wird sie
verworfen; die Kanten müssen für die geänderte Form neu gewählt werden.
Bei einer Körperextraktion muss nach einer Formänderung erneut herausgelöst
werden. Text/SVG-Netzerzeugung, aktive Netzflächenbezüge, weitere Analyse- und
Bedienwerkzeuge werden beim vollständigen Werkzeugabgleich in Paket 7/8 ergänzt.
CAD-Netzkopie und ausgewähltes Netz → CAD folgen ausdrücklich in Paket 10/11.

Projektdateien bleiben auf 50 MB begrenzt; erhaltene Quellen und die Sicherung
alter Netzprojekte zählen mit. Zu große Ergebnisse werden vor der Übernahme
abgewiesen. Das Programm und der mitgelieferte STL→STEP-Konverter funktionieren
offline. Die bisherigen Programme und Originaldateien bleiben erhalten.

Technischer Überblick: [Projektgrundlage](GEMEINSAME-PROJEKTGRUNDLAGE.md).
Weitere Schritte: [Arbeitspakete](FORMNARO-UMSETZUNGSSTAND.md).
