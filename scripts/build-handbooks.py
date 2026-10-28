"""Reproducible German manuals, based on released 0.12.1 CAD / 0.13.3 mesh.

Screenshots: work/handbuch-2026-10-13/{cad,netz}; no user profiles required.
Run with the bundled Python runtime (reportlab, pypdf, Pillow).
"""
from pathlib import Path
import html, re, json, hashlib, shutil
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle, Image, KeepTogether, Flowable
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader
from PIL import Image as PILImage, ImageOps, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'work/handbuch-2026-10-13'
OUT=ROOT/'output/pdf'
NETZ=ROOT.parent/'formnaro-netz'
W,H=A4; M=18*mm; WIDTH=W-2*M
for name,fn in [('Body','segoeui.ttf'),('Bold','segoeuib.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/fn)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')
INK=colors.HexColor('#173443'); TEAL=colors.HexColor('#087f91'); PALE=colors.HexColor('#eef6f8')
styles={
 'p':ParagraphStyle('p',fontName='Body',fontSize=10.6,leading=15.3,textColor=INK,spaceAfter=8,allowWidows=0,allowOrphans=0),
 'h':ParagraphStyle('h',fontName='Bold',fontSize=23,leading=28,textColor=TEAL,spaceAfter=15,keepWithNext=True),
 'sub':ParagraphStyle('sub',fontName='Bold',fontSize=13,leading=18,textColor=INK,spaceBefore=10,spaceAfter=6,keepWithNext=True),
 'note':ParagraphStyle('note',fontName='Body',fontSize=10.2,leading=14.5,textColor=INK,backColor=PALE,borderPadding=10,spaceBefore=8,spaceAfter=14),
 'cap':ParagraphStyle('cap',fontName='Body',fontSize=8.6,leading=12,textColor=colors.HexColor('#536c79'),spaceBefore=5,spaceAfter=12),
 'cell':ParagraphStyle('cell',fontName='Body',fontSize=9.5,leading=13,textColor=INK),
 'bullet':ParagraphStyle('bullet',fontName='Body',fontSize=10.6,leading=15.3,textColor=INK,leftIndent=14,firstLineIndent=-14,spaceAfter=5),
}

def common(kind):
    cad=kind=='cad'
    return [
('Ansicht und Auswahl', '''Rechts ziehen dreht die Ansicht. Mit gedrückter mittlerer Maustaste verschiebst du sie; das Mausrad zoomt. Das Modell bleibt dabei unverändert. **Oben**, **Vorn** und **Rechts** helfen beim genauen Platzieren. Das Haussymbol stellt die Startansicht wieder her. **F** passt die Auswahl oder, ohne Auswahl, das sichtbare Modell ein.

**Linksklick** wählt ein Teil. **Umschalt + Klick** ergänzt oder entfernt ein Teil in der Auswahl. Ziehe auf einer freien Stelle mit der linken Maustaste einen Rahmen auf. Der Rahmen berücksichtigt die projizierten Objektgrenzen; ein Teil muss nicht vollständig im Rahmen liegen. Im Objektbaum kannst du auch kleine, verdeckte oder verschachtelte Teile gezielt anwählen.

### Mehrere Teile sicher bearbeiten

1. Prüfe im Objektbaum, welche Teile markiert sind.
2. Sperre Teile, die unverändert bleiben sollen.
3. Verwende den passenden Befehl, etwa Ausrichten oder Gruppieren.
4. Kontrolliere das Ergebnis von oben und von der Seite.

**Ausblenden** schafft Platz in der Ansicht. **Sperren** schützt vor einer Änderung. Ein gesperrter oder ausgeblendeter Container wirkt auch auf seine enthaltenen Teile. Zum Entsperren oder Einblenden den Eintrag im Objektbaum verwenden.

> Ansicht, Objektfarbe und schraffierte Bohrungsanzeige helfen bei der Orientierung. Ein dargestellter Ausschnitt wird erst durch Gruppieren tatsächlich aus dem Körper herausgerechnet.'''),
('Maße, Position und Griffe', '''Alle Modellmaße sind in **Millimetern**, Drehwinkel in **Grad**. Wähle ein einzelnes Teil und bearbeite im Eigenschaftenbereich **Abmessungen**, **Position** und **Drehung**. Dezimalkomma ist in den direkten Maßfeldern möglich. Mit Enter bestätigst du eine Eingabe.

Die Abmessungen gehören zu den **lokalen Formachsen**. Ein gedrehtes Teil hat deshalb andere lokale Maße als seine sichtbaren Weltgrenzen. Die Positionsfelder beziehen sich auf den Mittelpunkt im jeweils angezeigten Koordinatensystem. Beachte die Beschriftung am Feld.

### Direkt auf der Fläche

- **T** aktiviert Verschieben, **S** Größe und **R** Drehen.
- Weiße Eckgriffe ändern Breite und Tiefe; ein Klick öffnet editierbare Maßfelder.
- Der Höhengriff ändert die Höhe. Der dunkle Hebegriff verschiebt das Teil entlang der Arbeitsebenennormale.
- Beim Ändern der Größe bleiben die gegenüberliegende Ecke und der lokale Boden stehen.
- **Proportionen beibehalten** eignet sich für eine gleichmäßige Größenänderung.

Das Raster unten in der Ansicht legt den Verschiebeschritt fest. Für kleine Korrekturen einen kleineren Rasterfang wählen. Genaue Werte direkt eintippen; die Rasterlinien allein sind keine Maßprüfung.

> Eine Skalierung verändert auch konstruktive Details. Bei einem Gewinde oder Zahnrad zuerst die Formparameter einstellen. Anschließend die abgeleiteten Maße prüfen.'''),
('Körper, Bohrung und Gruppen', '''Ein **Körper** fügt Material hinzu. Eine **Bohrung/Lochform** entfernt Material aus den ausgewählten Körpern. Lochformen werden schraffiert dargestellt; in überdeckten Bereichen wird die Fläche dunkler.

### Eine Bohrung herstellen

1. Einen Quader als Körper platzieren.
2. Einen Zylinder hinzufügen und auf **Bohrung/Loch** umstellen.
3. Den Zylinder durch die gesamte Plattendicke führen. Er darf über beide Seiten hinausragen.
4. Körper und Zylinder gemeinsam auswählen.
5. **Gruppieren** oder **Strg + G** ausführen.

Die Gruppe enthält weiterhin beide ursprünglichen Formen. **Auflösen** oder **Strg + Umschalt + G** trennt ihre Quellen wieder. **Schnittmenge** behält nur den gemeinsamen Bereich positiver Körper. Sie ist bei mindestens zwei geeigneten ausgewählten Körpern erreichbar.

**Bündeln** organisiert Teile, ohne sie geometrisch zu vereinigen. Das eignet sich etwa für Gehäuse und Deckel, die getrennt exportiert oder später unabhängig bewegt werden sollen.

Wenn kein Loch entsteht, kontrolliere Auswahl, Lochstatus und tatsächliche Überlappung von der Seite. Bei Fehler oder Abbruch bleibt der bestätigte Modellstand erhalten. Große oder komplexe Modelle können merklich länger rechnen.

> Lose Bohrungsformen sind Schneidwerkzeuge. Zum Export eines fertigen Ausschnitts zuerst mit dem betreffenden Körper gruppieren.'''),
('Quellen nachträglich bearbeiten', '''Klappe eine Gruppe im Objektbaum auf und wähle ihre ursprüngliche Form oder Bohrung. Der Eigenschaftenbereich zeigt den Pfad zur gewählten Quelle. Jetzt kannst du Maße, Position, Drehung und die verfügbaren Formparameter ändern. Das fertige Gruppenergebnis wird neu berechnet.

[[image:02-quellen|Eine Bohrungsquelle ist ausgewählt. Die hervorgehobene Ausgangsform lässt sich ändern; „Zur fertigen Gruppe“ beendet die Quellenbearbeitung.]]

**Zur fertigen Gruppe** kehrt zum Ergebnis zurück. **Quelle unterdrücken** schaltet eine Quelle vorübergehend aus, ohne sie zu löschen. Das hilft, mehrere Varianten eines Ausschnitts zu vergleichen.

Quellen können auch in verschachtelten Gruppen liegen. Wähle deshalb im Baum genau den Eintrag, den du ändern möchtest. Gesperrte Quellen oder übergeordnete Container müssen vor einer Änderung entsperrt werden.

**Esc** verwirft eine laufende Bearbeitung oder Berechnung. Rückgängig/Wiederholen beziehen sich auf bestätigte Änderungen. Während einer laufenden Vorschau wird beim Sichern der letzte bestätigte Hauptstand verwendet.

> Ein importiertes fertiges STL- oder STEP-Teil erhält dadurch keine ursprüngliche Konstruktionshistorie. Seine vorhandene Geometrie kann als Quelle für neue Gruppen dienen.'''),
('Ausrichten, Spiegeln und Anordnen', '''Wähle mindestens zwei Teile und öffne **Ausrichten** mit **L**. Die Markierungen stehen je Achse für Minimum, Mitte und Maximum. Wenn ein bestimmtes Teil stehen bleiben soll, klicke es als feste Referenz an. Wähle danach die gewünschte Markierung. Kontrolliere die Vorschau und beende das Werkzeug mit einem Klick auf eine freie Stelle.

[[image:06-ausrichten|Ausrichten mit zwei ausgewählten Teilen. Die Referenz und das Koordinatensystem bestimmen, welche Grenzen zusammenfallen.]]

**Spiegeln** öffnest du mit **M**. Prüfe die gewählte Achse und ob ein Original erhalten bleiben soll. Eine Spiegelung ändert die Orientierung; für beschriftete Teile vorher überlegen, ob die Schrift gespiegelt werden soll.

### Wiederholte Teile

**Strg + D** erzeugt eine Kopie. Verschiebe sie um den gewünschten Abstand. Die Wiederholungsfunktion des Duplizierens eignet sich für einfache Reihen. Für kontrollierte Muster nutze **Anordnen**: Reihe, rechteckiges Raster oder Kreis. Stelle Anzahl, Abstand beziehungsweise Radius und Winkelbereich ein. Bei einem Kreis bestimmt **Mitdrehen**, ob die Kopien radial ausgerichtet werden.

> Kopien sind eigenständige Teile. Eine spätere Parameteränderung am Original ändert die Kopien nicht automatisch.'''),
('Arbeitsebene, Magnet und Absetzen', '''Mit **W** oder **Arbeitsebene setzen** aktivierst du die Flächenauswahl. Klicke auf eine passende Körperfläche. Die neue Ebene übernimmt Treffpunkt und Orientierung; sie kann schräg oder senkrecht liegen. **Grundebene** setzt sie zurück.

Der Umschalter in der Ansicht zeigt **Arbeitsebene U/V/N** oder **Weltachsen X/Y/Z**. U und V liegen in der Arbeitsebene, N steht senkrecht darauf. Wähle das System bewusst, bevor du verschiebst, ausrichtest, spiegelst oder Maße beurteilst. Eine referenzierte Ebene folgt ihrem Bezugsobjekt; bei verlorener Referenz bleibt die letzte räumliche Lage erhalten.

### Neue und vorhandene Teile platzieren

Eine neue Form lässt sich aus der Bibliothek auf eine vorhandene Fläche ziehen. Ohne Flächentreffer gilt die aktive Arbeitsebene. Ein Bibliotheksklick setzt die Form auf die aktive Ebene.

Für ein bereits vorhandenes fertiges Teil aktiviere **Magnet**, ziehe es auf eine andere geeignete Fläche und kontrolliere die Vorschau. Loslassen übernimmt die Platzierung; **Esc** verwirft sie. **Absetzen** mit **D** legt eine ausgewählte Form auf die aktive Ebene, ohne sie dort konstruktiv festzubinden.

> Normales Verschieben vorhandener Teile setzt sie nicht automatisch auf eine fremde Fläche. Nach dem Platzieren Höhe und Ausrichtung von der Seite prüfen.'''),
('Lineal, Messen und Passungen', '''Aktiviere **Lineal** und klicke einen Ursprung auf der Arbeitsebene oder dem Modell an. Kanten- und Mittelpunktbezug helfen bei unterschiedlichen Aufgaben. Die eingeblendeten Abstände können direkt bearbeitet werden. So platzierst du etwa eine Bohrung mit einem festen Randabstand.

Mit **Messen** wählst du zwei Punkte auf den Körpern. Das Werkzeug zeigt den Abstand. Liegen die Punkte auf zwei verschiedenen geeigneten beweglichen Körpern, kann der Abstand bearbeitet werden. Eine gesperrte Referenz wird dabei nicht verschoben. Miss aus einer passenden Ansicht und kontrolliere, dass der tatsächlich gewünschte Punkt getroffen wurde.

### Spiel für passende Teile

**Passung …** hilft beim Erzeugen einer passenden Lochform oder beim Einstellen eines Spiels. Beachte, ob ein Wert **je Seite** oder als Gesamtmaß angegeben ist: 0,2 mm je Seite vergrößert einen Durchmesser um insgesamt 0,4 mm.

Für ein gedrucktes Steckteil zunächst ein kleines Passungsstück herstellen. Material, Druckrichtung, Slicer und Drucker beeinflussen das reale Ergebnis. Die geometrisch eingestellte Passung ist kein gemessener Druckerfolg.

> Bei gedrehten Teilen können lokale Maße, Weltgrenzen und eine gemessene Punktdistanz verschieden sein. Verwende die Größe, die zu deiner Aufgabe passt.'''),
('Grundformen und Formparameter', '''Die Bibliothek enthält 23 Grundformen: Quader, Zylinder, Kugel, Kegel, Pyramide, Dach, Keil, Sechseck, Dreieck, Rohr, Ring, Kapsel, Stern, Herz, Zahnrad, Text, Rundquader, Halbkugel, Gewinde, Gewindemutter, Senkbohrung, Gehäuse und Polygon.

Suche nach dem Namen oder wähle das Vorschausymbol. Die jeweiligen **Formparameter** beschreiben die Form genauer als eine bloße Skalierung. Beim Rohr beispielsweise Innenöffnung oder Wand, beim Ring Innen-/Außengröße und Ringdicke, beim Polygon die Seitenzahl.

[[image:05-parameter|Ein ausgewählter Zylinder und seine Eigenschaften. Weitere Maße und Parameter liegen im scrollbaren Eigenschaftenbereich.]]

Bei Quader und Rundquader lassen sich Radius oder Fase sowie die angebotene Kantenwahl einstellen. Zylinder und Rohr haben ihre eigene Randform. Wenn eine Parameteränderung abgewiesen wird, wähle einen kleineren Wert und prüfe die vorhandenen Wand- und Detailgrößen.

Ändere eine Form zuerst über ihre Parameter, danach bei Bedarf über die Gesamtgröße. Bei einer gruppierten Form die entsprechende Quelle im Objektbaum auswählen.'''),
('Zahnräder, Gewinde und Muttern', '''Beim **Zahnrad** bestimmen unter anderem Modul, Zähnezahl, Eingriffswinkel, Spiel, Bohrung und die angebotenen Schrägungswerte das Ergebnis. Stelle diese Parameter vor einer Größenänderung ein. **Originalgröße** stellt die aus den Parametern berechnete Größe wieder her.

Bei **Gewinde**, **Gewindemutter** und Gewindeloch wählst du zuerst eine Vorlage oder die angebotenen eigenen Maße. Prüfe Außendurchmesser, Steigung, Länge, Drehrichtung, Profil und Spiel. Ein Lochgewinde ist ein Schneidwerkzeug und muss mit dem Zielkörper gruppiert werden.

### Ein zusammenpassendes Paar vorbereiten

1. Gewinde und Mutter mit derselben Nenngröße und Steigung anlegen.
2. Beide in Originalgröße belassen.
3. Das benötigte Passungsspiel einstellen.
4. Teile räumlich trennen und als Projekt speichern.
5. Ein kurzes Testpaar drucken und erst danach die endgültige Länge festlegen.

Ungleichmäßiges Skalieren kann eine runde Bohrung oval machen und die Steigung verändern. Verwende für technische Anpassungen die dafür vorgesehenen Formparameter.

> Die Modellierung ersetzt keine mechanische Auslegung. Belastbarkeit, Verschleiß und eine reale Normpassung müssen am vorgesehenen Einsatz geprüft werden.'''),
('Text, SVG, Farben und Notizen', '''Wähle **Text**, gib den Inhalt ein und wähle eine Schrift. Der Katalog bietet **64 mitgelieferte Schriften und Schriftschnitte**, die offline funktionieren. Suche nach dem Namen und kontrolliere die Vorschau. Eigene **TTF-/OTF-Dateien** lassen sich importieren.

Textkörper bleiben nach dem Entfernen einer Schrift sichtbar, speicherbar und exportierbar. Um den Inhalt später neu aufzubauen, muss die Originalschrift verfügbar sein oder eine andere Schrift gewählt werden. Eigene Schriften werden portabel in **Daten** gespeichert. Die Verwaltung begrenzt den Import auf 50 Dateien, je 5 MB und zusammen 20 MB.

**SVG** importiert geeignete gefüllte Konturen als Extrusion. Kontrolliere Maße und Höhe nach dem Import. Sehr kleine Inseln und schmale Buchstabenstege können beim Druck verloren gehen. Ein Text als Bohrung ergibt eine Gravur; als Körper ergibt er erhabene Schrift.

Farben und Deckkraft helfen beim Modellieren. **Quellenfarben erhalten** erlaubt bei geeigneten Gruppen eine getrennte Farbaufteilung. Ein reiner Farbwechsel verändert die Außenform nicht. Ob Farben im Export enthalten sind, hängt vom Dateiformat ab.

**Notizen** speichern etwa Zweck, Druckmaterial und gewünschtes Spiel am Objekt. Sie sind keine Maßabhängigkeiten: „Wand 2 mm“ in einer Notiz ändert die Geometrie nicht.'''),
('Layer, Ordner, Favoriten und Vorlagen', '''**Layer** und **Ordner** organisieren Teile. Lege eine verständliche Struktur an, etwa „Gehäuse“, „Deckel“ und „Bohrungen“. Wähle Teile und nutze **Auswahl zuordnen …**. Aktiver Layer und aktiver Ordner bestimmen, wo neue Teile eingeordnet werden.

Ein Container kann gesperrt oder ausgeblendet werden. Das schützt beziehungsweise verbirgt seine enthaltenen Teile. Eine Ordnerzuordnung vereinigt keine Körper; dafür dient Gruppieren. Ein Bündel hält Teile organisatorisch zusammen.

Mit Rechtsklick auf eine Form setzt oder entfernst du einen **Favoriten**. Die Favoritenansicht verkürzt die Suche nach häufig benutzten Formen.

### Eine eigene Vorlage anlegen

1. Die gewünschte Form oder Gruppe auswählen.
2. In der Vorlagenverwaltung die Auswahl als Vorlage speichern.
3. Einen eindeutigen Namen vergeben.
4. Bei Bedarf benannte Maße und einfache Maßformeln definieren.
5. Die Vorlage mit zwei verschiedenen Werten ausprobieren.

Vorlagen können etwa Breite, Höhe oder Bohrungsabstand als Eingabe anbieten. Die Formel wirkt beim Erzeugen des Teils. Sie ist keine allgemeine laufende Zwangsbedingung zwischen allen Objekten. Gespeicherte Vorlagen gehören zu den portablen Daten.

> Vorlagen der Netz- und CAD-Ausgabe enthalten unterschiedliche Geometrie. Verwende sie in der Ausgabe, in der sie angelegt wurden.'''),
('Schnittansicht und Modellprüfung', '''Mit **Schnittansicht** schaust du in das Modell. Wähle Richtung und Schnittlage. Die Ansicht hilft bei verdeckten Bohrungen, Wandstärken und ineinander liegenden Teilen. Sie ist eine Darstellung; das Projekt wird dadurch nicht abgeschnitten.

**Modell prüfen** liefert die angebotenen Informationen zu Volumen, möglichen Kollisionen und Wandstärken. Nach einer Geometrieänderung erneut prüfen, weil ein älterer Bericht einen früheren Stand beschreibt.

Die Wandstärkenprüfung ist eine **Stichprobe**. Sie beweist nicht, dass jede Stelle eines komplizierten Körpers die Mindestdicke einhält. Dünne Schriftstege, scharfe Spitzen und kleine Inseln zusätzlich aus passenden Ansichten prüfen.

### Vor dem Druck

- Fertige Gruppen statt lose Bohrungsformen exportieren.
- Unterseite, Öffnungen und getrennte Teile von mehreren Seiten kontrollieren.
- Wandstärken und Spiel passend zu Material und Druckverfahren wählen.
- Den Export im Slicer öffnen und Maße, einzelne Schichten sowie Zahl der Körper prüfen.

Ein mathematisch gültiges Modell kann für den Druck ungeeignet sein. Auflagefläche, Überhänge und Montagezugang bleiben praktische Konstruktionsentscheidungen.'''),
('Oberfläche und portable Einstellungen', '''Das Zahnrad öffnet **Einstellungen**. Unter Allgemein stehen unter anderem Sprache, Hell/Dunkel/Windows, Autosicherung und der Zugang zu Fehlerprotokollen sowie Impressum/Lizenz. Modellierungseinstellungen umfassen Rasterfang, Drehfang und Griffgröße.

[[image:03-einstellungen|Die Einstellungen der jeweiligen Ausgabe. Werte und Layouts gehören zu diesem Programmordner.]]

Die Pfeile an den Seitenleisten klappen sie ein. Ziehe den Innenrand, um die Breite anzupassen. Die Trennleisten an Formenliste und KI-Chat verändern die Höhe. **Doppelklick** auf eine Trennleiste stellt die Standardgröße her. Fokussierte Trennleisten lassen sich mit Pfeiltasten bedienen; Umschalt vergrößert den Schritt, Esc verwirft eine laufende Änderung.

Unter **Einstellungen > Oberfläche** lassen sich die Seiten tauschen und benannte Layouts verwalten. Im Anordnungsmodus können die angebotenen Bereiche und Werkzeugtaster an ihre Andockplätze gezogen werden. Prüfe die Vorschau und übernimm oder verwirf sie.

Die aktive Anordnung und benannte Layouts liegen in **Layouts** neben der EXE. Einstellungen, Vorlagen, Favoriten und Autosicherung liegen in **Daten**. Beim Update oder PC-Wechsel beide Ordner sowie die eigenen Projekte übernehmen.'''),
('Formenpakete und Funktions-Plugins', '''Unter **Einstellungen > Plugins** gibt es getrennte Bereiche für **Formenpakete** und **Funktions-Plugins**.

Ein Formenpaket ergänzt lokale Formen und Vorlagen in der Bibliothek. Lade die passende JSON-/OCPlugin-Datei, prüfe Name und Inhalt und aktiviere das Paket. Ein bereits platziertes Teil bleibt erhalten, wenn das Paket später deaktiviert oder entfernt wird.

Funktions-Plugins erscheinen unter **Funktionen**. Die unterstützten Pakete benennen vorhandene Werkzeuge. Sie führen keine fremden JavaScript-Dateien aus. Ein Paket kann nur Werkzeuge aufrufen, die in deiner Ausgabe verfügbar sind.

### Ein Paket ausprobieren

1. Ein neues, leeres Projekt verwenden.
2. Paket laden und aktivieren.
3. Eine enthaltene Form hinzufügen oder Funktion aufrufen.
4. Maße und angebotene Parameter prüfen.
5. Das Testprojekt separat speichern.

Formen- und Funktionspakete werden in den portablen Daten verwaltet. Bei einer Weitergabe nur selbst freigegebene Pakete beilegen. Vorhandene Modelle und Anbieterzugänge gehören nicht automatisch in ein Weitergabepaket.'''),
('KI-Chat und lokale Verbindung', '''Über **KI** öffnest du den Chat. Er kann neue Teile entwerfen oder gezielt vorhandene Teile und Gruppenquellen ändern. Bilder lassen sich als Vorlage anhängen. Beschreibe die gewünschten Maße und sage klar, welche Teile und Maße erhalten bleiben sollen.

Unter **Einstellungen > KI / API** wählst du Anbieter und Modell und richtest deinen eigenen Zugang ein. Cloud-Anfragen benötigen den passenden Anbieterzugang. Beim Senden werden Nachricht, Verlauf, Bilder und Modellkontext an den eingestellten Anbieter übertragen. Ein Chat-Abonnement ist kein Nachweis für ein verfügbares API-Guthaben.

### Einen Vorschlag verwenden

1. Das gewünschte Teil beziehungsweise die Quelle auswählen.
2. Die Änderung konkret beschreiben, zum Beispiel: „Nur die Höhe auf 12 mm ändern; Breite, Tiefe und Unterseite erhalten.“
3. Den Vorschlag und genannte Annahmen prüfen.
4. Die Vorschau von mehreren Seiten ansehen.
5. **Übernehmen** oder **Verwerfen** wählen.

Erst Übernehmen ändert das Modell und erzeugt einen Rückgängig-Schritt. Fehlgeschlagene Anwendung und Übernehmen/Verwerfen werden dem Chat zurückgemeldet.

Die **lokale KI-Schnittstelle** ist unabhängig vom Cloudzugang. Kontext und Szene lesen, gegen die aktuelle Revision eine Vorschau erzeugen und anschließend übernehmen. Der in der Zielanwendung angezeigte Verbindungspfad ist maßgeblich. Der optionale Python-Client benötigt Python 3.10 oder neuer; die normale Anwendung nicht.'''),
]

def sections(kind):
    cad=kind=='cad'
    start=('Start und aktueller Stand',('''Dieses Handbuch beschreibt die **ausgelieferte Formnaro-CAD-Version 0.12.1**, einschließlich Schnitt-Fix und lokalem **STL-Konverter 0.6**. Der aktuelle Quellstand 0.12.2 mit Konverter 0.10 befindet sich noch in der Abnahme. Die dazugehörigen neuen Bearbeitungsfunktionen sind im Anhang gesondert beschrieben.

CAD-Körper werden mit dem nativen Open-CASCADE-Kern berechnet. Die Dreiecke auf dem Bildschirm dienen zur Anzeige. Maße, Körperoperationen, ausgewählte CAD-Kanten und STEP-Ausgaben beziehen sich auf die CAD-Geometrie.

''' if cad else '''Dieses Handbuch beschreibt **Formnaro Netz 0.13.3**, die eigenständige Netz-Ausgabe. Sie führt die frühere Netzmodellierung weiter und bietet die aktuellen Projekt-, Quellen-, Schrift-, Layout- und KI-Funktionen.

Netze bestehen aus Dreiecken. Die Modellierung verwendet Manifold. Seit 0.13.3 berechnen Quellen- und Parameteränderungen nur die betroffene Gruppe; unbeteiligte Netze werden weiterverwendet. Speichern, Autosicherung, Laden und Undo vermeiden zusätzliche vollständige Netzkopien. Die eingestellte Modellqualität bleibt erhalten.

''')+'''### Starten

1. Die portable ZIP **vollständig entpacken**.
2. Im enthaltenen Programmordner **'''+('Formnaro.exe' if cad else 'Formnaro Netz.exe')+'''** starten.
3. Die Dateien neben der EXE und den Ordner **resources** zusammenlassen.
4. Mit **Neu** ein Projekt beginnen oder eine passende .ocad-Datei öffnen.

Die Konstruktion funktioniert offline. Für die fertige Windows-Ausgabe sind weder Node.js noch Python oder ein Cloudschlüssel nötig.

> Netz und CAD sind getrennte Ausgaben. Beide verwenden .ocad als Dateiendung, aber unterschiedliche Projektformate. Prüfe beim Öffnen und bei einer lokalen KI-Verbindung immer die Zielausgabe.''')
    ui=('Oberfläche und erste Schritte', '''Die Kopfzeile enthält Projektname, Neu, Öffnen, Speichern, Projekte, Import, Export, KI und Einstellungen. Darunter liegen die Modellierwerkzeuge, etwa Duplizieren, Gruppieren, Ausrichten und Absetzen.

[[image:01-oberflaeche|Aktuelle Oberfläche mit einer Beispielplatte. Das Bild stammt aus der ausgelieferten Ausgabe und verwendet ausschließlich ein Beispielmodell.]]

''' + ('''Standardmäßig stehen die Formen links und die Eigenschaften rechts. Der Objektbaum liegt unter der Formenbibliothek. Der KI-Chat sitzt in der rechten Leiste. Ein gespeichertes Layout kann die Seiten vertauschen.

''' if cad else '''Standardmäßig stehen Eigenschaften links sowie Formen und Objektbaum rechts. Die erste Formenreihe enthält schraffierte Bohrungsformen. Körper und Bohrung lassen sich im Eigenschaftenbereich über die großen kreisförmigen Schaltflächen wählen. Ein gespeichertes Layout kann die Seiten vertauschen.

''')+'''Klicke eine Form an oder ziehe sie auf die Arbeitsfläche. Wähle das Teil und trage die gewünschten Maße ein. Benenne das Projekt und speichere früh eine eigene Datei. Ein Projektname allein bedeutet noch nicht, dass eine Projektdatei gespeichert wurde.

Über **Beispiel laden** kannst du eine Platte mit vier Bohrungen ausprobieren. Speichere ein wichtiges eigenes Projekt vorher. Die Bilder in diesem Handbuch zeigen einen isolierten Beispielstand; die Seitenanordnung in deinem Fenster kann abweichen.''')
    saves=('Projekte, Speichern und Autosicherung', '''**Strg + S** speichert das Projekt. Für einen neuen Namen oder Speicherort **Speichern unter …** im Bearbeiten-/Dateibereich verwenden. '''+('In der CAD-Ausgabe öffnet auch **Strg + Umschalt + S** diesen Dialog. ' if cad else '')+'''Wiederholtes Speichern aktualisiert die geöffnete Datei. Erkennbare Änderungen durch ein anderes Programm werden vor dem Überschreiben gemeldet.

**Projekte** zeigt zuletzt verwendete Dateien und die Dateien im Projektordner. **Projektordner öffnen** führt zum Ordner im Explorer. Neue Dateien werden standardmäßig in **Projekte** neben der EXE gespeichert; im Dialog kannst du einen anderen Ort wählen.

'''+('''CAD speichert **Projektformat 5**: Formrezepte, Quellen, Transformationen und BRep-Körper. Frühere Netzprojekte der Formate 1-4 werden in der nativen CAD-Ausgabe nicht automatisch konvertiert. Zum Bearbeiten dieser Dateien die passende Netz- oder ältere Ausgabe verwenden.

''' if cad else '''Netz liest **Projektformate 1-3** und speichert **Format 4**. CAD-Format 5 wird mit einer Erklärung abgewiesen. Seit 0.13.2 zeigen die Projektkarten **kleine Modellbilder**. Neue Dateien enthalten die Vorschau; bei älteren passenden Netzdateien wird sie beim Anzeigen berechnet, ohne die Datei oder das geöffnete Modell zu verändern.

''')+'''Die Projektdatei bewahrt auch den Arbeitsplatz, unter anderem Ansicht, Projektion und passende Oberflächeneinstellungen. Beim Projektwechsel kannst du Änderungen speichern, verwerfen oder den Wechsel abbrechen.

**Autosicherung** liegt in Daten und verwendet bestätigte Modellstände. Sie hilft nach einem Abbruch, ersetzt aber keine bewusst gespeicherte .ocad-Datei und keine eigene Sicherungskopie.''')
    imports=('Import: passende Dateien verwenden', ('''**STEP/STP** importiert CAD-Körper. Diese lassen sich als Quellen für weitere CAD-Operationen nutzen. Die ursprünglichen Formparameter eines fremden CAD-Programms werden dadurch nicht wiederhergestellt.

**STL** bietet eine Netzreferenz oder eine CAD-Rekonstruktion. Eine Netzreferenz ist sichtbar, verschiebbar, drehbar, skalierbar, ausblendbar, sperrbar und im Projekt speicherbar. Sie nimmt nicht an CAD-Gruppen, freien Kantenoperationen und Produktionsausgaben teil. Für solche Schritte zuerst einen geprüften CAD-Körper rekonstruieren.

**OBJ** wird ebenfalls als Netzreferenz importiert. **SVG** erzeugt geeignete extrudierte CAD-Konturen. Prüfe Einheit, Größe und Höhe im Importdialog.

### STL als CAD

Unter **Import > STL als CAD-Körper rekonstruieren** steht der lokale Konverter zur Verfügung. Prüfe Einheit, Toleranz, Reparatur und Verfahren. Ein Ergebnis kann glatte oder facettierte Flächen besitzen. Facettierte Rundungen erhalten nicht automatisch ihren ursprünglichen Radius.

Offene, ungeeignete oder zu aufwendige Netze können abgewiesen werden. Das Original bleibt erhalten. Erst die geprüfte Übernahme fügt einen CAD-Körper hinzu.

> Die im Bericht genannte Abweichung beschreibt die jeweilige Prüfung. Eine Stichprobe ist kein vollständiger Nachweis, dass die gesamte Originaloberfläche innerhalb derselben Grenze liegt.''' if cad else '''**STL** und **OBJ** importieren geeignete geschlossene Netze. **SVG** importiert gefüllte Konturen als Extrusion. Prüfe die angebotene Einheit und die tatsächlichen Maße unmittelbar nach dem Import. STL enthält keine verlässliche Einheit; ein Millimeter-/Zollfehler kann die Größe um den Faktor 25,4 verändern.

Die **optionale Netzreparatur** verarbeitet bis **40.000 Dreiecke**. Sie kann typische Probleme an einer geeigneten Netzoberfläche behandeln. Kleine Lücken nur dann schließen lassen, wenn du die entstehende Fläche tatsächlich möchtest. Kontrolliere das Ergebnis aus mehreren Ansichten.

Größere geschlossene Netze lassen sich direkt **ohne Reparatur** importieren. Ein höherer Dreiecksumfang erhöht Datei-, Speicher- und Berechnungsaufwand. Ein offenes Netz wird dadurch nicht automatisch zu einem brauchbaren Körper.

### Ein CAD-Modell übernehmen

STEP/STP und CAD-Format 5 gehören zur CAD-Ausgabe. Öffne das Teil dort und exportiere es als STL. Importiere anschließend die STL in Formnaro Netz. Du bearbeitest dann die Dreiecksgeometrie; CAD-Flächen und die ursprüngliche CAD-Quellenhistorie werden nicht mitübertragen.

> Speichere nach dem Import eine eigene .ocad-Datei. Die Originaldatei als unveränderte Ausgangsquelle behalten.'''))
    exports=('Export für Druck, CAD und Darstellung', '''Speichere vor dem Export das bearbeitbare **.ocad-Projekt**. Die Exportdatei enthält das fertige Ergebnis und ersetzt die Quellenhistorie nicht.

[[image:04-export|Exportdialog der jeweiligen Ausgabe. Format und Umfang bestimmen, welche Informationen mitgegeben werden.]]

| Format | Geeignet für |
| --- | --- |
| STL | Dreiecksgeometrie für 3D-Druck; keine Farben |
| OBJ | Geometrie für andere 3D-Programme; Materialien je Ausgabe beachten |
| 3MF | Getrennte Teile und Farben für passende Slicer |
| glTF | Farbige 3D-Darstellung |
| SVG | Zweidimensionale Projektion beziehungsweise Draufsicht |
'''+('''| STEP | Native CAD-Körper und mathematische Flächen |

CAD erzeugt für STL, OBJ, 3MF und glTF ein eigenes Exportnetz aus dem bestätigten CAD-Stand. Anzeige- und Exportqualität sind getrennt einstellbar. Standardmäßig beträgt die Anzeigeabweichung 0,02 mm bei 8°, der Druckexport 0,01 mm bei 5°. Eine Anzeigeänderung verändert die CAD-Geometrie nicht. OBJ mit Materialdatei wird als ZIP-Bündel gespeichert; SVG verwendet native CAD-Konturen und verdeckte Linien.

''' if cad else '''
Die Netz-Ausgabe exportiert die vorhandene Netzgeometrie. Eine höhere Darstellungsqualität erzeugt keine verlorenen ursprünglichen CAD-Kurven. STEP ist hier nicht verfügbar. SVG ist eine XY-Draufsicht; glTF verwendet seine passenden Darstellungskoordinaten.

''')+'''Wähle alle sichtbaren Körper oder nur die Auswahl. Lose Lochformen werden nicht als fertige Ausschnitte exportiert. Prüfe getrennte Teile, Farben und Maße anschließend im Zielprogramm.''')
    exercise=('Übung: Platte mit vier Bohrungen', '''Diese Übung funktioniert in beiden Ausgaben. Verwende ein **neues Projekt**, die Grundebene und Weltachsen. Alle Positionswerte beziehen sich auf die Formmitte.

| Teil | Größe X/Y/Z (mm) | Mittelpunkt X/Y/Z (mm) |
| --- | --- | --- |
| Platte, Quader | 60 / 40 / 6 | 0 / 0 / 3 |
| Bohrung 1, Zylinder | 5 / 5 / 10 | -22 / -12 / 3 |
| Bohrung 2, Zylinder | 5 / 5 / 10 | 22 / -12 / 3 |
| Bohrung 3, Zylinder | 5 / 5 / 10 | -22 / 12 / 3 |
| Bohrung 4, Zylinder | 5 / 5 / 10 | 22 / 12 / 3 |

1. Einen Quader hinzufügen und die Tabellenwerte eintragen. Seine Unterseite liegt auf Z = 0.
2. Einen Zylinder hinzufügen, auf **Bohrung/Loch** setzen und die Werte für Bohrung 1 eintragen.
3. Dreimal duplizieren und die übrigen Positionen setzen.
4. Von der Seite kontrollieren: Alle Zylinder gehen durch die ganze Platte.
5. Alle fünf Teile auswählen und gruppieren.
6. Als .ocad speichern und das Ergebnis als STL exportieren.

### Nachträglich ändern

Klappe die Gruppe auf. Wähle Bohrung 1 und ändere ihren Durchmesser von 5 auf 6 mm. Nur diese Bohrung soll größer werden. Rückgängig muss die Änderung wieder aufheben. Wähle anschließend **Zur fertigen Gruppe**.

Die beigefügten Beispielprojekte enthalten die jeweiligen eingebauten Montageplatten. Die Netz-Beispielplatte besitzt abweichende Außenmaße; die Tabelle oben beschreibt bewusst eine eigene Übung.''')
    enclosure=('Übung: offenes Gehäuse und Deckel', '''Konstruiere zunächst ein einfaches rechteckiges Gehäuse. Das Prinzip funktioniert mit Grundkörpern in beiden Ausgaben. Grundebene und Weltachsen verwenden.

| Teil | Größe X/Y/Z (mm) | Mittelpunkt X/Y/Z (mm) |
| --- | --- | --- |
| Außenkörper | 60 / 40 / 20 | 0 / 0 / 10 |
| Innenausschnitt, Lochquader | 56 / 36 / 20 | 0 / 0 / 12 |
| Deckelplatte | 60 / 40 / 2 | 80 / 0 / 1 |
| Steckrand außen | 55,6 / 35,6 / 3 | 80 / 0 / 3,5 |
| Steckrand innen, Lochquader | 51,6 / 31,6 / 5 | 80 / 0 / 4,5 |

1. Außenkörper und Innenausschnitt erzeugen. Der Ausschnitt beginnt auf Z = 2 und endet oberhalb des Gehäuses.
2. Beide gruppieren. Es entstehen 2 mm Boden und 2 mm Seitenwand.
3. Deckelplatte und die beiden Steckrandformen getrennt daneben erzeugen.
4. Zuerst **nur** Steckrand außen und innen gruppieren. Der Lochquader reicht über den Rand hinaus; seine Unterseite liegt auf Z = 2.
5. Erst danach den fertigen Steckrand mit der Deckelplatte gruppieren. So wird die Platte nicht unbeabsichtigt ausgeschnitten.
6. Gehäuse und Deckel als getrennte Teile speichern und exportieren.

Der Steckrand ist gegenüber der Gehäuseöffnung um 0,4 mm schmaler, also 0,2 mm Spiel je Seite. Für den Einsatz den Deckel wenden; für einen Probedruck liegt die Platte bereits auf der Grundebene. Prüfe das Spiel mit einem kurzen Teststück, bevor du das ganze Gehäuse druckst.''')
    issues=('Fehler finden und beheben', '''| Beobachtung | Nächster sinnvoller Schritt |
| --- | --- |
| Keine Bohrung im Export | Körper und Loch gemeinsam gruppieren; Auswahl kontrollieren |
| Teil hat falsche Größe | Import-Einheit und lokale Maße prüfen |
| Maße passen nach Drehen nicht | Lokale Maße mit Weltgrenzen unterscheiden; Koordinatensystem prüfen |
| Gruppierung dauert | Berechnung abwarten oder Esc; große Modelle benötigen mehr Zeit |
| Berechnung wird abgewiesen | Überlappung, kleine Details und gültige Ausgangskörper prüfen |
| Teil lässt sich nicht ändern | Sperre des Teils und seiner Container prüfen |
| Ein Werkzeug fehlt | Eigenschaftenbereich scrollen; Auswahl und Ausgabe prüfen |
| Text lässt sich nicht neu erzeugen | Originalschrift importieren oder andere Schrift wählen |
| KI-Anfrage schlägt fehl | Anbieter, Modell, Zugang und verfügbares API-Guthaben prüfen |
| Projekt lässt sich nicht öffnen | Projektformat und Zielausgabe vergleichen |

Unter **Einstellungen > Allgemein > Fehlerprotokolle öffnen** findest du die lokalen Diagnosen in **Daten/Fehlerprotokolle**. Benutzerabbruch wird nicht als Modellfehler gewertet. Vollständige Modelle und KI-Anfragen werden nicht protokolliert; erkennbare Zugangsdaten werden maskiert.

Für einen nachvollziehbaren Fehlerbericht notiere Programmversion, Aktion, Dateiformat und den genauen Meldungstext. Bewahre eine Kopie der Ausgangsdatei auf. Bei einem fehlgeschlagenen Vorschlag den bestätigten Stand prüfen, bevor du den nächsten Versuch beginnst.''')
    keys=('Maus und Tastenkürzel', '''Die Kürzel gelten im Modellierbereich. Während einer Texteingabe oder in einem Dialog haben die jeweiligen Felder Vorrang.

| Eingabe | Wirkung |
| --- | --- |
| Linksklick / Umschalt + Klick | Auswahl / Mehrfachauswahl |
| Links auf freier Fläche ziehen | Auswahlrahmen |
| Rechts ziehen | Ansicht drehen |
| Mittlere Maustaste ziehen | Ansicht verschieben |
| Mausrad / F | Zoom / Einpassen |
| T / S / R | Verschieben / Größe / Drehen |
| L / M / D | Ausrichten / Spiegeln / Absetzen |
| W | Arbeitsebene per Fläche setzen |
| Strg + A / Entf | Sichtbare Teile wählen / Auswahl löschen |
| Strg + D | Duplizieren |
| Strg + C / Strg + V | Kopieren / Einfügen |
| Strg + G | Gruppieren |
| Strg + Umschalt + G | Gruppe auflösen |
| Strg + Z / Strg + Y | Rückgängig / Wiederholen |
| Strg + Umschalt + Z | Wiederholen |
| Strg + S / Strg + O | Speichern / Öffnen |
'''+('''| Strg + Umschalt + S | Speichern unter … |
| Pfeiltasten / Bild auf, Bild ab | Bewegen in der Ebene / Höhe |
''' if cad else '''| H / Umschalt + H | Bohrung / Körper |
| Pfeiltasten | Schrittweise in X/Y bewegen |
| Strg + Pfeil auf/ab | Schrittweise in Z bewegen |
| Umschalt bei Pfeilbewegung | Größerer Schritt |
''')+'''| Esc | Aktive Bearbeitung, Vorschau oder Berechnung abbrechen |

Weitere Befehle findest du in den Werkzeugleisten und im Bearbeiten-Menü. CAD und Netz besitzen teilweise unterschiedliche Kürzel; diese Tabelle gilt für die auf dem Deckblatt genannte Ausgabe.''')
    backup=('Update, Sicherung und Grenzen', '''### Auf eine neue portable Ausgabe wechseln

1. Projekt als .ocad speichern und die bisherige Ausgabe schließen.
2. Den alten Programmordner als Rückfallkopie behalten.
3. Die neue ZIP in einen eigenen Ordner vollständig entpacken.
4. Eigene **Daten**, **Layouts** und **Projekte** aus derselben Ausgabelinie übernehmen. Auch Projekte an anderen Speicherorten separat sichern.
5. Neue EXE starten und ein passendes Projekt öffnen.
6. Maße, Bibliothek und Layout kontrollieren, bevor du die alte Kopie entfernst.

Die getrennte Netz-Ausgabe importiert keine fremden Profile oder Schlüssel automatisch. Windows-verschlüsselte Anbieterzugänge können auf einem anderen PC erneut eingegeben werden müssen. Die lokale KI-Verbindung anhand des Pfads in der Zielanwendung neu prüfen; Netz verwendet **offlinecad-netz**, CAD **offlinecad** als technischen Profilnamen.

### Grenzen

Keine Skizzenwerkstatt, beweglichen Baugruppen oder allgemeinen Zwangsbedingungen zwischen Teilen. Eigene Vorlagen mit Formeln sind begrenzte Erzeugungshilfen. Importierte Fertigteile enthalten keine verlorene ursprüngliche Historie. Laufzeiten hängen von Geometrie, Dreieckszahl, Dateigröße und Rechner ab.

Impressum und Lizenz sind unter Allgemein erreichbar. Eigener Anwendungscode: **MIT License**, auch für kommerzielle Nutzung, Änderungen und Weitergabe. Copyright- und Lizenzhinweis erhalten. Für Bibliotheken und Schriften gelten die beigefügten Originaltexte. Das Handbuch erläutert die Bedienung; für Nutzungsrechte den vollständigen Lizenztext lesen.

> Stand dieser Anleitung: 13. Oktober 2026. Historische Tinkoff-/OfflineCAD-Handbücher bleiben erhalten, beschreiben aber einen früheren Funktionsstand.''')
    core=common(kind)
    allsections=[start,ui,*core[:11],saves,imports,exports,*core[11:],exercise,enclosure,issues,keys,backup]
    if cad:
        allsections.insert(16,('CAD-Kanten und STL-STEP-Konverter', '''### Freie Kantenrundung und Fase

Wähle einen CAD-Körper und öffne **Kanten …**. Wähle die gewünschten Kanten einzeln oder per Rahmen, stelle Rundung beziehungsweise Fase ein und kontrolliere die Vorschau. Erst Übernehmen bestätigt das Ergebnis. Die Operation bleibt anschließend bearbeitbar.

Zu große Radien, kurze Kanten und komplizierte Nachbarflächen können eine gültige Operation verhindern. Einen kleineren Wert oder eine andere Auswahl verwenden. Geometrisch verlorene oder mehrdeutige Bezüge werden erklärt abgewiesen; sie werden nicht still auf eine andere Kante gesetzt. Auch bei dichten facettierten Körpern wird nicht jede Abrundung möglich.

### Ausgelieferter Konverter 0.6

Unter **Funktionen > STL → STEP** eine STL wählen. Einheit, Toleranz, Reparatur, Verfahren und Facettenrückfall prüfen. Dann konvertieren. Nach erfolgreicher Prüfung **STEP** und **Prüfbericht** speichern oder **Als CAD übernehmen** wählen.

Konvertieren und separates Speichern erhalten das aktuelle Projekt. Die CAD-Übernahme fügt einen geprüften Körper mit einem Projekt-Undo hinzu. Abbrechen beendet die laufende Konvertierung. Kleine Lücken werden nur nach zusätzlicher ausdrücklicher Auswahl geschlossen; das kann Oberflächen ergänzen.

Die Konvertierung arbeitet lokal ohne Python oder Cloudschlüssel. Den vollständigen Programmordner einschließlich **resources/converter** behalten. Schwierige Bereiche können facettiert bleiben. Abweichungswerte im Bericht mit ihrer Messmethode beurteilen.'''))
        allsections.append(('Anhang: CAD 0.12.2 in Abnahme', '''**Dieser Abschnitt beschreibt den Entwicklungsstand, nicht die im Hauptteil dokumentierte ausgelieferte CAD-Version 0.12.1.** Die finale portable Ausgabe und Installation von 0.12.2 waren zum dokumentierten Stand noch offen. Die Versionsnummer in deinem Programm entscheidet, welche Funktionen verfügbar sind.

Die neue Integration verwendet **STL-Engine 0.10**. Hinzu kommt eine separate Werkbank mit Flächenfarben für Ebenen, Zylinder, Kegel, Freiformen und Drehflächen sowie sichtbaren Bereichsrändern.

### Neue Bearbeitung der Analyse

- Bereiche am Modell oder in einer Liste wählen.
- Einzelne Dreiecke anklicken oder per Rechteck auswählen. Die Rechteckauswahl erfasst Dreiecksmitten einschließlich verdeckter Flächen.
- Mit Strg/Umschalt die Auswahl erweitern.
- Bereiche teilen, zusammenführen, mit Typvorgabe versehen oder schützen.
- Die Korrekturen separat rückgängig machen und wiederholen.
- Korrektur-JSON speichern und laden; es ist an Quelle, Einheit und Toleranz gebunden.

Bis **20.000 Dreiecke** sind in dieser Analyse bearbeitbar. Einheiten- oder Toleranzänderungen setzen die zugehörige Korrekturhistorie zurück.

Nach der Konvertierung gibt es Original, Ergebnis, Überlagerung und Abweichungsansicht sowie bestätigte Begleitdateien wie reparierte STL/3MF und Ergebnisnetz. Die farbige Abweichungsdarstellung misst an dargestellten Dreiecksmitten. Sie ersetzt keine globale Genauigkeitsprüfung.

Freiformrekonstruktion unterstützt geeignete Graphflächen und Drehprofile. Ungeeignete Bereiche können eine geprüfte einfachere Darstellung behalten. Die Übernahme als CAD verwendet weiterhin die nativen Körperprüfungen und einen Projekt-Undo.'''))
    return allsections

def inline(s):
    s=s.replace('→',' > ').replace('–','-').replace('—','-').replace('\u2011','-')
    s=html.escape(s)
    return re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)

class Manual(BaseDocTemplate):
    def __init__(self,path,kind,version):
        self.kind,self.version=kind,version
        title='Formnaro '+('CAD' if kind=='cad' else 'Netz')
        super().__init__(str(path),pagesize=A4,leftMargin=M,rightMargin=M,topMargin=23*mm,bottomMargin=20*mm,title=title+' - Handbuch '+version,author='Formnaro / Andreas Klisch',subject='Deutsche Bedienungsanleitung, Stand 13.10.2026')
        self.addPageTemplates(PageTemplate(id='normal',frames=[Frame(M,20*mm,WIDTH,H-43*mm,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=self.decorate))
        self.serial=0
    def decorate(self,c,d):
        c.setFillColor(TEAL);c.rect(0,H-5*mm,W,5*mm,fill=1,stroke=0)
        c.setFont('Bold',9);c.setFillColor(TEAL);c.drawString(M,H-13*mm,'FORMNARO '+self.kind.upper())
        c.setFont('Body',8);c.setFillColor(INK);c.drawRightString(W-M,H-13*mm,'Handbuch '+self.version+' | Deutsch')
        c.setStrokeColor(colors.HexColor('#d6e4ea'));c.line(M,15*mm,W-M,15*mm)
        c.setFont('Body',8);c.drawString(M,10*mm,'13. Oktober 2026 | Offline modellieren, lokal speichern')
        c.drawRightString(W-M,10*mm,str(d.page))
    def afterFlowable(self,f):
        if getattr(f,'toc',False):
            key='section-'+str(f.number)
            self.canv.bookmarkPage(key);self.canv.addOutlineEntry(f.getPlainText(),key,0,False)
            self.notify('TOCEntry',(0,f.getPlainText(),self.page,key))

class PlateDiagram(Flowable):
    def __init__(self):self.width=WIDTH;self.height=88*mm
    def draw(self):
        c=self.canv;scale=1.6*mm;x=(WIDTH-60*scale)/2;y=18*mm
        c.setFillColor(PALE);c.roundRect(0,0,WIDTH,self.height,8,fill=1,stroke=0)
        c.setFillColor(colors.HexColor('#ed825e'));c.setStrokeColor(INK)
        c.roundRect(x,y,60*scale,40*scale,2*mm,fill=1,stroke=1)
        for hx in [8,52]:
            for hy in [8,32]:c.setFillColor(colors.white);c.circle(x+hx*scale,y+hy*scale,2.5*scale,fill=1,stroke=1)
        c.setFont('Bold',11);c.setFillColor(INK);c.drawCentredString(WIDTH/2,7*mm,'60 x 40 x 6 mm | 4 Bohrungen, Durchmesser 5 mm')

def paragraph(s,style='p'):return Paragraph(inline(s),styles[style])

def table(rows):
    count=len(rows[0]);ratios=[.35,.65] if count==2 else [.28,.36,.36]
    obj=Table([[paragraph(('**'+v+'**') if i==0 else v,'cell') for v in row] for i,row in enumerate(rows)],colWidths=[WIDTH*r for r in ratios],repeatRows=1,hAlign='LEFT')
    obj.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dceef1')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,PALE]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    return obj

def body(text,kind):
    lines=text.splitlines();items=[];i=0
    while i<len(lines):
        s=lines[i].strip()
        if not s:i+=1;continue
        if s.startswith('### '):items.append(paragraph(s[4:],'sub'));i+=1;continue
        if s.startswith('[[image:'):
            name,cap=s[8:-2].split('|',1);file=WORK/kind/(name+'.png')
            if not file.exists():file=(ROOT if kind=='cad' else NETZ)/'docs/handbuch-bilder'/(name+'.png')
            with PILImage.open(file) as im:iw,ih=im.size
            scale=min(WIDTH/iw,112*mm/ih)
            items.append(KeepTogether([Image(str(file),width=iw*scale,height=ih*scale,hAlign='CENTER'),paragraph(cap,'cap')]));i+=1;continue
        if s.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                row=[v.strip() for v in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',v) for v in row):rows.append(row)
                i+=1
            items.extend([table(rows),Spacer(1,9)]);continue
        if s.startswith('> '):items.append(paragraph(s[2:],'note'));i+=1;continue
        if s.startswith('- ') or re.match(r'^\d+\. ',s):
            items.append(paragraph(('• '+s[2:]) if s.startswith('- ') else s,'bullet'));i+=1;continue
        block=[s];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(### |\[\[image:|\||> |-[ ]|\d+\. )',lines[i].strip()):block.append(lines[i].strip());i+=1
        items.append(paragraph(' '.join(block)))
    return items

def build(kind):
    version='0.12.1' if kind=='cad' else '0.13.3'
    name='Formnaro-'+('CAD' if kind=='cad' else 'Netz')+'-Handbuch-DE'
    sections_data=sections(kind)
    source=(ROOT if kind=='cad' else NETZ)/'docs'/(name+'.txt')
    source.parent.mkdir(parents=True,exist_ok=True)
    source.write_text(name+'\nVersion '+version+' | Stand: 13.10.2026\n\n'+'\n\n'.join('## '+str(i)+'. '+title+'\n\n'+text for i,(title,text) in enumerate(sections_data,1))+'\n',encoding='utf-8')
    OUT.mkdir(parents=True,exist_ok=True);pdf=OUT/(name+'.pdf')
    story=[Spacer(1,24*mm),Paragraph('Formnaro<br/>'+('CAD' if kind=='cad' else 'Netz'),ParagraphStyle('cover',fontName='Bold',fontSize=42,leading=47,textColor=INK,spaceAfter=20)),paragraph('**Dein Handbuch für die lokale 3D-Werkstatt**','sub'),paragraph('Version '+version+' | Deutsch | Stand: 13. Oktober 2026'),Spacer(1,8*mm),PlateDiagram(),Spacer(1,9*mm),paragraph('Von der ersten Form zum fertigen Teil: Maße und Griffe, Bohrungen, Quellenbearbeitung, präzises Platzieren, Projekte, Import und Export sowie zwei vollständige Übungen.'),paragraph('Mit sechs aktuellen Oberflächenbildern aus einem isolierten Beispielprojekt. Inhalt und Tastenkürzel sind auf diese Ausgabe abgestimmt.'),paragraph('CAD: native Körper und STEP.' if kind=='cad' else 'Netz: Dreiecksmodelle für STL und 3D-Druck.','note')]
    if kind=='cad':story.append(paragraph('Die kommende CAD-Version 0.12.2 mit STL-Engine 0.10 wird ausschließlich im Anhang als Entwicklungsstand beschrieben.','cap'))
    story.extend([PageBreak(),paragraph('Inhalt','h')])
    toc=TableOfContents();toc.levelStyles=[ParagraphStyle('toc',fontName='Body',fontSize=10.2,leading=14,textColor=INK,spaceBefore=1,leftIndent=0,firstLineIndent=0)]
    toc.tableStyle=TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),1),('BOTTOMPADDING',(0,0),(-1,-1),1)])
    story.extend([toc,Spacer(1,10*mm),paragraph('Schneller Einstieg: Kapitel 1 bis 5, dann die Übung „Platte mit vier Bohrungen“. Die Tastentabelle findest du am Ende.','note')])
    for i,(title,text) in enumerate(sections_data,1):
        story.append(PageBreak());heading=paragraph(str(i)+'. '+title,'h');heading.toc=True;heading.number=i;story.append(heading);story.extend(body(text,kind))
    doc=Manual(pdf,kind,version);doc.multiBuild(story)
    reader=PdfReader(pdf);texts=[p.extract_text() or '' for p in reader.pages]
    assert len(reader.outline)==len(sections_data)
    assert all(t.strip() for t in texts)
    assert 'Platte mit vier Bohrungen' in '\n'.join(texts)
    assert '0.12.2 in Abnahme' in '\n'.join(texts) if kind=='cad' else '0.13.3' in '\n'.join(texts)
    result={'file':str(pdf),'version':version,'pages':len(reader.pages),'chapters':len(sections_data),'screenshots':6,'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'source':str(source)}
    if kind=='netz':
        destination=NETZ/'output/pdf'/pdf.name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(pdf,destination)
    return result

if __name__=='__main__':
    result=[build(kind) for kind in ['cad','netz']]
    (WORK/'pdf-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
