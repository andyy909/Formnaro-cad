# Solid-Modus

Formnaro 0.99.0 ergänzt oben neben **Easy Tinker** und **Normal** den
Bedienmodus **Solid**. Er richtet sich an Anwender, die von SolidWorks kommen.

Die Einteilung orientiert sich am CommandManager und am linken Managerbereich
der [SolidWorks-Hilfe 2026](https://help.solidworks.com/2026/english/SolidWorks/sldworks/c_management_panel.htm).
Formnaro verwendet seine eigenen Modellierwerkzeuge und Dateiformate.

## Teile erstellen

1. Oben **Solid** einschalten.
2. Im Register **Features** einen **Extrudierten Aufsatz** starten. Der native
   Skizzeneditor bietet Rechtecke, Kreise, geschlossene Konturen, Maße und Formeln.
3. Maße und Extrusionshöhe festlegen, **Vorschau berechnen** und übernehmen.
4. Für **Linearer Schnitt** zuerst ein sichtbares, entsperrtes Teil auswählen,
   dann seine Bezugsfläche anklicken. Der Skizzeneditor startet mit
   **Material ausschneiden**. Die Schnitttiefe gilt ab dieser Fläche.
5. Verrundung, Fase, Bohrung, Wandung, Muster und Spiegeln nutzen die vorhandenen
   geprüften Werkzeuge. Ausformung und Austragung setzen geeignete native
   Skizzen voraus; die Schaltflächen berücksichtigen die aktuelle Auswahl.

Die weiteren Register heißen **Skizze**, **Prüfen**, **Baugruppe** sowie
**Netz & Umwandeln**. Weitere bestehende Werkzeuge sind über **Extras** erreichbar.
Der Menübereich enthält Datei, Bearbeiten, Ansicht, Einfügen, Extras und Hilfe.

## Rechte Maustaste

Ein Rechtsklick auf ein Teil oder einen Eintrag im Modellbaum öffnet ein
Kontextmenü. Solid zeigt eine kleine Werkzeugleiste und Befehle wie
Feature bearbeiten, Skizze auf Fläche, Linearer Schnitt, Verrundung,
Ausblenden, Isolieren und Eigenschaften. Bei Skizze/Schnitt auf einer
angeklickten Modellfläche wird diese Fläche direkt mit dem vorhandenen nativen
Flächenprüfer gewählt. Eine bestehende Mehrfachauswahl bleibt erhalten, wenn
eines ihrer Teile angeklickt wird. Gesperrte Teile bieten lesende Eigenschaften;
ändernde Befehle sind ausgegraut.

Während einer offenen Werkzeugbearbeitung bietet das Menü Abbrechen und,
bei vorhandener gültiger Vorschau, Übernehmen. Rechts **ziehen** dreht weiter
die Ansicht und öffnet kein Menü. Das bestehende Rechtsklick-Favorisieren in der
Formenpalette bleibt erhalten.

Unter **Einstellungen > Rechtsklick** lassen sich Befehle für **Easy Tinker**,
**Normal** und **Solid** getrennt hinzufügen, entfernen, nach oben/unten
verschieben und pro Modus zurücksetzen. Bis zu 32 Einträge sind möglich.
Auch aktivierte Funktions-Plugins können zugewiesen werden. Ausgeschaltete
oder entfernte Plugins bleiben als nicht verfügbare Belegung erhalten und
lassen sich nicht ausführen. Das Menü enthält ebenfalls einen direkten
Zugang zu diesen Einstellungen. Leere Flächen bieten Ansichts- und passende
allgemeine Befehle; Texteingaben behalten ihre gewohnte Rechtsklick-Bedienung.

Die Struktur orientiert sich an den
[SolidWorks-Kontextmenüs 2026](https://help.solidworks.com/2026/english/SolidWorks/sldworks/c_shortcut_menus.htm).
Die angebotenen Befehle entsprechen den vorhandenen Formnaro-Funktionen.

## Modell und Eigenschaften

Links wechseln **Modellbaum**, **Eigenschaften**, **Grundkörper** und **Dokument**.
Der Modellbaum zeigt die tatsächlichen Objekte und erhaltenen Quellen.
Ein Doppelklick auf ein Objekt öffnet seine Eigenschaften. Die Standardansichten im
Baum richten die Ansicht aus; neue Skizzen verwenden die aktive Arbeitsebene.
Werkzeugdialoge wie Verrundung oder Wandung erscheinen im linken Managerbereich.
Der bestehende Skizzeneditor und die Datei-/KI-Dialoge behalten ihre eigenen Fenster.

Alle neuen Grundkörper im Solid-Modus entstehen als native CAD-Körper.
Die gespeicherte Auswahl CAD/Netz/Automatisch des Normalmodus wird dadurch
nicht geändert. Vorhandene Netze bleiben auch in Solid bearbeitbar.
Die Einheit bleibt Millimeter; die Z-Achse zeigt weiterhin nach oben.

Der KI-Chat öffnet sich bei Bedarf über **KI** oben rechts. Sein Solid-Bereich
startet eingeklappt und verändert die gespeicherten Seitenleisten nicht.

## Bedienung und Einstellungen

Unter **Einstellungen > Solid** werden Navigation, Tastenkürzel und Startregister
unabhängig gespeichert. Bei eingeschaltetem Solid-Navigationsprofil:

- Mittlere Maustaste ziehen: Ansicht drehen.
- Strg + mittlere Maustaste ziehen: Ansicht verschieben.
- Umschalt + mittlere Maustaste ziehen: zoomen.
- Mausrad: zoomen.
- **S**: Schnellwerkzeuge.
- **Leertaste**: Ansichtsausrichtung.
- **F**: Modell einpassen.
- **Strg+1 … 7**: Vorne, Hinten, Links, Rechts, Oben, Unten, Isometrisch.

Texteingaben und laufende Bearbeitungen behalten ihre vorhandenen Tasten.
Mit deaktivierten Solid-Tastenkürzeln gelten die normalen Formnaro-Tasten.
Speichern, Kopieren, Einfügen und Rückgängig behalten ihre bisherigen Kürzel.

Der Moduswechsel verändert weder die Modellgeometrie noch den Rückgängig-Verlauf.
Beim Verlassen kehren die Originalkontrollen zu ihrer gespeicherten
Seitenleistenanordnung zurück. Eine offene Bearbeitung muss zuerst übernommen
oder abgebrochen werden.

Technisch: `cad-solid-state.js`, `cad-solid-ui.js`, `cad-solid.css`;
Bedienmodus weiterhin `offlinecad-workbench-mode-v1`, zusätzliche Optionen
`offlinecad-solid-settings-v1` / `Daten/solid-einstellungen.json`.
Die getrennten Rechtsklick-Belegungen verwenden `offlinecad-context-menu-v1`
und `Daten/rechtsklick-menues.json`. Sie verändern keine Modelle oder
gespeicherten Oberflächenanordnungen.
Das Projektformat wird nicht angehoben. Es werden keine SolidWorks-Dateileser,
Konfigurationen oder weiteren Modellierverfahren durch diesen Modus ergänzt.
