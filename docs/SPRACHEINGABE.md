# Lokale Spracheingabe im KI-Chat

In Formnaro 0.97 ist neben dem Nachrichtenfeld **Sprechen** verfügbar. Sprache wählen, Aufnahme starten, sprechen und **Stoppen** drücken. Whisper fügt den erkannten Text an die vorhandene Nachricht an. Maße, Namen und Einheiten prüfen und danach selbst **Senden** drücken. Eine Aufnahme ist auf drei Minuten begrenzt.

**Aufnahme verwerfen** beendet Aufnahme oder Erkennung. Eine bestehende Nachricht bleibt erhalten. Ist die Nachricht zu lang, bleibt der erkannte Text separat bearbeitbar, statt abgeschnitten zu werden. Das Einklappen des Chats beendet eine laufende Aufnahme.

Die Erkennung läuft auf der CPU des PCs, ohne Cloudkonto und ohne API-Schlüssel. Die portable Ausgabe enthält das Sprachmodell bereits. Es wird weder eine Aufnahme hochgeladen noch automatisch eine KI-Anfrage gesendet. Erst beim normalen Senden gelten die bestehenden Einstellungen des gewählten KI-Anbieters für den Nachrichtentext und Modellkontext.

Audio wird während der Aufnahme im Speicher gehalten und für Whisper vorübergehend als WAV gespeichert. Nach Erfolg, Fehler oder Abbruch werden WAV und vorübergehende Textdatei entfernt. Nach einem harten Prozessabbruch oder Stromausfall können Dateien im Windows-Tempordner `Formnaro-Speech` zurückbleiben. Es gibt kein Aufnahme- oder Transkriptarchiv. Erkannte Texte können Fehler enthalten; insbesondere Maße immer prüfen. Bei fehlendem Zugriff die Windows-Mikrofonberechtigung prüfen.

Verwendet werden [whisper.cpp](https://github.com/ggml-org/whisper.cpp) b5454 (Commit d1be6fd) und das mehrsprachige Modell [Whisper large-v3-turbo, Q5_0](https://huggingface.co/ggerganov/whisper.cpp). Modell und CPU-Laufzeit werden anhand von SHA-256 geprüft. MIT-Lizenzen liegen unter `resources/speech`.

Entwicklung: `node scripts/setup-speech-runtime.mjs` lädt ausschließlich die im Manifest festgelegten Dateien und prüft ihre Hashes. `npm run test:speech` prüft Audioformat, Prozessgrenzen und Bereinigung. `npm run package:speech` erstellt eine getrennte portable Ausgabe und prüft dort den echten Recorder/Whisper-Ablauf mit einem synthetischen deutschen Audioeingang. Das ersetzt keinen Test mit dem jeweiligen physischen Mikrofon.
