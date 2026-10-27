# Formnaro Mini Mesh 0.7.0 · KI und automatische Netzreparatur

Oben **✦ KI** öffnet den Chat; das Zahnrad öffnet eigene Mini-Einstellungen.
Die bisherigen Formnaro-Anbieter (OpenAI Responses, kompatible Chat-Anbieter,
DeepSeek und lokale kompatible Anbieter) stehen zur Verfügung. Vorhandenen
Schlüssel dort selbst eintragen. Optionales Merken nutzt die Windows-
Verschlüsselung dieses Computers. Es werden keine Einstellungen, Schlüssel oder
Profile aus anderen Ausgaben übernommen. Die normale Modellierung bleibt offline.

Erst **Senden** überträgt Auftrag, Chatverlauf, angehängte Bilder und eine
Zusammenfassung der Szene mit Namen, Maßen und Parametern an den Anbieter.
Rohe Dreieckslisten und Reparaturquellen werden dafür nicht übertragen.
**Modellbild anhängen** hängt eine aktuelle Ansicht an. API-Kosten richten sich
nach dem gewählten Anbieter. Es wird kein lokales Sprachmodell mitgeliefert.

Die KI kann die zwölf Mini-Grundformen anlegen, Maße/Position/Drehung/Parameter
und Erscheinung ändern, duplizieren, Körper und Lochformen verbinden,
Schnittmengen bilden, Gruppen auflösen, auf den Boden setzen und automatisch
reparieren. Gruppen behalten ihre bisherigen Quellen. Zum Bearbeiten einer
Quelle die Gruppe ausdrücklich auflösen. Native CAD-Werkzeuge, STEP, freie
Skripte und andere nicht aufgeführte Großversionswerkzeuge sind nicht enthalten.

Bis zu zwei reine Messrunden können Grenzen, Volumen, Körperzahl und Netzstatus
abfragen. Sollmaße, Volumen, Körperzahl und begrenzte freie Zylinderkorridore
können als Ergebnisanforderung geprüft werden; falsche Ergebnisse werden
zurückgewiesen. Bis zu zwei Korrekturen behalten die zuerst gültig angegebenen
Anforderungen bei. Zylinderprüfungen verwenden ein konservativ umschriebenes
128-Eck mit angegebener radialer Toleranz. Netz-/Float32-Genauigkeit gilt;
es gibt keinen allgemeinen Nachweis von Druckbarkeit oder Passung.

**Ansehen** zeigt einen flüchtigen Vorschlag; **Übernehmen** erzeugt einen
gemeinsamen Rückgängig-Schritt. Verwerfen, Abbrechen und veraltete Revisionen
ändern den bestätigten Stand nicht. Gesperrte und ausgeblendete Teile werden
von den KI-Modellbefehlen nicht bearbeitet.

Die Werkstatt bietet JSON-Befehle, ein gültiges Befehlsbeispiel und exportierbaren
Kontext für externe KI-Werkzeuge. Das funktioniert auch ohne Cloud-Schlüssel.
Die optional aktivierbare lokale Schnittstelle arbeitet ausschließlich auf
Loopback mit Zugriffstoken und denselben Vorschau-/Übernahmeprüfungen.
Ihre Verbindungsdatei gehört nicht in weitergegebene Archive.

## Automatische Reparaturen ohne Einstellungen

Beim STL-Import bleibt der bisherige schnelle Importweg für bereits akzeptierte
Netze erhalten. Schlägt dieser fehl, versucht Mini automatisch:

1. Exakt doppelte und entartete Dreiecke entfernen, Flächenrichtungen innerhalb
   eindeutig orientierbarer Bereiche konsistent machen.
2. Falls nötig: bestehende kollineare T-Verbindungen durch Aufteilen der
   Nachbarfläche korrigieren, nach außen orientieren und einfache Randlücken
   aus drei Punkten oder konvexen, koplanaren vier Punkten schließen.
3. Das vollständige Ergebnis erneut auf geschlossene Topologie, eindeutige
   Punkt-/Kantenverbindungen und positiven Manifold-Körper prüfen.

Die zweite Stufe entspricht dem begrenzten STL-Verfahren der Großversion und
unterstützt bis zu 40.000 Eingabedreiecke. Sie wird in Mini bei mehreren
beschädigten Hüllen nicht eingesetzt, damit eine unklare Innenhülle nicht
versehentlich zu Material wird. Die erste Stufe unterstützt bis zu 500.000
Dreiecke; der Import bleibt auf 250.000 Dreiecke/25 MB begrenzt.

**Netz reparieren** in der Werkzeugleiste arbeitet dieselben Stufen für die
sichtbaren, entsperrten ausgewählten Netze ab. Gesunde Teile bleiben unverändert;
ohne tatsächliche Änderung entsteht kein Undo-Eintrag. Bei einer fehlgeschlagenen
Auswahlreparatur bleibt die gesamte Auswahl unverändert.

Keine Punkte werden absichtlich verschoben, keine Toleranzverschweißung, kein
Voxel-/Hull-Neubau und kein Löschen getrennter Bestandteile. Ein „einfacher Rand“
bezieht sich auf seine Punktzahl, nicht auf seine Größe in Millimetern. Ob eine
solche Öffnung beabsichtigt war, kann die Automatik nicht entscheiden. Das
ursprüngliche Netz wird deshalb zusammen mit dem Reparaturbericht im Projekt
erhalten; beim Import setzt Rückgängig den gesamten Import zurück. Normales
Normieren/Exportieren unterliegt weiterhin der Manifold-Float32-Darstellung.
Komplexe Öffnungen, unklare Verbindungen und nicht reparierbare Netze werden mit
Hinweis abgewiesen. Selbstüberschneidungsfreiheit und Wandstärke werden durch
diese Topologie-/Körperprüfung nicht allgemein bewiesen.

Format bleibt `.fmini`, Version 1. Neue optionale Felder `repairSource` und
`repairReport` erhalten den Rohstand auch beim Speichern und in der Bibliothek.
Quellen zählen zum 32-MB-/500.000-Dreiecke-Projektbudget. Solche Projekte mit
0.7.0 oder neuer weiterbearbeiten. Beim portablen Update `Daten-Mini` und
`Bibliothek` sichern und mitnehmen; ältere Ausgaben bleiben separat erhalten.

Diese Lieferung ist für Windows. Die bisherige Android-Test-APK wird dadurch
nicht aktualisiert; die Cloud-/Loopback-Anbindung benötigt den Desktopadapter.
