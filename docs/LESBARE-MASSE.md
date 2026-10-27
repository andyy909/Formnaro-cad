# Lesbare Maße

Die große Formnaro-Ausgabe ab 0.65 zeigt Maße, Positionen, Winkel und
numerische Formparameter mit höchstens zwei Nachkommastellen. Überflüssige
Nullen und Rechenreste entfallen: `41.00000000000001` erscheint als `41`,
`12.34567` als `12,35`. Auf Englisch wird ein Dezimalpunkt verwendet.

Das gilt auch für den Dialog an den Eck- und Höhengriffen sowie die
Maßübersicht im Eigenschaftenbereich. Neue Werte, die in diesen Feldern
eingegeben werden, werden auf zwei Nachkommastellen gerundet.

Vorhandene präzise Modellwerte bleiben bei Auswahl, Fokussieren, Verlassen
eines unveränderten Felds, Escape und unverändertem Bestätigen des
Eckmaß-Dialogs erhalten. Eine gerundete Anzeige löst keine Modelländerung
und keinen zusätzlichen Undo-Schritt aus. Beim Ändern einer Achse bleiben
die unveränderten anderen Achsen präzise. CAD-Berechnungen und Exporte
verwenden weiterhin die tatsächliche Modellgeometrie.

Die Darstellung wird gemeinsam für Normalmodus und Easy Tinker sowie
CAD-Teile und Netzteile verwendet. Das Projektformat bleibt unverändert.
