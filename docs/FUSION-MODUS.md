# Fusion-Modus

Formnaro 0.101.0 ergänzt **Fusion 360** oben neben **Easy Tinker**, **Normal**
und **Solid**. Der Modus erleichtert den Umstieg von Autodesk Fusion mit einer
eigenen Anordnung und vertrauten Befehlsnamen.

Die Orientierung folgt der [Fusion-Oberfläche](https://help.autodesk.com/view/fusion360/ENU/?contextId=LP-STEPS-P13N-SNP-GS-OTH-CRD-1)
und den [offiziellen Tastenkürzeln](https://help.autodesk.com/cloudhelp/ENU/Fusion-GetStarted/files/GUID-F0491540-0324-470A-B651-2238D0EFAC30.htm).
Die Funktionen werden durch Formnaros vorhandene Werkzeuge ausgeführt.

## Aufbau

- Oben: **Konstruktion** mit **Volumenkörper**, **Skizze**, **Netz** und
  **Werkzeuge**. Die Gruppen heißen Erstellen, Ändern, Zusammenfügen,
  Konstruieren, Prüfen und Einfügen. Weitere Befehle öffnen sich über den
  Gruppennamen mit Pfeil. Dienstprogramme enthält zusätzliche Formnaro-Werkzeuge.
- Links: **Browser** mit dem tatsächlichen Modellbaum, Sichtbarkeit und
  erhaltenen Quellen. Einfügen enthält die Grundkörper; Dokumenteinstellungen
  enthalten die vorhandenen Arbeitsflächenoptionen.
- Rechts: Eigenschaften nach einem Doppelklick im Browser oder Auswahl eines
  Konstruktionsschritts. Bearbeitungen wie Abrunden und Schale verwenden ihre
  vorhandene Vorschau, Übernahme und Abbrechen. Der KI-Chat öffnet sich über KI.
- Unten: **Konstruktionsschritte** aus den tatsächlich erhaltenen Quellen,
  in Abhängigkeitsreihenfolge. Ein Klick wählt die Quelle und ihre Eigenschaften.
  Diese Leiste zeigt keine zusätzliche chronologische Bearbeitungshistorie und
  bietet kein Verschieben oder Abspielen von Features.
- Die Standardansichten bleiben oben rechts erreichbar. Einpassen, Projektion
  und Ansichtsausrichtung stehen zusätzlich in der Navigationsleiste unten.

## Erste Konstruktion

1. **Fusion 360** wählen und unter Volumenkörper **Extrusion** starten.
2. Kontur und Maße im nativen Skizzeneditor bestimmen, Vorschau berechnen und
   übernehmen. Ein neuer nativer CAD-Körper entsteht.
3. Für einen Schnitt zuerst ein entsperrtes Teil auswählen, **Extrusion ·
   Ausschneiden** öffnen und seine Bezugsfläche anklicken.
4. **Abrunden**, **Fase**, **Bohrung**, **Schale**, **Anordnung** und **Spiegeln**
   verwenden die vorhandenen Modellierfunktionen. Erhebung und Sweeping
   benötigen geeignete native Skizzen. Unpassende Befehle bleiben deaktiviert.

Neue Grundkörper sind im Fusion-Modus native CAD-Körper. Die gespeicherte
CAD/Netz-Auswahl des Normalmodus bleibt erhalten. Vorhandene Netze bleiben
über das Register Netz bearbeitbar.

## Maus und Tastatur

Bei aktivierten Fusion-Optionen:

- Mittlere Maustaste ziehen: verschieben.
- Umschalt + mittlere Maustaste ziehen: drehen.
- Mausrad: zoomen. Rechts ziehen dreht ebenfalls die Ansicht.
- **S**: Werkzeugsuche mit Texteingabe und direkter Befehlsauswahl.
- **E**: Extrusion, **F**: Abrunden, **H**: Bohrung.
- **M**: Verschieben, **I**: Messen, **J**: Gelenke.

Texteingaben und laufende Bearbeitungen behalten ihre vorhandene Bedienung.
Speichern, Kopieren, Einfügen und Rückgängig verwenden die bisherigen
Tastenkombinationen. Unter **Einstellungen > Fusion 360** lassen sich Navigation,
Tasten und Startregister getrennt speichern. Unter **Einstellungen > Rechtsklick**
besitzt Fusion eine eigene anpassbare Befehlsliste. Bestehende Listen der anderen
Modi bleiben beim ersten Laden erhalten.

Moduswechsel ändern keine Geometrie und erzeugen keinen Undo-Schritt. Vor einem
Wechsel laufende Bearbeitungen übernehmen oder abbrechen. Beim Verlassen kehren
die echten Steuerelemente in die gespeicherte Seitenleistenanordnung zurück.

Die Einheit bleibt Millimeter, Z zeigt nach oben. Projektformat und Dateiformate
bleiben Formnaro-Formate; der Modus ergänzt keinen F3D/F3Z-Dateileser und keine
Fusion-Cloud-Verbindung. Er ist eine eigene Formnaro-Oberfläche für Umsteiger.

Technisch: `cad-fusion-state.js`, `cad-fusion-ui.js`, `cad-fusion.css`.
Modus im bestehenden `offlinecad-workbench-mode-v1`, Optionen in
`offlinecad-fusion-settings-v1` / `Daten/fusion-einstellungen.json`.
Bestehende Rechtsklick-Einstellungen mit drei Modi werden ohne sofortiges
Schreiben um Fusion ergänzt; alle bisherigen Befehlslisten bleiben erhalten.
