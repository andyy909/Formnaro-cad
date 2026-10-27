# Robuster Netzimport

STL-Dateien als Rohnetz laden, auch wenn sie offen oder beschaedigt sind.
Die automatische Grundbereinigung entfernt exakte Duplikate/Nullflaechen und
richtet geeignete Flaechen aus. Keine Naehetoleranz, keine automatischen Kappen,
keine Entfernung echter Bestandteile. Weiter offene Netze bleiben ladbar.

Binaere STL: 256 MiB / 5 Millionen Dreiecke; ASCII 64 MiB. Ueber 500.000
Dreiecken optional eine Arbeitskopie mit Ziel 250.000, Fehlerwert 0–1 mm
(Vorgabe 0,02). Bericht und zweiter Klick vor Uebernahme. Wird die Arbeitsgrenze
nicht erreicht oder die Topologiepruefung verletzt, bleibt der Import aus.
Kein stilles Erhoehen des Fehlerwertes. Originaldatei fuer Neuimporte behalten;
sie wird nicht veraendert und nicht zusaetzlich in das Projekt eingebettet.
Das Projekt bleibt auf 32 MiB und insgesamt 500.000 Netzdreiecke begrenzt.

Eigener abbrechbarer Importworker; Meshoptimizer ist lokal im vorhandenen
Three.js enthalten. Grundbereinigung und Vereinfachung brauchen keine KI-
Anfrage. Der Importbericht mit Quelldatei-SHA256 bleibt in Objektnotizen fuer
KI und spaetere Nachpruefung. Offene Randkanten, erkannte deutliche Kanten und
Extremrepraesentanten bleiben bei der Vereinfachung fest. Keine Garantie fuer
unerkannte Bohrungen, Passflaechen, Selbstschnittfreiheit oder Druckbarkeit.
Der Fehlerwert ist eine Algorithmusschaetzung, kein globaler Abstandsnachweis.

Ein einzelnes Rohnetz laesst sich auch offen als STL exportieren. Gruppieren,
Subtrahieren und andere Koerperwerkzeuge brauchen weiterhin gueltige Volumen.
Bei unbekannter Materialbelegung wird kein Koerpervolumen behauptet.

Mini CAD: bis 10.000 geeignete geschlossene Dreiecke versucht Automatisch
weiterhin native facettierte CAD-Koerper. Bei Fehlschlag oder groesseren Netzen
bleibt das Rohnetz erhalten. Die ausdrueckliche Rohnetzoption umgeht die CAD-
Umwandlung. Rohnetze sind verschieb-/skalier-/spiegelbar, speicherbar und als
STL exportierbar; native CAD-Werkzeuge und STEP brauchen einen CAD-Koerper.
Gemischte .fmcad-Projekte verwenden Format 2. Reine CAD-Projekte bleiben Format
1; alte Projekte bleiben lesbar. Aeltere Mini-CAD-Versionen koennen Format 2
nicht lesen. Die native KI bearbeitet weiterhin CAD und erhaelt vorhandene
Rohnetze unveraendert samt Reihenfolge, Bericht und Geometrie.

Der Rohnetz-STL-Export prueft die tatsaechlichen Float32-Ausgabepunkte. Exakt kollineare Rundungsrestflaechen werden ohne Punktverschiebung aufgeloest; neue Topologiefehler blockieren den Export. Das Projekt bleibt unveraendert.
