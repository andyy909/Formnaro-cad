# Formnaro: bewährte Modellierhinweise

Diese Datei enthält praktische Erfahrungen. Der aktuelle Auftrag, die aktuelle
Szene, Sperren und der Werkzeugvertrag sind maßgeblich. Erfahrungen ersetzen
keine Prüfung eines neuen Teils. Keine Schlüssel oder persönlichen Modelldaten
hier eintragen: Der Text wird bei Modellieranfragen an den gewählten Anbieter
übermittelt. Die persönliche Kopie liegt im Datenordner des Programms.

## Konstruktion und Prüfung

- Zuerst Bezugspunkt, Außenmaße, Wand-/Bodenstärken und Bohrungsachsen festlegen.
- Python: Quader beginnen an der unteren lokalen Ecke `origin`; Zylinder und
  Kegel am Mittelpunkt ihrer Grundfläche. Native JSON-Grundformen verwenden
  dagegen Mittelpunkt/Größe. Diese Koordinatenregeln nicht vermischen.
- Schneidwerkzeuge dürfen überstehen. Gewünschte Wandstärken, Radien und
  Passungen bleiben unverändert. Verbindungen müssen wirklich Material teilen;
  ein kleiner nach innen gerichteter Konstruktionsüberstand kann helfen.
- Volumen-Sollwerte mit exakter Formel und Python `math.pi` berechnen, nicht
  im Kopf schätzen. Der Sollwert darf nicht einfach aus dem fertigen Modell
  übernommen werden. Ein falscher selbst berechneter Sollwert blockiert auch
  richtige Geometrie. Automatische Korrektur erhält die ersten Prüfbedingungen.
- Die Python-Variable `result` ist für eine JSON-Ausgabe reserviert. Ein
  `Part`-Objekt dort direkt zu speichern führt zu einem Serialisierungsfehler.
  Das Bauteil z. B. `part` nennen; optional `result={"target":part.target}`
  oder nur Zahlen/Listen/Dictionaries ausgeben.
- Außenmaße und ein gültiger Körper beweisen keine korrekten Bohrungen oder
  Wandstärken. Dafür geeignete zusätzliche Messungen verwenden. Ein freier
  Durchgangskorridor beweist nur den geprüften Korridor.
- Bei langen Konstruktionen kompakte Python-Schleifen und lokale Berechnungen
  statt ausführlicher Koordinatenlisten in der Antwort verwenden. Abgeschnittene
  Antworten sind keine gültigen Vorschläge und dürfen nicht angewendet werden.
- Eine bestandene Vorschau ist kein Nachweis vollständiger Auftragserfüllung.
  Angeben, welche Anforderungen geprüft wurden und welche offen bleiben.
- Python-Endteile können mit `alias="result"` in `model.union/cut/intersect`
  benannt und anschließend über `$result` in Ergebnisprüfungen angesprochen
  werden, wenn diese Hilfe im aktuellen Werkzeugvertrag angeboten wird.

## STL als neues CAD-Modell nachbauen

- STL ist ein Dreiecksnetz. Eine facettierte Umwandlung ist kein parametrischer
  Nachbau mit Skizzen und Bohrungen. Den gewünschten Weg ausdrücklich beachten.
- Zuerst tatsächliche Grenzen und Koordinaten lesen; Schnitte innerhalb der
  vorliegenden Grenzen wählen. Es gibt keine Annahme, dass die Vorlage um den
  Ursprung oder vollständig in positiven Koordinaten liegt.
- In mehreren Höhen und Richtungen messen. Konturpunkte, Kreise, Achsen und
  wiederkehrende Querschnitte aus tatsächlichen Daten ableiten. Lokale Fits und
  Stichproben sind keine globale Fehlergarantie.
- Wenn ein Bericht nur Kennungen, Grenzen oder Flächen liefert, sind das noch
  keine vollständigen Skizzenkonturen. Konkrete fehlende Daten benennen; keine
  Konturen oder Bohrungen erfinden. Vorlage und unbeteiligte Teile erhalten.

## Bewährte Muster aus lokalen Prüfungen

- Offenes Gehäuse: Außenkörper minus nach oben überstehender Innenkörper;
  Schraubdome anschließend mit dem Boden vereinigen. Blindbohrungen erst ab der
  Bodenoberseite beginnen, wenn der Boden geschlossen bleiben soll.
- Flansch: Platte und Aufsatz vereinigen, alle Durchgangsbohrungen danach am
  gesamten fertigen Körper schneiden. Überlappungsvolumen nicht doppelt zählen.
- Konstruktion in Quellen erhalten; nach Vorschau, Übernahme und Speichern
  erneut prüfen. Nur bestätigte lokale Messungen als Beleg verwenden.


## Ergänzungen aus unabhängig überprüften Modellierfällen (25.10.2026)

- Nur Funktionen benutzen, die der aktuelle Werkzeugvertrag wirklich anbietet.
  Neue SDK1.3-Hilfen nicht in älteren Versionen voraussetzen. Nach Gruppierungen
  bei älteren Versionen Quellenpfade erneut aus der aktuellen Szene lesen;
  alte Quellenaliase nicht ungeprüft weiterverwenden. Drehungen wirklich messen.
- Größenänderungen brauchen einen bewussten Anker: Bodenunterkante z=0 erhalten
  bedeutet untere Ecke; eine Bohrung mit fester Achse braucht ihren Mittelpunkt.
  `edit(size=...)` ist an der unteren lokalen Ecke verankert: Ø8→Ø10 kann die
  Bohrungsachse um1mm verschieben. Normale Updates müssen die gemessene Position
  gegebenenfalls zusätzlich setzen, bei Quellen im Elternrahmen. Falls angeboten:
  `await teil.resize(size,anchor="center")` erhält diesen gemessenen Mittelpunkt.
  Größen sind bestehende Editierachsmaße ohne geerbte Skalierung, keine Welt-AABB.
- Bohrwerkzeuge müssen alle geforderten Wände vollständig durchsetzen. Startpunkt,
  Richtung und Länge prüfen; nicht hinter einer Wand beginnen. Falls angeboten:
  `cylinder_between` berechnet aus ausdrücklichen WELTpunkten Richtung/Länge;
  overrun gilt an beiden Enden. Sonst dieselbe Rechnung mit vorhandenen Primitiven.
- `frame(origin=...,normal=...,x_axis=...)` mit benannten Argumenten verwenden:
  Das zweite Positionsargument ist die Normale. Skizzen-Y=Normale×Skizzen-X.
  Bei Normale+Y und Skizzen-X=Welt+X zeigt Skizzen-Y nach Welt−Z.
  Welt(x,z) wird lokal(x,−z). Eine16er-Matrix ist gültig; frame() liefert diese Liste.
  Mit Ursprung(6,24,8) ergibt lokal(17,−19,0) Welt(23,24,27), denn8−(−19)=27.
  Dagegen ergibt lokal(0,+19,0) Welt(6,24,−11). Dies wurde mit dem SDK ausgeführt.
  Eine sprachliche Erklärung oder wiederholte Zustimmung ersetzt diese Rechnung nicht.
- Linke/rechte Dreiecksrippen brauchen nicht dieselbe lokale Punktanordnung.
  Positive Geometrie mitprüfen: Maße, Körperzahl und freie Bohrungen können stimmen,
  obwohl eine Rippe falsch gespiegelt ist. Eckpunkte, Konturen und Längsgrenzen
  mit Auftrag/Referenz vergleichen; reine AABB-Prüfung reicht nicht.
- Ein Mittelschnitt beschreibt nur diese Ebene. Rippen, Ölbohrungen und Absätze
  können entlang der Extrusionsrichtung wechseln. Mehrere Schnitte innerhalb und
  außerhalb der Merkmale messen, z.B.y20 undy30. Einen Schnitt mit Rippen/Ölöffnung
  nicht ungeprüft über die ganze Gehäuselänge extrudieren. Grundplatte, Gehäuse,
  lokal begrenzte Rippen und Bohrungen gegebenenfalls getrennt rekonstruieren.
- Wenn vollständige Konturen angeboten werden: keine Löcher/Schleifen still weglassen.
  Bei großem Bericht vollständige relevante loopIndices, includePoints:false oder
  lokale Python-Verarbeitung nutzen. Eingabe- und Erfahrungskontext nicht kürzen.
- Prüfkorridore müssen zur jeweiligen Feature-Tiefe passen: Ø26-Lagersitze4mm tief
  nicht als Ø26-Durchgang durch eine benachbarte Ø22-Hauptbohrung prüfen. Größte
  Abweichungsstellen und beide Oberflächenrichtungen kontrollieren, soweit angeboten.
- Vor neuen Behauptungen Fakten gegen aktuellen Vertrag/SDK oder lokale Rechnung
  prüfen. Gerade bei widersprüchlichen Antworten: eine einzige ausgeführte Rechnung
  als Beleg verwenden, keine zweite ungeprüfte Zahlenversion danebenstellen.
  Die interne Ursache einer früheren Modellaussage ist meist nicht nachweisbar.
  Beobachteten Fehler und bloße Vermutung trennen; keine unbestätigte Erklärung
  als dauerhafte Regel speichern. Mehr Denkaufwand allein beweist keine bessere Form.
