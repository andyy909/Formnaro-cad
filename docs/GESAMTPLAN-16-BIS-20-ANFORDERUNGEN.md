# Gesamtplan: Anforderungen Punkte 16 bis 20

**16. Den Anker bei Größenänderungen ausdrücklich wählbar machen.**

- Die bisherige Eckverankerung als kompatiblen Standard erhalten.

- Zusätzlich Mittelpunkt oder eine ausdrücklich gewählte Ecke festhalten können.

- Bei der Vorschau die daraus entstehende Positionsänderung melden.

- Dieselbe Bedeutung in Oberfläche, Werkzeugauskunft und KI-Befehlen verwenden.

**Fertig, wenn:** Die X-Mutteraufnahme verkleinert werden kann, ohne ihre gewünschte Mitte zu verschieben. Gedrehte und gespiegelte Teile werden mitgeprüft.

**17. Baugruppenbildung von geometrischer Vereinigung klar trennen.**

- Die bestehende Boolesche Gruppierung unverändert eindeutig als geometrische Vereinigung beschreiben.

- Eine Aktion „Als starre Baugruppe verbinden“ anbieten, die vorhandene feste Gelenke verwendet.

- Einen Hauptkörper ausdrücklich auswählen; die übrigen Körper bleiben einzeln erhalten und werden daran befestigt.

- Widersprüchliche bestehende Gelenkbeziehungen vor jeder Änderung melden.

- Ordner bleiben reine Organisation.

**Fertig, wenn:** Mehrere Teile gemeinsam bewegt werden können, ohne eine aufwendige Boolesche Vereinigung auszulösen oder vorhandene Bohrungsgeometrie zu verändern.

**18. Ausrichten und Bohren auf die richtige Bezugsebene erleichtern.**

- Die vorhandenen Bezugspunkt-, Achs- und Ausrichtfunktionen mit konkreter Werkzeugauskunft versehen.

- Ziel, Bezug und Koordinatensystem in der Vorschau sichtbar machen.

- Bei Bohrungen deutlich unterscheiden, ob ein Unterteil oder der gesamte Halter bearbeitet wird.

- Vorhandene Bohrungs- und Abstandsmessungen direkt zur Ergebnisprüfung anbieten.

**Fertig, wenn:** Lagerachsen ausgerichtet und durchgehende Halterbohrungen erzeugt werden können, ohne dass die KI ihre Wirkung aus der Objektstruktur erraten muss.

**19. Die Werkzeugauskunft aus r35 um genaue Modellierbefehle ergänzen.**

Die vorhandene Auskunft erklärt bereits Werkzeuge und Bedienfelder. Zusätzlich benötigt eine externe KI gezielt abrufbare Befehlsdetails.

- Einen kleinen Index der Modellieroperationen anbieten.

- Für einen ausgewählten Befehl die tatsächlichen Felder, Einheiten, Grenzen und ein gültiges Beispiel liefern.

- Diese Informationen aus denselben Definitionen beziehen, die auch die Eingaben prüfen.

- Besonders Gewinde, Größenänderung, Gruppierung, Gelenke und Speichern zuerst vollständig abdecken.

**Fertig, wenn:** Eine KI diese Aufgaben anhand der Auskunft ausführen kann, ohne den gesamten Befehlskatalog laden zu müssen.

**20. Ein kompaktes Schnittstellenprofil anbieten.**

- Neue MCP-Clients zunächst mit einem kleinen Kontext und gezielt nachladbaren Befehlsdetails versorgen.

- Vollständige Beschreibungen für bestehende Clients weiterhin anbieten.

- Die vollständige Validierung bleibt im Programm; kleinere Werkzeugbeschreibungen dürfen keine Regeln umgehen.

- Szenenabfragen auf ausgewählte Hauptkörper beziehungsweise gezielt angeforderte Quellen begrenzen können.

**Fertig, wenn:** Dieselben Modellierbefehle im kompakten und vollständigen Profil gleich geprüft werden und die übertragenen Informationsmengen messbar sinken.
