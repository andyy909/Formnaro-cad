# Lochformen gruppieren

Im großen Formnaro ab 0.64 können mehrere Lochformen gemeinsam gruppiert
werden. Alle ausgewählten Teile müssen demselben Modelltyp angehören: CAD
oder Netz. Die Funktion steht im Normalmodus und in Easy Tinker bereit.

1. Mehrere Lochformen markieren und **Gruppieren** wählen.
2. Bei Netzen die Vorschau prüfen und übernehmen.
3. Die entstandene Lochgruppe kann als Ganzes verschoben, gedreht oder
   skaliert werden. Mit einem Materialkörper gruppiert schneidet sie alle
   enthaltenen Löcher gemeinsam aus.

Die Gruppe bleibt eine Lochform. Ihre ursprünglichen Quellen samt
Parametern und Positionen bleiben erhalten. **Gruppe auflösen** stellt sie
wieder einzeln bereit; Rückgängig und Wiederholen funktionieren wie gewohnt.
Überlappende Lochformen können auch per Schnittmenge kombiniert werden.
Eine leere Schnittmenge wird abgelehnt und verändert das Projekt nicht.

Reine Lochgruppen erzeugen beim Export kein Material. Netzoperationen
benötigen weiterhin geeignete geschlossene Volumen. Die Gruppierung
konvertiert keine Netze zu CAD und verändert keine anderen Teile.

Technisch wird die geometrische Vereinigung beziehungsweise Schnittmenge
der Lochquellen gespeichert und die äußere Lochrolle erhalten. Bei
gemischten Gruppen bleibt das bisherige Verhalten bestehen: Materialquellen
vereinigen und Lochquellen abziehen. Eine unterdrückte einzige Materialquelle
einer gemischten Gruppe wird nicht still durch Lochmaterial ersetzt.
