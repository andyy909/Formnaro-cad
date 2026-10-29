# Große Netze, Zahnradkopplungen und KI-Modellstrenge

Ab Formnaro 0.118.0 stehen drei Ergänzungen bereit. Neue Zahnradkopplungen und
Großnetzrezepte verwenden Projekt- und Bibliotheksformat 26. Ältere Inhalte
bleiben mit ihren bisherigen Formaten lesbar.

## Große Netze vereinfachen

Ein vollständiges sichtbares und entsperrtes Netzteil auswählen. Unter
**Netz-Werkzeuge → Große Netze vereinfachen** die gewünschte Dreieckszahl und
die Detailtreue einstellen. Das Werkzeug unterstützt bis zu zwei Millionen
Dreiecke und eine Million Punkte je Teil. Die bisherigen Werkzeuge für ebene
und gekrümmte Bereiche behalten ihre bisherigen Grenzen.

Die Detailtreue reicht von 0 bis 100. Höhere Werte erlauben weniger Abweichung;
die Zielzahl kann dadurch unerreichbar bleiben. Das interne Abweichungsbudget
reicht von 1 mm bei 0 bis 0,001 mm bei 100. Die im Bericht genannte Abweichung
ist eine Optimiererschätzung, kein garantierter globaler Oberflächenabstand.
Scharfe Kanten können zusätzlich geschützt werden.

Originalkoordinaten bleiben erhalten. Markierte Schutzdreiecke werden exakt
übernommen und neu zugeordnet. Vorhandene beschädigte Verbindungen und
getrennte Flächenfächer an gemeinsamen Punkten werden geschützt. Nach der
Reduktion vergleicht eine getrennte Prüfung Öffnungsränder, fehlerhafte
Kantenbelegungen, Euler-Zahl, entartete Dreiecke und Komponentenzahl. Bei neuen
Problemen wird mit zusätzlichen Sperrpunkten erneut gerechnet oder abgebrochen.

Das Werkzeug repariert keine vorhandenen Fehler und prüft keine allgemeinen
Selbstüberschneidungen. Ein Ergebnis wird deshalb nicht automatisch als gültiger
Materialkörper oder druckfertiges Modell bezeichnet. Original und Vorschau
lassen sich umschalten. Übernehmen erhält die Originalquelle und erzeugt einen
Undo-Schritt; Abbrechen verändert das Modell nicht.

## Zahnradkopplungen

Zunächst für jedes Rad ein eigenes Drehgelenk mit derselben festen Basis
anlegen. Der Bezugspunkt liegt auf der jeweiligen Radachse. Die Achsen müssen
parallel sein; entgegengesetzte Achsenrichtungen werden berücksichtigt.

Im Gelenkbereich **Zahnräder koppeln** zwei Drehgelenke, ihre Zähnezahlen und
Außen- oder Innenverzahnung wählen. Die bestehende Stellung bleibt die
Anfangsphase. Außenverzahnung dreht die Räder physisch gegenläufig,
Innenverzahnung gleichläufig. Jeder beteiligte Drehregler kann die gekoppelte
Kette antreiben. Beispiel: 20 → 40 → 20 Zähne ergeben bei 90° am ersten Rad
die Winkel 90°, −45°, 90° für gleichgerichtete Achsen.

Sperren und Bewegungsgrenzen aller betroffenen Räder werden vor der Vorschau
geprüft. Widersprüchliche Antriebswerte und blockierende Kopplungsschleifen
werden zurückgewiesen. Kopplungen bleiben beim Speichern und vollständigen
Kopieren erhalten. Teilkopien behalten ausschließlich vollständig enthaltene
Beziehungen. Beim Lösen eines Gelenks werden dessen Kopplungen mitgelöst.

Die Kopplung ist eine kinematische Winkelbeziehung. Sie erkennt keine Zähne
aus importierten Netzen, prüft keinen Zahneingriff und simuliert keine Kräfte,
Reibung oder bewegten Achsen. Planetengetriebe werden nicht unterstützt.

## KI-Modellstrenge

Unter **KI-Chat → Modell & Einstellungen** und in der KI-Werkstatt befindet
sich ein lokaler Regler von 0 bis 100. Der Standard 100 erhält das bisherige
Verhalten. Die Einstellung wird beim Start eines Auftrags festgehalten und
auch beim Fortsetzen desselben Auftrags verwendet.

- **0:** Freie Form- und Maßvorgaben. Gemessene Sollabweichungen und
  Fotoabweichungen bleiben sichtbar, lösen allein aber keine automatische
  Korrekturschleife aus. Fehlgeschlagene Messungen werden nicht als bestanden
  ausgegeben.
- **1–99:** Zahlenbasierte Maßprüfungen erhalten den Toleranzfaktor
  `100 / Reglerwert`, beispielsweise Faktor 2 bei 50. Ursprüngliche Sollwerte,
  Toleranzen und Messbefunde bleiben im Bericht erhalten. Körperzahlen und
  Prüfungen ohne entsprechend auswertbaren Zahlenbefund bleiben streng.
- **100:** Ursprüngliche Anforderungen und Toleranzen werden streng geprüft.

Der Regler gilt für die interne KI-Auftragsverarbeitung. Explizite externe
API-Prüfaufträge behalten ihren strengen Vertrag. Dateischemata,
Revisionsprüfung, geschützte Quellen, geerbte Sperren, ausführbare
Modellumgebungen und ausdrückliches Übernehmen bleiben bei jedem Wert aktiv.
Die Einstellung verändert weder Anbieterzugänge noch API-Schlüssel.

## Technische Grundlage

Die Großnetzvereinfachung nutzt den bereits enthaltenen MIT-lizenzierten
Meshoptimizer als WebAssembly. Kein Code aus dem AGPL-lizenzierten OrcaSlicer
wurde übernommen. Die untersuchten Verfahren und Grenzen sind getrennt von
einer vollständigen Nachbildung einer bestimmten Anycubic-Slicer-Version.
