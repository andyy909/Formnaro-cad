# Projektparameter und Varianten

Paket 2 des CAD-Ausbauplans ergänzt eine gemeinsame Tabelle unter **CAD-Werkzeuge → Projektparameter und Varianten**. Im Easy-Modus steht dasselbe Werkzeug unter **Zeichnen & Netz** bereit.

## Maße sammeln und gemeinsam übernehmen

1. Einen Parameter mit Namen und Zahl oder Formel anlegen. Namen bestehen aus Buchstaben, Ziffern und Unterstrichen; Formeln unterstützen `+ - * /`, Klammern sowie `sind` und `cosd` in Grad.
2. Unter **Bindungen** einen Parameter, ein Teil beziehungsweise eine Gruppenquelle und ein freies Maß auswählen. Jede Bindung benennt das Ziel ausdrücklich.
3. **Aktualisieren** berechnet und prüft die betroffenen Teile. **Übernehmen** bestätigt Tabelle und Geometrie gemeinsam in einem Undo-Schritt. Schließen verwirft den Entwurf.

Beispiel: `breite = 26`, `innen = breite - 4`. Bindungen können diese Werte an freie Skizzenvariablen, vorhandene native Formparameter, lokale Größen/Mittelpunkte und unterstützte Modelliermaße wie Wandstärke, Versatz oder Sweep-Radius übertragen. Vorhandene Skizzenformeln bleiben erhalten: Ist die Breite bereits `aussen - 2 * wand`, wird stattdessen eine der freien vorgelagerten Variablen gebunden. Nicht unterstützte oder geschützte Maße sind mit einem Hinweis gesperrt.

Während der Eingabe, Auswahl und Kamerabedienung entstehen keine nativen Neubauten. Ungenutzte Parameter, Umbenennungen und Änderungen in einer inaktiven Variante verändern keine Geometrie. Bei einer Aktualisierung wird jede betroffene Quelle und ihr abhängiger Aufbau höchstens einmal konstruiert; unabhängige bestätigte Teile werden weiterverwendet. Der bisherige Vorlagenweg sammelt ebenfalls seine Bindungen vor dem Teilaufbau.

## Varianten

Eine Variante speichert abweichende Zahlen oder Formeln und ausdrücklich gesetzte Sichtbarkeits- beziehungsweise CAD-Unterdrückungszustände. Nur die aktive Variante erhält vollständig berechnete Geometrie. Die Auswahl einer Variante merkt diese zunächst vor; anschließend **Aktualisieren** und **Übernehmen** verwenden. Ein begrenzter Cache kann kürzlich berechnete Ergebnisse wiederverwenden.

**Ausgeblendet** steuert die Ausgabe des ganzen Teils; **unterdrückt** nimmt eine CAD-Quelle aus ihrem Aufbau beziehungsweise ein fertiges CAD-Teil aus der Ausgabe. Die ursprünglichen Zustände werden als Basis erhalten und beim Wechsel ohne entsprechende Abweichung wiederhergestellt. Netz- und Ansichtsvorlagen verwenden Sichtbarkeit. Bestehende Sperren an Teilen, Quellen, Ebenen und Ordnern gelten auch für Parameter und Varianten.

## Bezüge, Dateien und Export

Parameter und Zielbezüge verwenden stabile Kennungen. Umbenennen erhält die Bindungen und passt referenzierende Parameterformeln an. Zyklen, unbekannte Namen, doppelte Zielbindungen und ungültige Werte werden vor der Übernahme abgewiesen. Fehlende Ziele bleiben erkennbar; sie erfordern eine neue Zuordnung oder **Bindung lösen**. Ein Abbruch, Fehler oder eine veraltete Antwort übernimmt keine Teiländerung.

Separat veränderte gebundene Quellen können den Zustand **Aktualisierung nötig** hinterlassen. Dieser Zustand lässt sich speichern; betroffene Modelle und Zeichnungsquellen werden erst nach erfolgreicher Aktualisierung exportiert. Eine ausdrücklich gewählte unabhängige Teilmenge kann weiterhin ausgegeben werden. Ein Gesamtexport berücksichtigt auch noch nicht übernommene aktive Variantenstatus, damit erforderliche Teile nicht still fehlen.

Neue Daten verwenden Projekt- und Bibliotheksformat **13**, Parameterversion **1**. Alte Formate 5, 7 und 8–12 bleiben lesbar; reine Altprojekte werden nicht pauschal auf 13 angehoben. Bibliothekseinträge erhalten nur ihre ausgewählten Quellen und die dafür benötigten Formelabhängigkeiten; beim Einsetzen werden Kennungen und Namenskonflikte angepasst. Ein Maß darf nicht gleichzeitig durch einen alten Vorlagenregler und einen Projektparameter gesteuert werden.

Grenzen: 100 Projektparameter, 500 Bindungen, 32 Varianten, 500 verschiedene Variantenstatusziele und 100 Werte je Variante. Bisherige Geometriegrenzen der Modellierwerkzeuge bleiben bestehen. Es gibt keine Hintergrundaktualisierung und keine Konstruktion sämtlicher Varianten im Voraus. Die weiteren Ausbaupakete verknüpfte Konturen, Skizzenbedingungen, Gelenke und selektives Laden sind separate Schritte.

## Lokale KI-Schnittstelle

Die lokale Vorschau verwendet dieselbe Tabelle und dieselben Prüfungen: homogene Befehle `parameter` mit `put`/`data`, `selectVariant`/`variantId`, `remove` und abschließend `update`. Erst ein revisionsgebundenes Apply übernimmt den gesamten Auftrag. `put` oder ein Variantenwechsel mit Geometriefolgen erfordern ausdrücklich `update`; allein das Lesen von Tabelle oder Bindungskatalog startet keinen CAD-Aufbau. Der generierte lokale Schnittstellenvertrag enthält die vollständigen Schemas und begrenzten Leseabfragen.
