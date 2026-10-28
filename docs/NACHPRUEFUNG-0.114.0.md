# Nachprüfung des externen Berichts zu 0.114.0-r7

Stand: 27.10.2026. Geprüft wurde der lokale Entwicklungsstand auf Basis des
freigegebenen 0.114.0-r7-Codes. Die unten genannten Korrekturen liegen zunächst
im lokalen Arbeitsbaum. Die veröffentlichte EXE und ihre Release-Dateien wurden
nicht ersetzt; sie enthalten diese neuen Korrekturen noch nicht.

## Paketprüfung

Die im Bericht angegebenen SHA-256-Werte von `Formnaro.exe`, `resources/app.asar`
und `resources/freecad/manifest.json` stimmen mit der vorhandenen abgenommenen
Ausgabe überein. Die 16 Startkomponenten wurden erneut anhand ihrer tatsächlichen
Bytes geprüft: 60.008.056 Bytes, alle gültig. Das Manifest enthält 35.586 Einträge
mit zusammen 2.406.017.278 Bytes. Diese Manifestzählung ist keine erneute
Vollprüfung aller Laufzeitdateien. Die vollständige frühere Paketabnahme bleibt
in der Freigabe dokumentiert. Der fremde Prüfbericht allein ersetzt keine eigene
Vollabnahme, und die dortige Kopie auf einem anderen Laufwerk wurde nicht verändert.

## Abgleich der einzelnen Befunde

| Befund im Bericht | Ergebnis dieser Nachprüfung |
| --- | --- |
| 1.1 Gemeinsames Prüf-Promise übernimmt das erste AbortSignal | Bestätigt und behoben. Die Integritätsprüfung gehört der Laufzeit; jeder Aufrufer kann sein eigenes Warten sofort abbrechen. Ein zweiter Auftrag bleibt unberührt. Fehlgeschlagene Prüfungen können erneut gestartet werden. |
| 1.2 ACL-Änderung in schreibgeschütztem Programmordner | Bedingte Einschränkung plausibel, in dieser Runde nicht in einer passenden fremdverwalteten ACL-Konfiguration reproduziert und nicht als behoben ausgewiesen. Ein fehlgeschlagener Rechteaufbau darf nicht als Nachweis bestehender AppContainer-Leserechte behandelt werden. Kein pauschales Ignorieren von Berechtigungsfehlern und keine Änderung der Sandbox. |
| 1.3 Unvollständige Startdateiliste im Entwicklungsmanifest | Bestätigt und behoben. Genau alle 16 unterschiedlichen Kernkomponenten sind erforderlich; fehlende und doppelte Einträge werden zurückgewiesen. |
| 1.4 Ergebnisdateien im Plan-Modus | Bestätigt und behoben. Plan und Python verwenden denselben Leser mit Dateityp-, Symlink-, Realpfad- und Größenprüfung, einschließlich `result.json`. |
| 1.5 Laufzeit-Test hängt vom Arbeitsverzeichnis ab | Bestätigt und behoben. Pfad über `__dirname`; die komplette betroffene Testsuite besteht auch aus einem fremden Arbeitsverzeichnis. |
| 2.1 `border: … fusion …` | Alle 15 Vorkommen bestätigt und durch `solid` ersetzt. Dropdown-Rahmen und aktive Tab-Unterstreichung sind im echten Renderer geprüft. Das sind Darstellungsfehler; die pauschale Einstufung als hoch ist überzogen. Einzelne Rahmen werden im kompakten Layout außerdem absichtlich überschrieben. |
| 2.2 Fehlende Einbindung von `advancedFreeCADUI` | Bestätigt und behoben: Datei-/Moduswächter, Tastenkürzel, laufende Autosicherung, Schließen und Kontext-Übernehmen. Das tatsächlich vorhandene API heißt `close()`, nicht `cancel()`. |
| 2.3 Flächenknöpfe werden nicht deaktiviert | Teilweise richtig und behoben: Werkzeuge mit Quellen benötigen eine passende CAD-Auswahl mit höchstens acht Teilen; alle vier berücksichtigen laufende Berechnungen. Die freie Randkurvenfläche darf ausdrücklich ohne Auswahl erstellt werden und bleibt dann verfügbar. |
| 2.4 Trimmen/Verlängern und Radiusmaß bei Bézier/B-Spline | Bestätigt und behoben. Nicht unterstützte Kurven werden vor der Kreisrechnung mit verständlicher Meldung abgewiesen und in der Oberfläche ausgeschlossen. Kein neuer approximierter Kurven-Trimmalgorithmus. |
| 2.5 Frühe KI-Initialisierung bei markerlosem Datenordner | Bestätigt und behoben. Maßgeblich ist `profil.json`, nicht die bloße Ordnerexistenz. Ein isolierter Desktop-Test prüft die echten ersten KI-Einstellungen nach vorzeitig angelegtem Fehlerordner. Vorhandene portable Einstellungen behalten Vorrang. |
| 2.6 Fusion-Sprachwechsel | Bestätigt und behoben; Fusion wird wie Solid sofort neu synchronisiert. Im echten Desktop geprüft. |
| 2.6 Konstruktionskreise/-bögen | Bestätigt und behoben: echte SVG-Kreis-/Bogenkonturen statt einer Linie. Desktop-Bild geprüft. |
| 2.6 Fixierungsanker bei B-Splines | Die beschriebene Aktualisierungsfunktion ist im vorliegenden Quellstand nicht vorhanden. Elementweite Fixierungen werden erhalten; das Ergänzen oder Entfernen ihrer Kontrollpunkte ist nun gesperrt, bis die Fixierung ausdrücklich entfernt wird. Kein automatisches Verschieben bestehender Fixierungswerte. |
| 2.6 Formel-Endpunkte und gemeinsame Koordinaten | Formelvergleiche beim Wiederaufnehmen/Schließen von Konturen bestätigt und behoben: Vergleich der ausgewerteten Geometrie, symbolische Endpunkte bleiben gespeichert. Der konkrete `Number(v)`-Vorwurf an `replacePoint` trifft hier nicht zu. Das unbeabsichtigte Mitbewegen zufällig deckungsgleicher Kreismitten/Kontrollpunkte ist bestätigt und behoben; nur echte Start-/Endpunkte werden gemeinsam bearbeitet. |
| 2.6 Bibliothekswächter für 23/24 | Bestätigt und behoben. FreeCAD-Parameterbindungen benötigen Bibliothek 23, bearbeitbare Kurven/erweiterte Pfade Bibliothek 24. Zu alte äußere Versionsangaben werden abgewiesen. |
| 2.6 Selbstkollision bei langen Pfadlinien | Noch kein konkreter zulässiger Pfad reproduziert, der den behaupteten Fehler auslöst. Der zitierte lokale Nachbarschaftsausschluss ist zusätzlich durch Tangenten- und Krümmungsprüfungen begrenzt. Die vorhandenen nativen Tests einschließlich zurücklaufendem Pfad bestehen; damit ist keine allgemeine Fehlerfreiheit dieses Algorithmus bewiesen. Keine spekulative Geometrieänderung. |
| 2.6 `max(angles)` und Zylindernaht | Kein entsprechender Fehler mit einem gültigen beauftragbaren Flächenfall reproduziert. Übergänge verlangen zwei geeignete Profilflächen; die nativen Zylindertests prüfen bereits Nahtüberschreitung, Öffnungen, Drehung, Materialänderung und unzulässige Träger. Alle bestehen. Fehlende konkrete Eingaben bleiben eine offene Einschränkung des externen Befunds. |
| 2.6 `.ocad`-Konflikt bei `writeAtomic` | In der beschriebenen Form bereits abgesichert. `shouldCommit` vergleicht den Inhalt nach dem Schreiben der temporären Datei vor dem atomaren Umbenennen und erneut bei jedem Windows-Retry. Der bestehende Test erhält die externe Änderung bei einem Konflikt. Eine absolute dateisystemübergreifende Sperre gegen beliebige fremde Schreiber wird damit nicht behauptet. |
| 2.6 Backup bei unverändertem Layout-Reset | Bestätigt und behoben. Identische gültige Ergebnisse führen nach der Revisionsprüfung zu keinem Schreibzugriff und überschreiben insbesondere kein vorhandenes `.vorher`-Backup. |

## Gezielte Validierung

- 111/111 Tests für die Fehlerfälle und ihre direkten Abhängigkeiten, einschließlich
  Laufzeit, Skizzen, Bedingungen, Bibliotheken, Datenspeicher, Projekte, Layouts
  und Fusion-/Kontextmenüzustand.
- 18/18 native Tests für Kurven, zusammengesetzte Pfade und FreeCAD-Flächen;
  dabei reale Körper, STEP-/FCStd-Rücklesen und Zylindernahtfälle.
- 4/4 native Plan-Tests zusätzlich für tatsächliche Plan-Ausführung,
  Ergebnisformate, Import, Abbruch und zurückgewiesene Geometrie.
- 10/10 Prüfgruppen in einer isolierten Electron-Desktop-Instanz:
  frühe KI-Migration, Tastenkürzel-/Modussperren, CSS, Knopfzustände,
  Fusion-Sprachwechsel, Hilfskurven, Trimmgrenzen, Formelabschluss und Fixierungen.
  Keine Rendererfehler oder externen Anfragen. Screenshot visuell geprüft.
- Die 15 Laufzeit-Tests zusätzlich aus einem fremden Arbeitsverzeichnis bestanden;
  diese Wiederholung wird nicht zu den 111 Tests addiert.
- Produktionsbuild und Diff-Formatprüfung. Keine routinemäßige Gesamtprüfung,
  keine neue Windows-Paket-/VM-Freigabe und kein Versions- oder Releasewechsel.

Die lokalen Protokolle und Prüfbilder liegen unter `work/review-v0114-*` und
bleiben außerhalb von Git. Nutzerprojekte und Nutzerprofile wurden nicht für
die Regressionstests verwendet. Der ursprüngliche Vergleichslauf der neuen
Regressionstests zeigte elf Fehler; nach den Korrekturen besteht die Testsuite.

Sentry wurde auf gesonderten Nutzerwunsch geprüft und ein ausschließlich lesender
Zugang lokal eingerichtet. Die abgefragte Organisation enthält derzeit keine
Projekte; es gibt daher keine Formnaro-Ereignisse für einen zusätzlichen Abgleich.
Keine Sentry-Telemetrie oder Cloud-Fehlerübertragung wurde in Formnaro eingebaut.
Kontodaten und Zugangsdaten gehören ausschließlich in die lokale Ablage.


Die hier dokumentierten lokalen Korrekturen werden mit der neuen privaten
0.115.0-Ausgabe mitgeführt. Die frühere 0.114.0-r7-EXE und ihre veröffentlichten
Archive bleiben unverändert. Paket-8-Prüfungen sind eine separate gezielte
Abnahme und ersetzen die oben dokumentierten Nachprüfungsbelege nicht.
