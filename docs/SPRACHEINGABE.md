# Spracheingabe im KI-Chat

## Windows-Diktat

Das Mikrofonsymbol direkt am Eingabefeld öffnet die Windows-Spracheingabe. Alternativ kannst du das Feld fokussieren und **Win+H** drücken. Dieser Weg braucht Internet. Microsoft verarbeitet die Sprache. Beende danach das Windows-Mikrofon und prüfe den Entwurf vor dem Senden.

## Deepgram

**Sprechen** nutzt optional Deepgram mit einem separat gespeicherten API-Schlüssel. Erst beim Stoppen der Aufnahme sendet Formnaro das Audio zur Erkennung an Deepgram. Der erkannte Text ergänzt den Entwurf. Die Nachricht wird erst durch **Senden** an den gewählten Chat-Anbieter übermittelt. Eine Aufnahme ist auf drei Minuten begrenzt.

Die portable Ausgabe enthält keine lokale Spracherkennung.

`npm run test:speech` prüft Audioformat, Entwurf, Berechtigungen und Abbruch. Der Desktop-Prüflauf verwendet synthetisches Audio und eine simulierte Deepgram-Antwort.
