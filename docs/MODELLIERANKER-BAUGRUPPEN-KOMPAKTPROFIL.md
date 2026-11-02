# Modellieranker, Baugruppen und kompaktes Schnittstellenprofil

Privater Entwicklungsstand, 02.11.2026. Punkte 16–20 des Gesamtplans; keine neue Installation oder Veröffentlichung.

## Größenanker

`update.set.sizeAnchor` ist optional, nur zusammen mit `set.size`. Ohne Angabe gilt das bisherige Verhalten (`legacy`): lokale Minimum-Ecke bleibt fest. `center` erhält den Mittelpunkt der tatsächlichen lokalen CAD-Grenzen. `{corner:[-1,1,1]}` erhält die ausdrücklich gewählte lokale X-min/Y-max/Z-max-Ecke; −1 bedeutet Minimum, +1 Maximum. Die vollständigen affinen Eltern-, Dreh- und Spiegelmatrizen werden beibehalten. Größe bleibt eine Achsenlänge entlang der Formachsen, kein Welt-AABB-Maß. Vorschauen melden `positionBefore`, `positionAfter`, `positionDelta` und `coordinateSystem:world` je Größenänderung.

Der Eigenschaftenbereich verwendet dieselbe Größenfunktion und bietet die Ankerwahl. Bestehende Aufrufe und direkte Griffoperationen behalten ihre frühere Gegenecken-/Bodenbedeutung. Der Anker ist eine Operationsoption und ändert kein Projektformat.

## Starre Baugruppe

`{op:joint,action:rigid-assembly,mainId,ids}` verbindet ausdrücklich gewählte bestehende Wurzelteile mit festen Gelenken. Hauptkörper und mindestens zwei eindeutige ausgewählte Wurzelteile sind erforderlich. Alle Quellen, Körper-IDs, Bohrungsgeometrien, Platzierungen und Container bleiben erhalten. Es wird kein Boolescher Aufbau ausgeführt. Bestehende widersprüchliche eingehende Gelenke, Zyklen, gesperrte Ziele und veraltete Bezugsrahmen werden vor Änderung zurückgewiesen. Vorhandene passende feste Verbindungen werden erhalten.

Eine freie zusammenhängende Baugruppe kann über `{op:joint,action:rigid-move,mainId,translate:[dx,dy,dz]}` gemeinsam in Welt-mm verschoben werden. Auch abhängige vorhandene Gelenke werden mit ihrem bisherigen Wert erhalten. Ein Hauptkörper mit eingehendem Antrieb wird nicht davon gelöst; dafür den vorhandenen Gelenkwert oder die tatsächliche Basis verwenden. Prüfung und Bewegung sind atomar. Die Gelenkoberfläche bietet Hauptkörperwahl, Verbinden und gemeinsamen Versatz. Jede bestätigte Aktion ist ein Undo-Schritt. „Geometrisch vereinigen“ bleibt die vorhandene Boolesche Operation; Ordner bleiben Organisation.

## Bezüge und Bohrziel

`previewAlign`, `previewAnchor`, `previewReferencePlacement`, `previewPlace` und `previewDrill` besitzen gemeinsame beschriebene Optionsschemas, die vor Ausführung verwendet werden. Native Prüfungen von Geometrie, Referenzen und Abhängigkeiten bleiben zusätzlich maßgeblich. Vorschauen nennen Ziel, Bezug, Koordinatensystem und den tatsächlich verwendeten Rahmen. Ausrichten nach Grenzen ist keine automatische Erkennung beliebiger Lagerachsen: echte native Punkte/Normale wählen. `previewPlace` kann die lokale Z-Achse an einer nativen Flächennormale ausrichten.

Bei `previewDrill` bezeichnet `id` den Wurzelkörper. `scope:root` (bisheriger Standard) bearbeitet das ganze fertige Teil entlang des Bohrwegs, auch wenn mehrere enthaltene Quellen getroffen werden. `scope:source` benötigt `sourcePath` mit den vollständigen aktuellen Quell-IDs. Dann bleibt das Wurzelteil erhalten; nur die gewählte Quelle wird mit erhaltener Originalquelle unter einem neuen Bohrungswrapper bearbeitet. Unbeteiligte Quellen bleiben erhalten. Kein Pfad wird geraten oder still auf die Wurzel umgedeutet.

Unterquellenbohrungen mit mitwachsenden Bohrungen, nachgelagerten geometrischen Bezügen oder gespeicherten Zeichnungs-/Gelenk-/Parameter-/Muster-/KI-Bezugsdaten werden vorerst ausdrücklich zurückgewiesen. Das vermeidet eine still falsche Neuzuordnung. Diese erste Erweiterung ist kein allgemeiner Abhängigkeitsmigrator. Die normale Bohrungsoberfläche nennt den gesamten Wurzelkörper als Ziel; der ausdrückliche Unterquellenpfad ist über die lokale Modellierschnittstelle verfügbar. Der Bericht liefert Eintritt, Weltbezug, Bohrrahmen und Ergebnisziel. Bestehende `cad/bore`- und `cad/minimumDistance`-Abfragen sowie Bohrungschecks sind in der Auskunft verlinkt.

## Gezielte Auskunft

`GET /v1/command_info` bzw. `POST /v1/command_info {}` liefert einen kleinen Index. Details: `{command:create,type:thread}`, `{command:update}`, `{command:group}`, `{command:joint,action:rigid-assembly}`, `{command:save}` oder `{command:tool,tool:previewDrill}`. `offlinecad_command_info` und Python `Client.command_info` verwenden denselben Weg.

Schemata stammen aus dem vollständigen aktuellen Befehlsvertrag; Formparameter mit Einheiten/Grenzen aus den vorhandenen Parameterdefinitionen. Präzise native Werkzeuge verwenden dieselben Optionsdefinitionen für Auskunft und Feldvalidierung. Beispiele enthalten bewusst ersetzbare Zielkennungen und benötigen die aktuelle Szenenrevision. Geometrische Voraussetzungen werden weiterhin nativ geprüft. Die neue Auskunft führt selbst nichts aus und erlaubt keine Dateipfade oder Betriebssystemaufrufe.

## Profile und Szenenumfang

`GET /v1/context` bleibt vollständig. `POST /v1/context {profile:compact}` liefert die kleine Fassung, `{profile:full}` die vollständige. Größenanker, Serverprüfung, Sperren, Quellen, Modellierfreiraum und Vorschau/Apply haben in beiden Profilen dieselbe Bedeutung. Das kompakte Vorschauschema spart den großen Befehlskatalog; seine kleinere Beschreibung ersetzt keine vollständige Prüfung im Programm. Persönliche Modelliernotizen bleiben getrennte Referenzdaten.

Neue generierte MCP-Konfigurationsbeispiele und neu eingerichtete interne MCP-Agenten verwenden compact. Bestehende Adapteraufrufe ohne Profil behalten full. Node: `--profile=compact`; Python: `--mcp --profile compact`. Vollständige Beschreibungen sind jederzeit über `offlinecad_context {profile:full}` oder das vollständige Profil erreichbar. Die beiden Adapter und der Standardbibliothek-Python-Client unterstützen die neuen Wege. Async-Vorschau-Eigentum wird im eingebauten Agenten anhand der von ihm gestarteten Jobkennung verfolgt; fremde Jobs kann er nicht abbrechen oder übernehmen.

`POST /v1/scene {rootsOnly:true}` liest nur Hauptkörper. `{ids:[ROOT_ID]}` liest gewählte Hauptkörper ohne alle Unterquellen. `{targets:[{rootId:ROOT_ID,path:[SOURCE_ID]}]}` liest genau bezeichnete CAD-Quellen. Kombination von IDs und ausdrücklichen Zielen ist möglich. Unbekannte Pfade werden abgewiesen. Jeder begrenzte Bericht nennt ausgelassene Daten und den Umfang; er gilt nicht als vollständige Szene. Automatische Referenz-/Merkmalskataloge werden bei begrenzten Anfragen nicht ungefragt ergänzt. Bestehende GET-Szenenaufrufe bleiben vollständig. Die Begrenzung reduziert die Antwortübertragung, sie behauptet keine Verringerung sämtlicher interner nativer Szenenarbeit.

Prüf- und Größenmessungen werden im privaten Abschlussnachweis neben dem Repository festgehalten. Die gesonderte FreeCAD-/Defender-Grenze aus Punkt 10 bleibt bestehen; diese Änderungen benötigen keinen Start des quarantänisierten FreeCAD-Containerstarters.
