# Aktuelle Windows-Ausgabe bauen

Die Standardbefehle verwenden die Version aus package.json:

Die folgenden Befehle dienen der großen Release-/Abschlussabnahme. Sie werden
gemäß [Prüfstrategie im Ausbauplan](AUSBAUPLAN-AB-0.106.md) nicht automatisch
nach jedem Einzelpunkt ausgeführt. Während der Umsetzung stattdessen die
zum jeweiligen Punkt passenden Tests und Bedienprüfungen auswählen.

```
npm ci
npm run package -- r1
```

Soll zunächst nur die große Quell-/Startabnahme erfolgen, ist
`npm run test:cad-release` die Alternative. Sie muss nicht routinemäßig direkt
vor einem Paketlauf wiederholt werden, der seine erforderlichen Prüfungen
bereits selbst ausführt. Für einzelne Arbeitspunkte die betroffenen Testdateien
und passenden Verifikationsflags aus scripts/all-functions-catalog.mjs auswählen.

Jeder Lauf friert eigene Quellen ein und erzeugt eigene Prüfprotokolle unter
work/current-release. Ein vorhandener Ausgabeordner wird nicht überschrieben;
für einen weiteren Paketlauf r2, r3 usw. angeben. Die Ausgabe liegt unter
output/Formnaro-v<VERSION>-r<N>. Frühere Releases sind keine
Buildvoraussetzung. Wenn die letzte lokale Freigabe vorhanden ist, werden deren
geschützte Programmdateien zusätzlich vor und nach dem Bau auf Änderungen geprüft.

Der Quelltest führt die aktuelle explizite Release-Testauswahl einschließlich
der Speicher-, Layout-, Katalog-, Schrift- und Startregressionen aus und baut
die Oberfläche. Anschließend wird der Startfehler samt System-Theme im echten
Electron-Fenster mit isolierten Daten geprüft. Der Paketbefehl führt diese
Prüfungen erneut gegen eingefrorene Quellen und die vorhandenen 23 fachlichen
EXE-Suiten sowie die neue Startprüfung gegen die tatsächliche neue EXE aus.
Ein Paketlauf ist erst bei erfolgreicher Abnahme abgeschlossen.

Für den begrenzten letzten Nachlauf der Wartung 0.113.1 wurde eine geprüfte
Basis wiederverwendet: scripts/release-test-scope.mjs vergleicht die eingefrorenen
Dateien, akzeptiert ausschließlich die ausdrücklich geprüfte Änderungsliste und
protokolliert 687 Basistests sowie 82 neue gezielte Tests getrennt. Unbekannte
Abweichungen blockieren diese Wiederverwendung. Alle 24 EXE-Läufe wurden am
endgültigen Paket neu ausgeführt. Das ist keine allgemeine Skip-Option.

Die umfassendere, dynamisch ermittelte Auswahl aller Node-Testdateien ist separat:

```
node scripts/test-all-functions.mjs --mode source --suite unit --output work/all-tests
```

## Laufzeiten und Werkzeuge

Benötigt werden Windows x64, Node entsprechend package.json, der versionierte
WASM-Kern unter cad-kernel-build/runtime und die folgenden lokalen Laufzeiten:

- converter/runtime-v010-security: nativer STL-Konverter einschließlich Lizenzen.
  Der Build ist in converter/README.md beschrieben; Abhängigkeiten sind in
  converter/uv.lock festgeschrieben. Dieser Ordner ist ein Buildartefakt und wird
  bewusst nicht durch Git bereitgestellt.
- speech-runtime: Die gepinnten Dateien werden mit
  node scripts/setup-speech-runtime.mjs vorbereitet und per SHA256 geprüft.
- Die integrierte CAD-Laufzeit mit `npm run setup:cad-runtime` vorbereiten.
  Dies lädt beim Bau das fest gepinnte offizielle FreeCAD-1.1.4-Paket und
  dessen Quellarchiv. Native Tests verwenden diese Laufzeit. Allgemeine
  Paketläufe liefern sie ebenfalls mit; keine externe Installation als
  unbemerkter Ersatz. Die saubere Windows-Abnahme von Paket 6a bleibt bis
  zum protokollierten Abschluss offen. Details: INTEGRIERTE-CAD-LAUFZEIT.md.
- Eine lokale deutsche Windows-Systemstimme für die synthetische Sprachprüfung.
  Die Testaufnahme wird pro Lauf erzeugt; keine Datei aus einem alten work-Ordner
  und keine Mikrofonaufnahme des Nutzers sind erforderlich.

Ein frischer Klon benötigt damit explizite Laufzeitvorbereitung, aber keine
historischen Prüfberichte oder Ausgaben von einem anderen Rechner.

Ältere versionsgebundene Paketskripte bleiben für die Nachvollziehbarkeit
historischer Ausgaben erhalten. Sie sind keine aktuellen Standard-Einstiege.
Die früheren allgemeinen Einstiege `scripts/run-cad-release-gates.mjs` und
`scripts/package-cad-release.mjs` leiten dagegen auf `current-release.mjs`
weiter, auch bei direktem Aufruf. Sie verwenden damit die Version aus
`package.json` und erzeugen aktuelle Prüfbelege selbst; historische
`work/cad-v011`-Berichte, Quellarchive oder generierte Bindings sind keine
Eingaben mehr. `work/` bleibt lediglich ein lokal erzeugter Arbeits-/Belegordner.
Die oben beschriebene Laufzeitvorbereitung bleibt erforderlich; ein bytegleiches
Nachbauen des veröffentlichten ZIPs wird dadurch nicht zugesichert.


## Gezielte Paket-8-Ausgabe 0.115.0

`npm run test:curved-remesh` prüft die neuen Netzwerkzeuge und ihre direkten
Controller-/Quellen-/Schutzgrenzen. `npm run package:curved-remesh -- r1` friert
eigene Quellen ein, prüft zusätzlich die betroffenen Speicher-/Katalogwege,
baut eine separate Windows-Ausgabe und führt die drei gezielten Netz-/Pinsel-
Desktopläufe aus. Die CAD-/Sprach-/Konverterlaufzeiten stammen aus der lokal
vorhandenen abgenommenen 0.114.0-r7-Ausgabe; die CAD-Kopie wird vollständig
SHA-geprüft. Die erste Paketierung erfordert genau diese Basisausgabe.
Danach müssen Paketbilder und physische Exporte unabhängig geprüft und die
Freigabe dokumentiert werden. Dies ersetzt nicht die allgemeine Abschlussabnahme.


## Gezielte Paket-9-Ausgabe 0.116.0

`npm run package:mesh-surgery -- r2` friert Quellen ein, führt die 112 gezielten
Tests und vier echten Windows-Läufe aus. Vorausgesetzt ist die unveränderte
abgenommene 0.115.0-r1-Ausgabe unter output/Gekruemmte-Netze-v0.115.0-r1;
deren integrierte CAD-/Sprach-/Konverterlaufzeiten werden weiterverwendet.
CAD-Laufzeit wird vollständig SHA-geprüft. Sichtprüfung, unabhängige
Exportprüfung und dokumentierte Freigabe schließen die Abnahme ab.
Die allgemeine gemeinsame Prüfung erfolgt nach Paket 10.


## Gemeinsame Ausbauprüfung 0.117.0

`node scripts/package-final-expansion.mjs rN` friert alle verfolgten Quellen und vorbereiteten lokalen Laufzeiteingaben ein, prüft sämtliche aktuellen Node-Testdateien frisch und baut eine Windows-EXE. Danach folgen der allgemeine Windows-Katalog und gezielte Erweiterungspfade. Grundlage ist die unveränderte akzeptierte 0.116.0-r2-Laufzeit. Visuelle Prüfung, unabhängige physische Exportleser, Archiv-Rücklesung und dokumentierte Freigabe ergänzen den automatischen Lauf. Persönliche Profile und Modelle gehören nicht zur Paketbasis.

Für die finale Generation wurde der vollständige R5-Unit-Lauf bei SHA-belegter Gleichheit aller Funktionsdateien, Testdateien, Build-Ausgaben und Laufzeiteingaben referenziert. Die einzigen Änderungen sind drei ausdrücklich eingebettete Windows-Verifier-Korrekturen: Vorschau-Bereitschaft, aktuelle Netz-Importoption und nummerierte STL-Datei einschließlich bytegenauer Belegkopie. Alle Original-Receipts, TAP-Zahlen und Log-Prüfsummen wurden kontrolliert; keine fehlgeschlagenen oder fremden Unit-Ergebnisse übernommen. Alle Windows-Suiten laufen an der neuen finalen Paketidentität frisch. Ihre gewöhnliche lokale CAD-Laufzeitkopie wird vollständig geprüft; der Regressionstest kopiert daraus erneut in einen frischen physischen Ordner und verlinkt diesen für einen echten AppContainer-Auftrag. Beide Konverteraliase verwenden dieselbe akzeptierte Laufzeit. Das Python-SDK und der Verbindungsadapter liegen zusätzlich physisch neben der EXE, weil externes CPython nicht aus Electron-ASAR importieren kann.


Die gemeinsame R7-Abnahme enthält zusätzlich fünf Spezialläufe mit vier extern korrigierten Prüfmodulen. Veraltete Zugriffe auf verborgene Headerknöpfe werden durch echte Mausklicks auf Solid-/Fusion-Extras-Menüeinträge ersetzt; die Laufzeitprüfung vergleicht kanonische physische Pfade über Windows-Verzeichnislinks hinweg. Die Prüfer werden vor dem isolierten Teststart einzeln und SHA-gebunden geladen; alle fachlichen Assertions und die Programmdateien bleiben unverändert. Exakte reversible Patches, Originalfehler und erfolgreiche neue Berichte sind lokal in externalsuiteprovenance-v2.json gebunden.

Die vier exakten Prüferkorrekturen sind ohne persönliche Pfade in `ABNAHME-PRUEFER-0.117.json` versioniert. Für neue Paketbauten diese reinen Prüferkorrekturen vor dem nächsten Einfrieren in die Prüfquellen übernehmen. Die geprüfte R7-Anwendung bleibt unverändert.


## MIT-Nachtrag 0.117.0-r8

R8 ist ein belegter Lizenz-/Metadaten-Nachtrag zur vollständig geprüften R7-Modellbasis. Der eigene Code trägt SPDX MIT; originale Fremdtexte und native Laufzeitbytes bleiben erhalten. Ausschließlich die eigene FreeCAD-Quellnotiz und ihre Manifestzeile wurden neutralisiert und neu gepinnt. Die vier dokumentierten Verifierkorrekturen sind in den Prüfquellen enthalten. Neubuild, sieben echte DE/EN-Lizenz-UI-Prüfungen an der R8-ASAR sowie 95 gepackte EXE-Gruppen sichern den Nachtrag. Referenzumfang und Nachweisgrenzen: MIT-FREIGABE-0.117.md.
