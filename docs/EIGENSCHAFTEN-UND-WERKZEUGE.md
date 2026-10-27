# Formnaro 0.27.0: Eigenschaften und vorhandene Werkzeuge

Paket 8 ergänzt die bisherigen Netzwerkzeuge auf der gemeinsamen Arbeitsfläche.
CAD-Körper behalten ihre nativen Quellen. Netzteile behalten Dreiecke und
vorhandene Rezepte; keine automatische Umwandlung zwischen CAD und Netz.

## So arbeiten die übernommenen Werkzeuge

1. Ein Netzteil auswählen. Rechts stehen Name, Farbe, Deckkraft, Notizen,
   Position, Größe, Drehung, Sichtbarkeit und Sperre bereit. Eck-, Höhen- und
   Liftgriffe sowie Absetzen funktionieren auch für geeignete Netzteile.
2. **Weitere Netz-Werkzeuge …** öffnen. Dort stehen Messen, Lineal, Anordnen,
   Passung, Bezugspunktplatzierung, Auf-Fläche-Legen, Magnet, Schnittansicht,
   Modellprüfung sowie Text, SVG, Skizze, Formpaket und bisherige Reparatur.
3. Werte einstellen und **Vorschau** berechnen. **Übernehmen** erzeugt einen
   gemeinsamen Rückgängig-Schritt. **Abbrechen** verwirft den Vorschlag.
   Eine zwischenzeitliche Projektänderung verwirft eine veraltete Vorschau.
4. Zum Bearbeiten einer Gruppenquelle die Quelle im Objektbaum öffnen.
   Der Quelleneditor ergänzt Deckkraft, Notizen und Farbe, Text/Schrift,
   SVG-Ersatz und den grafischen Skizzeneditor. Andere Originalquellen bleiben
   erhalten. „Quellenfarben erhalten“ zeigt die erhaltenen Materialbereiche.
5. **Bibliothek → Auswahl speichern** speichert auch Netzteile oder gemischte
   Auswahlen. Einfügen erzeugt neue Kennungen und lässt sich rückgängig machen.
   Maßvorlagen unterstützen Größe und Position; native CAD-Parameter bleiben
   zusätzlich verfügbar. Alte CAD-Bibliotheken werden beim ersten gemischten
   Speichern in eine eigene gemeinsame Bibliothek übernommen; ihre Dateien
   bleiben erhalten. Alte persönliche Netzbibliotheken werden nicht ungefragt
   eingelesen. Deren Datenübernahme gehört zu Paket 12.
6. Das Projekt normal speichern und wieder öffnen. SVG-Projektion, OBJ/MTL,
   3MF und glTF/GLB verwenden die gemeinsame Auswahl und Sichtbarkeit.
   Quellenfarben werden in den farbfähigen Exporten erhalten. STEP bleibt ein
   Export nativer CAD-Körper.

Messen kann sichtbare CAD- und Netzpunkte verbinden. Linealwerte verwenden das
aktuelle Welt- oder Ebenenkoordinatensystem. Reihen, Raster und Kreise erhalten
vollständige affine Lagen einschließlich Spiegelung und Scherung. Passung gibt
Spiel je Seite vor; komplexe Formen werden dabei entlang ihrer lokalen Achsen
skaliert. Druckspiele lassen sich speichern, wählen und entfernen. Ein Gegenstück
entsteht auf ausdrückliche Auswahl als zusätzliche Lochform.

Auf-Fläche-Legen verwendet eine äußere Stützfläche. Nicht geeignete Flächen
werden abgewiesen. Gehört die Arbeitsebene zum bewegten Teil, eine fremde Ebene
oder die Grundebene wählen. Bezugspunktplatzierung verschiebt einen eigenen Punkt
oder den Mittelpunkt zum Ziel, mit numerischem U/V/N-Versatz. Magnet wird durch
Ziehen auf eine sichtbare Körperfläche bedient; Loslassen übernimmt eine Änderung.
Bei aktiver Schnittansicht diese für Flächen-/Punktwerkzeuge zuerst ausschalten.

Text verwendet die vorhandene Schriftbibliothek und erhält die Ausgangskonturen.
SVG kann im normalen Import ausdrücklich als Netz extrudiert werden; Innenkonturen
bleiben erhalten. Netzskizzen verwenden denselben grafischen Editor mit benannten
Maßen und Formeln wie CAD-Skizzen. Formpakete werden in den Einstellungen geladen
und unter „Netz aus Formpaket“ ausdrücklich als Netz erzeugt. Die Palette erzeugt
weiter native CAD-Körper. Unter „Funktionen“ ist das mitgelieferte Paket der
bisherigen Netzbefehle erreichbar; eigene bisherige Befehlsnamen werden verstanden.

## Grenzen der bestehenden Verfahren

- Die Netz-Modellprüfung liefert Wandstärken-Stichproben, keinen garantierten
  globalen Mindestwert. Netz-Netz- und CAD-CAD-Kollisionen verwenden die jeweiligen
  vorhandenen Kerne. CAD-Netz-Kollisionen werden hier nicht berechnet.
- Schnittansichten schneiden nur die Darstellung, auch bei gemischter Auswahl.
  Das Projekt und exportierte Geometrie bleiben vollständig. Die Ansicht wird im
  Arbeitsplatz gespeichert und beim Öffnen neu berechnet. Eine Geometrieänderung
  schaltet die Ansicht aus. Alte geeignete Netz-Schnittansichten werden übernommen.
- Die bisherige Netzreparatur bleibt auf 40.000 Dreiecke begrenzt. Sie behandelt
  Duplikate, Nullflächen, Orientierung und geeignete Nachbarkanten. Kleine Lücken
  werden nur nach Auswahl geschlossen. Der beschädigte Ausgangsstand bleibt als
  Originalquelle erhalten. Ungeeignete Fälle ändern das Projekt nicht.
- Offene oder beschädigte Netze bleiben anzeigbar und speicherbar. Körperwerkzeuge
  benötigen weiterhin eine erfolgreiche Prüfung. Quellenfarben werden bei ungeprüften offenen Netzen
  als einfarbiges Original dargestellt. Rein ebene Netze bekommen keine
  räumlichen Maßgriffe, die drei positive Ausdehnungen benötigen.
- Geschützte Quellen und gesperrte Layer/Ordner lassen sich nicht bearbeiten.
  Vorlagen und Netze erhalten weder erfundene CAD-Parameter noch eine CAD-BRep.

Neue Daten bleiben im gemischten Projektformat 8. Arbeitsplatzversion 3 speichert
Schnittkonfigurationen; Netzquellenversion 3 kennzeichnet Quellenfarben und
Reparaturableitungen ausdrücklich. Alte Programme, die diese Abschnitte nicht
kennen, weisen sie ab. Neue Dateien mit dieser Ausgabe öffnen und alte Originale
behalten. CAD-Projekte ohne gemeinsame Zusatzdaten behalten Format 5/7.

## Umfang und Abnahme

Der Abgleich in `FORMNARO-FUNKTIONSBESTAND.md` umfasst die 44 alten Netz- und
46 CAD-Befehle. Die vier früheren Projektpakete und vorhandenen konstruktiven
Verfahren bleiben Bestandteil des gemeinsamen Programms. Neue Meshmixer-Verfahren
14–27, die weitere Konverterübernahme 9, direkte Objektumwandlungen 10/11 und die
Vereinheitlichung persönlicher Daten/KI in Paket 12 bleiben eigene Pakete.

Reproduzierbare Prüfungen: `npm run test:tool-parity`,
`npm run test:tool-parity-ui`, dazu die bestehenden Projekt-, Netz-, Arbeitsflächen-
und CAD-Prüfungen. Die separate Ausgabe entsteht mit `package:tool-parity`;
`archive-tool-parity.py` erstellt erst nach erfolgreicher EXE-Abnahme das Archiv.
Die lokalen Nachweise liegen getrennt unter `work/tool-parity/checks`: aktuelle
Quellmanifeste, reale Maus-/Dateiabläufe, tatsächliche EXE-/ASAR-Identitäten,
vollständige Laufzeit-Dateimenge, unveränderte Rechenkerne und Konverterdateien,
Erhaltung früherer Ausgaben sowie CRC und Einzelhashes der Archive. Es werden
synthetische Prüfteile und isolierte Profile verwendet.

Separate Ausgabe: `release-formnaro-eigenschaften-werkzeuge-v0.27.0/Formnaro-win32-x64`.
Portable ZIP: `output/Formnaro-Eigenschaften-Werkzeuge-v0.27.0.zip`.
Das gesamte Archiv in einen separaten kurzen lokalen Ordner entpacken,
z. B. `C:\Formnaro027`, und `App/Formnaro.exe` starten.
