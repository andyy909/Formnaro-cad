# Automatische STL-zu-CAD-Rekonstruktion

Im STL-Import **STL als CAD-Körper rekonstruieren → Mit KI → Importieren** wählen.
Die KI übernimmt die Einstellungen, die Auswahl aller Flächenbereiche, die lokale
Umwandlung und die Vorbereitung der CAD-Vorschau. Es sind keine Bereichsklicks,
Flächenbestätigungen oder weiteren Konvertierungsschritte erforderlich.
Am Ende entscheidet der Nutzer mit **Übernehmen** oder **Vorschau verwerfen**.
Die Quelle bleibt erhalten; Übernehmen erzeugt einen gemeinsamen Rückgängig-Schritt.

Die gemeinsame Formnaro-API und das dort eingestellte Modell werden verwendet.
Die explizite Auswahl gilt für diesen Auftrag. Eine fehlende API-Konfiguration
wird angezeigt und kann über die gemeinsamen API-Einstellungen ergänzt werden;
**KI-Rekonstruktion erneut starten** wiederholt den Auftrag. Es gibt keinen
automatischen Wechsel des Anbieters oder Modells.

Die KI erhält den vollständigen vorhandenen Modellierkontext sowie einen eigenen
Werkzeugvertrag. Lokale Messungen liefern Gesamtgrenzen, Dreieckszahl,
Flächentypverteilung, Schutzstatus und pro Bereich Grenzen, Fläche, Schwerpunkt,
gemittelte Normale und erkannte Radien. Die Anwendung arbeitet alle Regionen in
Gruppen von höchstens 256 durch; eine Vorauswahl ist nicht nötig. Die vollständige
Regionenmenge wird bei der automatischen Erkennung nicht auf 256 abgeschnitten.
Dreieckskoordinaten, Dateinamen und Dateipfade werden nicht an den Anbieter geschickt.

Die KI darf Verfahren, Reparatur, Facettenrückfall und eine kleinere Toleranz
wählen. Die festgelegte STL-Einheit und das maximale Abweichungsbudget sind bindend.
Eine STL enthält keine verlässliche physische Einheit; diese wird daher nicht
geraten. Vorhandene Flächenkorrekturen und Schutzbereiche bleiben erhalten.
Bereiche werden lokal segmentiert; die KI kann deren Typ wählen, Bereiche
zusammenführen und schützen. Die native Geometrieprüfung entscheidet über die
Ausführbarkeit, nicht die Behauptung des Modells.

Ungültige Befehle oder lokal abgelehnte Flächenkorrekturen werden mit der echten
Fehlermeldung einmal zur Korrektur zurückgegeben. Ein gescheiterter Konverterlauf
erlaubt einen weiteren Gesamtversuch. Abbruch, Schließen oder eine Projektänderung
verhindern verspätete Übernahmen. Ein nicht berechenbares Ergebnis wird als Fehler
angezeigt. Ein vorhandenes berechenbares Konverterergebnis bleibt bei einem Fehler
der anschließenden CAD-Übernahme sichtbar.

**Ohne KI** bleibt vollständig lokal. Für gezielte Eingriffe gibt es im Konverter
zusätzlich **KI-Flächenkorrektur manuell** mit dem bisherigen Vorschlag-/Bestätigen-
Ablauf. Der direkte STEP-Konverter speichert nach automatischer Berechnung erst
auf ausdrücklichen Klick; es wird kein Dateidialog ungefragt bestätigt.

Grenzen: Die vorhandene lokale Flächenanalyse unterstützt bis 20.000 Dreiecke.
Schwierige Rundungen können bei erlaubt gewähltem Rückfall facettiert bleiben.
Abweichungen sind beidseitige Stichproben, keine garantierten globalen Maximalfehler.
Die ursprüngliche Konstruktionshistorie wird nicht wiederhergestellt.
