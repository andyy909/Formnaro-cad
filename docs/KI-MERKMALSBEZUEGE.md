# Gezielte Änderungen mit Merkmalsbezügen

Ab Entwicklungsstand 0.109 lassen sich native CAD-Flächen, Kanten, Bohrungen,
Skizzen und erhaltene Konstruktionsquellen gezielt an einen KI-Auftrag anhängen.
Die Referenzen werden im Projekt gespeichert. Projekte mit solchen Bezügen
benötigen Format 21 und können von älteren Programmversionen nicht geöffnet werden.

## Auswählen und ändern

1. Das gewünschte CAD-Teil auswählen und **Merkmalsbezüge für den KI-Chat** öffnen.
2. **Fläche wählen**, **Bohrung wählen** oder **Kante wählen** verwenden und die
   betreffende Stelle im Modell anklicken. Skizzen und Konstruktionsmerkmale über
   die Auswahl beziehungsweise **Erhaltene Konstruktionsquellen** übernehmen.
3. Den Bezug benennen, bei mehrdeutigen Bohrungsquellen die richtige Quelle
   ausdrücklich bestätigen und **Speichern und an Chat anhängen** wählen.
4. Einen konkreten Auftrag eingeben, beispielsweise „Diese Bohrung auf 6 mm ändern“.
   Der Auftrag erlaubt ausschließlich die angehängten Merkmale und deren lokal
   ermittelte notwendige Abhängigkeiten.
5. Vorschau, native Messung und Liste der Folgeänderungen prüfen. Erst die
   entsprechende Übernahme-Schaltfläche ändert das Projekt. Ein Undo stellt die
   gesamte Änderung einschließlich der Zuordnungen wieder her.

Ein Klick auf den Bezug im Chat zeigt seine native Kontur im Modell. Bezüge im
Modell und in der Liste werden gemeinsam hervorgehoben. Gesperrte Quellen und
unbeteiligte Körper bleiben erhalten. Frei formulierte Skripte oder allgemeine
Lösch-/Ersetzungsbefehle können den begrenzten Merkmalsauftrag nicht erweitern.

## Grenzen und verlorene Zuordnungen

Nach einer Geometrieänderung kann ein Bezug veraltet sein. **Neu zuordnen** verlangt
eine bewusste neue Auswahl; die Anwendung rät keine ähnliche Nachbarfläche.
Eine alte Chatnachricht behält ihre ursprüngliche Zuordnung und erhält durch
das Neuzuordnen desselben Namens keine neue Änderungsberechtigung.

Unterstützte numerische Eigenschaften werden je Quelle angezeigt. Der native
Flächenversatz ist auf geeignete ebene und zylindrische Flächen begrenzt; auch dort
kann die Nachbargeometrie eine Operation verhindern. Eine Bohrungsänderung braucht
eine eindeutig erhaltene editierbare Zylinderquelle. Statische Importkörper können
als Referenz dienen, erhalten dadurch aber keine erfundene Konstruktionshistorie.
Netzflächen verwenden eigene Netzwerkzeuge und liefern keinen analytischen CAD-Beweis.

Gemeinsam verwendete Projektparameter können weitere gebundene Quellen ändern.
Diese Folgeänderungen werden vor der ausdrücklichen Übernahme aufgelistet.
Bei Flächenoperationen bleiben Parameter und abgeleitete Konturen an der exakt
erhaltenen Originalquelle. Verlorene Markierungs-, Arbeitsflächen- oder Maßbezüge
erscheinen als Diagnose und müssen bei Bedarf neu zugeordnet werden.

## Lokale Windows-Prüfausgabe und Signatur

`node scripts/package-feature-references.mjs r1` verlangt eine eingerichtete
Signieridentität. Der explizite Aufruf mit `--candidate-only` erzeugt stattdessen
einen getrennten Ordner `output/KI-Merkmale-Testkandidat-v0.109.0-r1` samt
`NICHT-FREIGEGEBEN.txt`. Dieser technische Testkandidat ist unsigniert und erhält
keine signierte Freigabe. Siehe [Signaturvorbereitung](WINDOWS-SIGNATUR.md).
