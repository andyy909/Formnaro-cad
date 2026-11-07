# Gesamtplan: Anforderungen Punkte 11 bis 15

**11. Nativen Speicherverbrauch über vollständige Arbeitsabläufe begrenzen.**

Die Protokolle enthalten Abstürze bei Szenenabfragen nahe der 4-GiB-Grenze des gebauten WASM-Kerns. Deshalb werden neben Modellierbefehlen auch wiederholte Abfragen und Darstellungsaktualisierungen untersucht.

- JavaScript-Speicher, reservierten WASM-Speicher und soweit messbar tatsächlich belegte native Speicherbereiche getrennt erfassen.

- Spitzenwerte und Lebensdauer von Konstruktionen, Booleschen Zwischenkörpern, Prüfobjekten und Darstellungsdaten messen. BRep- und Cache-Schlüsselgrößen allein gelten nicht als Messung des gesamten nativen Speichers.

- Wiederholte Bewegungs-, Szenen- und Darstellungsabfragen an einer repräsentativen größeren Baugruppe als eigenen Lastfall aufnehmen.

- Aus den Messungen ein sicheres Betriebsbudget unterhalb der Laufzeitgrenze ableiten und vor dessen Überschreitung geordnet reagieren.

- Nicht mehr benötigte native Objekte und Caches freigeben. Falls ein Worker erneuert werden muss, dies nur an einer sicheren Auftragsgrenze tun und bestätigtes Modell, Undo, Gelenke sowie gültige Vorschauen erhalten beziehungsweise geprüft wiederherstellen.

- Ein Speicherleck, Fragmentierung oder eine bestimmte native Fehlerstelle erst dann als Ursache benennen, wenn die Messungen dies belegen.

**Fertig, wenn:** Der festgelegte Lastlauf innerhalb des dokumentierten Speicherbudgets bleibt oder kontrolliert mit eindeutigem Status beendet wird. Anschließend lässt sich ohne Verlust bestätigter Änderungen weiterarbeiten. Speicherentlastung beziehungsweise Workererneuerung und die Erhaltung von Modell und Undo sind nachgewiesen.

**12. Den Speicherfehler im Korrekturblock gezielt beseitigen.**

- Den Acht-Befehle-Fall mit und ohne Zwischenanzeige ausführen und auf die kleinste fehlerauslösende Folge reduzieren.

- Speicherbelegung und Lebensdauer der nativen Zwischengeometrien pro Befehl erfassen.

- Nicht mehr benötigte Zwischenobjekte freigeben und unnötige wiederholte Berechnungen unveränderter Teile vermeiden.

- Die atomare Übernahme erhalten: ein fehlgeschlagener Block darf keine Teiländerungen hinterlassen.

Die konkrete Fehlerstelle wird durch den reproduzierbaren Fall bestimmt; ein allgemeines Speicherleck wird nicht vorab unterstellt.

**Fertig, wenn:** Der ursprüngliche Block wiederholt ohne Kernfehler funktioniert und nach einem absichtlich ausgelösten Fehler weitergearbeitet werden kann.

**13. Lange Außengewinde intern in begrenzten Flächenabschnitten aufbauen.**

Der aktuelle Gewindeaufbau erzeugt Schraubflächen über die gesamte Länge. Die vorhandenen Tests decken unter anderem sehr kurze Gewinde von 1,25 mm ab.

- Den Aufbau langer Schraubflächen zunächst in begrenzten Abschnitten erproben. Höchstens acht Umdrehungen je Abschnitt dienen als vorläufiger Versuchswert; die endgültige Begrenzung wird erst anhand der gemessenen Stabilität, Laufzeit und Speicherspitzen festgelegt.

- Gegen den bisherigen Aufbau vergleichen und den Aufwand des anschließenden Verbindens mitmessen. Eine günstigere Einzelberechnung darf nicht durch teureres Zusammenfügen erkauft werden.

- Profil, Phase, Drehsinn und Steigung über alle Abschnitte hinweg aus denselben Ausgangswerten berechnen.

- Die Abschnitte intern zu einer geschlossenen Geometrie verbinden.

- Nach außen bleibt eine Spindel ein bearbeitbares Gewindebauteil.

- Die bisherigen Genauigkeits- und Gültigkeitsprüfungen beibehalten. An den Abschnittsübergängen zusätzlich Profil, Gangphase und geometrische Kontinuität prüfen.

**Fertig, wenn:** Die CNC-Spindeln als vollständige native Volumenkörper entstehen, wiederholt neu berechnet, gespeichert, erneut geöffnet und als STEP exportiert werden können. Die Abschnittslänge und ihre Messbelege sind dokumentiert. Sichtbare Einzelstücke oder eine still vereinfachte Ersatzgeometrie gelten nicht als Erfüllung.

**14. Innengewinde getrennt reparieren und ihre Toleranzfehler erklären.**

- Zuerst beim gescheiterten Mutternfall messen, in welchem Aufbau- oder Booleschenschritt die Toleranzgrenze überschritten wird.

- Fehler um gemessenen Wert, zulässige Grenze und betroffene Geometriephase ergänzen.

- Den Aufbau des Gewindeschneidkörpers und den anschließenden Abzug korrigieren; dabei die vorhandene Genauigkeitsgrenze erhalten.

- Runde und sechskantige Muttern, Spiel, Fasen und beide Drehrichtungen prüfen.

**Fertig, wenn:** Die im CNC-Auftrag benötigten Muttern echte Innengewinde erhalten und die bestehenden Toleranzprüfungen bestehen.

**15. Gleiche Geometrie wiederverwenden und Detaildarstellung trennen.**

- Vorhandene Geometrie- und Anzeigecaches für identische unveränderte Gewinde und Muster nutzen.

- Cache-Schlüssel müssen sämtliche geometrischen Parameter, Genauigkeit und relevante Laufzeitversion berücksichtigen.

- Unterschiedliche Positionen und starre Orientierungen dürfen nicht unnötig dieselbe lokale Geometrie neu erzeugen. Die rotationsstabile Toleranzberechnung aus Etappe 1 muss auch bei Cachetreffern und späteren Bearbeitungen erhalten bleiben.

- Eine ausdrücklich wählbare vereinfachte Anzeige ergänzen, ohne Quellen oder vollständige Exportgeometrie zu ersetzen.

**Fertig, wenn:** Wiederholte gleiche Teile weniger Berechnungsarbeit verursachen und Parameteränderungen zuverlässig eine neue Berechnung auslösen. Echte Geometrie bleibt der Standard.

