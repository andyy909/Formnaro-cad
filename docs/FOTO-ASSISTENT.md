# Foto-Assistent

Im KI-Chat ein PNG-, JPEG- oder WebP-Foto anhängen und am Bild **Foto vermessen**
wählen. Ab 0.107 sind frontale und schräge Fotos ebener technischer Teile möglich.
Referenz und gemessene Merkmale müssen in derselben Ebene liegen. Bei schrägen
Fotos unter **Aufnahme** das bekannte Rechteck wählen. Vier echte Rechteckecken
im Uhrzeigersinn ab oben links sowie die bekannte Breite und Höhe angeben.
Eine einzelne Referenzstrecke reicht bei Perspektive nicht. Die Entzerrung gilt
innerhalb dieses Rechtecks; Objektivverzeichnung und Höhenversatz bleiben offen.
Eine allgemeine Mehrbildrekonstruktion ist noch nicht enthalten.

1. Zwei Endpunkte einer bekannten Referenzstrecke setzen und ihre Länge in mm
   eingeben. Herkunft und Unsicherheit der Referenz angeben. Pixelraster und Zoom
   helfen bei der Punktwahl. X/Y können auch als Originalpixel eingegeben werden.
2. Einen Maßnamen eingeben, **Bildmaß: 2 Punkte** wählen und die Messstellen
   anklicken. Die Maßliste zeigt den Wert und eine geschätzte Bildunsicherheit.
   Zusätzliche Nutzermaße oder ausdrücklich begründete Annahmen separat ergänzen.
3. Optional die Außenkontur der Reihe nach markieren und **Kontur schließen**
   wählen. Sichtbare Öffnungen als eigene geschlossene Konturen im Inneren setzen.
   Die Kontur kann keine verdeckte Rückseite oder Bohrungstiefe beschreiben.
4. Zum Korrigieren **Punkte verschieben** wählen, die Punktgruppe auswählen und
   ihre Punkte ziehen. Ein geändertes Referenzmaß berechnet die Bildmaße neu.
5. **Messungen für die KI verwenden** wählen und den Modellierauftrag senden.
   Nicht sichtbare Funktionsmaße wie Materialdicke im Auftrag ergänzen.

Abbrechen oder Esc verwirft ungespeicherte Bildmarkierungen. Im geöffneten Dialog
wird keine Geometrie verändert. Die Messungen gehören zum betreffenden Bildanhang
und werden mit der nächsten Nachricht gesendet. Nach erfolgreichem Senden werden
die Anhänge wie bisher aus dem Eingabebereich entfernt. Der Bilddialog ersetzt
keine technische Zeichnung. **Im Projekt speichern** am bearbeiteten Bildanhang
speichert das aufrechte Original einschließlich Prüfsumme, Herkunft, Markierungen,
Maßen und Ebenenkalibrierung. **Projektfotos** öffnet diese Referenzen nach erneutem
Laden, auch in einem neuen Chat. Der direkte Knopf **Projektfotos** ist in allen
Bedienmodi verfügbar; **Foto hinzufügen** öffnet den Messdialog ohne Chat. Dort
bearbeiten, erneut anhängen oder entfernen.
Jede bestätigte Projektfotoänderung hat einen Rückgängig-Schritt; Anhängen und
Abbrechen ändern das Projekt nicht. Höchstens vier Originale, je 5 MiB und zusammen
8 MiB kodierte Bilddaten. Zu große Bilder werden abgewiesen.

**Entzerrung ansehen** zeigt die verknüpfte Referenzebene; der Zeiger nennt die
zugehörigen Originalpixel. Alle Markierungen bleiben im Originalkoordinatensystem.
**Kantenvorschlag suchen** ermittelt lokal eine zusammenhängende Kante und ihre
konvexe Hülle. Vorschläge lassen sich in der Punktgruppe verschieben und erst
nach ausdrücklicher Bestätigung verwenden. Einbuchtungen und Öffnungen manuell
ergänzen. Ein unbestätigter Vorschlag blockiert die Verwendung der Messungen.

## Was die KI erhält

Originalfoto, beschriftetes Raster, festgelegte Ansicht, Referenzmaß samt Herkunft,
Bildmaße mit Originalpunkten und geschätzter Unsicherheit, ausdrückliche Annahmen,
Konturen und offene Fragen. Bilddaten und Referenz werden durch SHA-256 und die
aufrechte dekodierte Originalgröße gebunden. Die KI kann lokal weitere Strecken
aus zwei Punkten messen oder beschriftete Ausschnitte anfordern. Diese Werkzeuge
haben keinen Zugriff auf fremde Dateien oder das Netzwerk.

Vorhandene Grenzen für Bildanzahl und Übertragungsgröße bleiben erhalten.
Originale und Chatverlauf werden durch zusätzliche Rasterbilder nicht verdrängt;
ein aus Platzgründen ausgelassenes Zusatzbild wird der KI ausdrücklich genannt.
Beim Senden gelten die normalen Hinweise des KI-Chats zur Übertragung an den
eingerichteten Anbieter. Das lokale Vermessen selbst erzeugt keine Anbieteranfrage.

## Fotovergleich

Eine bestätigte Fotokontur ermöglicht einen rechnerischen Vergleich mit den neuen
oder geänderten sichtbaren Materialteilen der noch nicht übernommenen Vorschau.
Unveränderte Referenzteile und abziehende Quellen werden nicht mitverglichen.
Das Vergleichsbild zeigt Rot für im Modell fehlende Bereiche, Blau für überschüssige
Bereiche und Grün für Überlappung. Außenmaße und sichtbare Öffnungen werden separat
berichtet. Die beiden Konturen werden zur Prüfung ihrer Form an den Mittelpunkten
ihrer Begrenzungen ausgerichtet; der kalibrierte Maßstab bleibt erhalten.

Die KI erhält die Messbefunde zur Korrektur. Fotoreferenz und die ursprünglichen
nativen Sollprüfungen bleiben während aller Korrekturen fest. Ein späterer
schlechterer Entwurf verdrängt keinen besser geprüften Kandidaten. Bei erschöpftem
Limit bleibt eine verfügbare Vorschau mit ihren Fehlern beziehungsweise Warnungen
zur manuellen Beurteilung erhalten. **Fotovergleich** öffnet den Bericht in einem
eigenen Fenster; **Messbericht speichern** exportiert Werte, Herkunft, Annahmen
und Referenzpunkte als JSON, ohne Bilddaten. Erst **Übernehmen** verändert das Modell;
ein Undo setzt den gesamten bestätigten Auftrag zurück.

Das ist eine orthografische Rasterprüfung des Anzeigenetzes, kein Beweis für
CAD-Maßhaltigkeit, verdeckte Geometrie, Wandstärke, Bohrungstiefe oder Passung.
Punktunsicherheit, Referenzrundung, Rasterauflösung und perspektivische Abweichungen
begrenzen die Aussage. Kleine Öffnungen können unauflösbar sein. Native CAD-Maße,
Körpergültigkeit und funktionswichtige Bohrungen brauchen eigene Sollprüfungen.
Die Bildunsicherheit lockert diese Sollprüfungen nicht.

## Herkunft und Technik

Anregung: [mfranzon/print3d](https://github.com/mfranzon/print3d), geprüfter Stand
`292ce13366155915ed7be4b4eec5a7ea570e3eb9`, insbesondere Raster, belegte Maße und
Silhouetten-Rückkopplung. Die Formnaro-Implementierung ist eigenständig und nutzt
die vorhandene CAD-/Chat-/Vorschaupipeline. Keine Blender-, Bambu-Studio- oder
neue Cloud-Abhängigkeit und keine Übernahme fremder Beispielbilder.

Module `cad-photo-data/images/ui/task/preview`; interne Analysewerkzeuge
`photo/measure` und `photo/grid` sind nur mit aktuellen Chat-Fotoreferenzen nutzbar.
Projekte mit gespeicherten Fotos verwenden Format 19; Altprojekte bleiben lesbar
und ohne diese Daten in ihrem bisherigen Format. `.ocad`, `.fnpack` und Autosave
bewahren die Originaldaten; Teilvorlagen übernehmen keine ganzen Projektfotos.
`test:photo` prüft Maße, Datenbindungsvorgaben,
Konturen, Rasterkennwerte und Materialauswahl. Die isolierte Desktop-Abnahme
prüft tatsächliche Bildbedienung, beide Anbieterprotokolle mit simulierten Antworten,
Messrunde, Fehlentwurf, Korrektur, Vorschau, Apply und Undo ohne Cloud-Inferenz.

## Technische Rekonstruktion aus drei Ansichten · ab 0.108

Unter **Projektfotos > Technische Ansichten verbinden** einen Ansichtssatz anlegen.
Drei gespeicherte Originale als Vorderansicht (X/Z), rechte Seitenansicht (Y/Z)
und Draufsicht (X/Y) zuordnen. Jedes Foto vorher kalibrieren und seine Außenkontur
sowie sichtbare Öffnungen korrigieren. Für schräge Aufnahmen gilt weiterhin nur
die kalibrierte Ebene; beliebige perspektivische Körperaufnahmen sind ungeeignet.

1. In jedem Original den Bezug auf denselben gemeinsamen Nullpunkt setzen. Im Bild
   zeigt die erste Achse nach rechts, die zweite nach oben. Keine Ansicht spiegeln.
   Der vorgeschlagene linke untere Umrisspunkt passt nur, wenn er tatsächlich in
   allen Ansichten denselben räumlichen Bezug bezeichnet.
2. Gemeinsame Breite X, Tiefe Y, Höhe Z, Herkunft und native Maßtoleranz bestätigen.
   Die vorgeschlagenen Fotozahlen bleiben zunächst Annahmen. Gemeinsame Weltlage
   getrennt angeben. Verdeckte Innengeometrie ausdrücklich beschreiben. Öffnungen
   werden nur nach ausdrücklicher Bestätigung durch die gesamte jeweilige Tiefe
   ausgeschnitten. Ohne diese Angaben bleibt die Berechnung gesperrt.
3. Optional native Funktionsprüfungen ergänzen: freie zylindrische Korridore oder
   echte zylindrische Bohrungen einschließlich Materialrand. Start-/Endpunkte in
   gemeinsamen lokalen XYZ-mm angeben. Für einen Durchgang die Achse über die
   Außenflächen hinaus führen. Ein freier Korridor belegt keine zylindrische Wand;
   eine rechteckige Öffnung kann die Bohrungsprüfung nicht bestehen.
4. **Neue CAD-Variante berechnen** erstellt eine Vorschau aus drei editierbaren
   Skizzenprofilen mit nativer Schnittmenge. Drei neue Projektparameter binden
   neun Skizzenvariablen. Bestehende Teile, Parameter und Sperren bleiben erhalten.
5. Alle drei Ansichten separat öffnen und die native Maß-/Körper-/Funktionsprüfung
   lesen. Der Mehransichtenvergleich verwendet die gemeinsamen Nullpunkte ohne
   unabhängiges Zentrieren. Auch eine verschobene Variante mit richtigen Außenmaßen
   fällt dadurch auf. Erst die vollständig bestandene Prüfung erlaubt Übernehmen.
   Verwerfen verändert das Modell nicht; Übernehmen ist ein Rückgängig-Schritt.

**3D-Vorschau ansehen** verkleinert den Dialog und bietet Kameras für Vorn, Rechts,
Oben und Isometrisch. **Vorhandene Variante prüfen** misst das aktuelle bestätigte
Modell erneut, ohne es zu verändern. Geänderte gemeinsame Parameter zuerst nativ
aktualisieren. **Prüfbericht speichern** exportiert die erfassten nativen Befunde,
drei Bildberichte, Herkunft und Annahmen als JSON ohne Bildbytes.

Ansichtssätze sind unabhängig von ihrer CAD-Variante speicherbar. Fehlende Originale
oder geänderte Markierungen werden diagnostiziert. Referenzen im ersten Schritt
bewusst neu bestätigen. Das Entfernen eines Satzes erhält Bilder und Geometrie;
Rückgängig stellt ihn wieder her. Ganze Sätze und Originale überleben .ocad,
.fnpack und Autosave. Projektdaten mit Sätzen oder CAD-Rekonstruktionsherkunft
verwenden Format 20; reine Projektfotos behalten Format 19. Alte Programmversionen
können die neuen Formate nicht öffnen. Teilvorlagen enthalten Herkunft und
Parameterbindungen, aber keine vollständigen Projektbilder.

Die Schnittmenge bestätigt die angegebenen Projektionen, nicht die unbekannte
Innenkonstruktion. Gekrümmte Konturen sind in dieser Stufe bestätigte Polygonzüge;
maximal 128 Konturpunkte je Ansicht. Zu geringe Bildauflösung, falsche
Ansichtszuteilung, abweichende Nullpunkte, fehlende Maße und widersprüchliche Maße
bleiben sichtbar. Die ausgewiesene Bildunsicherheit ist eine Näherung und verändert
keine native Toleranz. Fertigungspassung und weitere unsichtbare Merkmale müssen
mit eigenen Funktionsprüfungen belegt werden.
