# Verschiebbare Schnittebene und Klickmessung

Formnaro 0.59.0 ergänzt zwei lokale Ansichts- und Messwerkzeuge in der großen
Windows-Anwendung. Die beiden Minis und die Android-Ausgabe bleiben unabhängig.
Es werden kein Internetzugang, Atlas-Konto, KI-Modell oder zusätzlicher Schlüssel
benötigt. Die Werkzeuge verändern weder Körper, Quellen, Farben, Sperren noch Undo.

## Schnittebene verschieben

**Schnittansicht** links in der Arbeitsfläche öffnen. Die sichtbare Auswahl wird
geschnitten; ohne Auswahl gelten die sichtbaren Materialkörper der aktuellen
Ansicht. Versteckte Teile und lose Lochformen gehören nicht zur Schnittauswahl.
CAD und Netzteile können gemeinsam betrachtet werden.

Arbeitsebene oder Weltachse X/Y/Z und die beibehaltene Seite wählen. Der Versatz
ist in Millimetern relativ zur gewählten Ebene. Den Schieberegler oder den gelben
Griff am Ebenenrahmen ziehen. Der Griff bewegt die Ebene entlang ihrer Normalen.
Wenn diese Richtung direkt auf die Kamera zeigt, den Regler oder das Zahlenfeld
verwenden oder die Kamera etwas drehen.

Während des Ziehens wird ausschließlich die vorhandene Darstellung beschnitten.
Diese schnelle Vorschau besitzt offene Schnittflächen. Beim Loslassen, nach einer
bestätigten Zahlenänderung oder mit **Genau berechnen** entsteht die vorhandene
geschlossene native CAD-/Manifold-Schnittdarstellung mit Schnittflächen und Löchern.
Die Laufzeit dieser genauen Berechnung hängt weiterhin vom Modell ab. Es wird
höchstens eine Berechnung gleichzeitig ausgeführt und ein letzter Folgeauftrag
vorgemerkt. Überholte Ergebnisse werden verworfen.

**Schnitt ausschalten**, das Kreuz oder Escape stellen die vollständige Ansicht
wieder her. Änderungen am Modell und ein Wechsel der Schnittauswahl schließen
das Werkzeug. Die bestätigte Schnittebene kann im bestehenden Arbeitsplatzformat
als Ansicht gespeichert werden. STL, STEP und andere Exporte enthalten weiterhin
die vollständigen exportierten Teile. Es entsteht kein neues abgeschnittenes Teil.

## Bequeme Klickmessung

**Messen** links in der Arbeitsfläche öffnet das neue Panel. Drei Messarten:

- **Durchmesser / Radius:** Eine native CAD-Zylinderfläche anklicken. Das können
  der innere Mantel einer Bohrung oder ein äußerer Zylindermantel sein. Angezeigt
  werden Durchmesser und Radius in Weltmillimetern sowie eine Messlinie.
  Gleichmäßige Skalierung, Drehung und Spiegelung sind berücksichtigt. Eine
  elliptische oder freie Fläche erhält keinen erfundenen Kreisdurchmesser.
- **Zwei Punkte:** Zwei sichtbare Modellflächen anklicken. Ergebnis sind der
  räumliche Abstand und ΔX/ΔY/ΔZ. CAD-Punkte werden nativ getroffen, Netzpunkte
  auf den gespeicherten Dreiecken. Auch gemischte CAD-/Netzpaare sind möglich.
- **Zwei CAD-Flächen:** Zwei native Flächen anklicken, auch am selben Körper.
  Gemessen wird der kleinste Abstand der begrenzten Flächen, nicht der Abstand
  zweier unbegrenzt fortgesetzter Ebenen oder bloß der Klickpunkte. Sich berührende
  Flächen ergeben 0 mm. Die Messlinie zeigt ein natives nächstes Punktepaar.

Der nächste Klick beginnt nach einer fertigen Paarmessung ein neues Paar.
**Neue Messung** leert Punkte und Ergebnis. Gesperrte sichtbare Körper können
gemessen werden. **Weitere Messwerkzeuge** öffnet die bisherigen Werkzeuge,
einschließlich Punktfang, kleinstem Körperabstand und ausdrücklicher Maßkorrektur.
Das neue Panel selbst verschiebt kein Teil.

Bei STL/anderen Netzen gibt es in dieser Erweiterung keine automatische native
Bohrungserkennung oder Flächenrekonstruktion. Für sie **Zwei Punkte** verwenden.
Eine nicht kreisförmige CAD-Fläche oder ein mehrdeutiger Kantentreffer wird
verständlich abgewiesen. Native Klickmessungen sind auf 8.000 eindeutige Flächen
je geprüftem Körper begrenzt. Messungen sind vorübergehend und keine zusätzlichen
gespeicherten Maßabhängigkeiten.

## Umsetzung und Prüfung

`cad-section-preview.js` verwendet eine gemeinsame Shader-Ebene und hält die
vorhandenen Körperpuffer unverändert. Ebenenbewegungen benötigen keine native
Abfrage oder Neuvernetzung. Die normalen CAD-Geometrie-/Display-Caches werden
weiterverwendet. Außerhalb der Werkzeuge laufen weder neue Analysen noch eine
ständige Renderanimation.

`cad-click-measure-native.js` verwendet tatsächliche native Weltgeometrie und
begrenzte Flächen. Flächennummern sind nur innerhalb des aktuellen Modellstands
gültig. Der Controller prüft den Modellstand; Werkzeugwechsel, neue Messungen und
Modelländerungen entwerten noch laufende Ergebnisse. Neue Abhängigkeiten und neue
Projektformate sind nicht erforderlich. Die frühere Entscheidung gegen ein eigenes
Druckprüfungs-/Slicerpaket bleibt bestehen.

Reproduzierbare Prüfungen:

```powershell
npm run test:inspection
npm run build
node scripts/package-inspection.mjs
```

Der Pakethelfer erstellt eine neue getrennte Ausgabe, prüft native Geometrie,
echte Mausbedienung, gemischte Projekte, Exporte, Leerlauf und bestehende
CAD-/Easy-/Netzabläufe an Quelle und tatsächlicher EXE. Ein separater Python-Leser
prüft die geschriebenen STL-/Projektdateien. Berichte und die lokale synthetische
Leistungsaufnahme liegen bei der Ausgabe; Messzeiten sind keine allgemeine
Geschwindigkeitszusage für beliebige Modelle.
