# Neue Formen im Normalmodus

Ab Formnaro 0.56.0 steht direkt über der Formenpalette die Auswahl
**Neue Formen: Automatisch / CAD / Netz**. Darunter steht, welcher Typ beim
nächsten Klick oder Ziehen entsteht. Die Wahl gilt auch für Text und Formenpakete.

- **Automatisch** ist der neue Standard. Ein leeres Projekt oder ein Projekt
  mit ausschließlich CAD-Teilen erstellt CAD-Formen. Enthält das Projekt nur
  Netzteile, entstehen Netzformen. Ansichtsvorlagen zählen dabei nicht als Teile.
- In einem gemischten Projekt bestimmt eine eindeutige Auswahl den Typ. Mehrere
  ausgewählte Teile desselben Typs sind ebenfalls eindeutig. Ohne Auswahl oder
  bei gleichzeitig ausgewählten CAD- und Netzteilen erscheint ein Hinweis.
  Vor dem Einsetzen ein passendes Teil auswählen oder CAD/Netz fest einstellen.
- **CAD** und **Netz** legen den Typ neuer Formen ausdrücklich fest, unabhängig
  vom Projektinhalt und der Auswahl. Die Wahl bleibt nach einem Neustart erhalten.

Beispiel: Eine STL als Netzteil importieren, einen Zylinder aus der normalen
Palette einsetzen und ihn als Lochform markieren. Netzteil und Zylinder
auswählen, gruppieren, Vorschau berechnen und übernehmen. Der Zylinder wird
mit den vorhandenen Netzwerkzeugen abgezogen. Diese benötigen geeignete
geschlossene Netzkörper; Kurven von Netzformen bestehen aus Facetten.

Der Schalter verändert weder vorhandene Teile noch Auswahl, Sichtbarkeit,
Projektformat oder Undo-Historie. Er betrifft ausschließlich neue Formen aus
der Palette. Separate Werkzeuge, Importe und KI-Befehle behalten ihren expliziten
Typ. Im Layouteditor ist der Schalter ausgeblendet. Easy Tinker verwendet
weiter seinen eigenen CAD-/Netz-Arbeitsbereich unabhängig von dieser Wahl.
