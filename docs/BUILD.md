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
