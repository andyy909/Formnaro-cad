# Spracheingabe im KI-Chat

**Sprechen** nutzt optional Deepgram mit einem separat gespeicherten API-Schlüssel. Erst beim Stoppen der Aufnahme sendet Formnaro das Audio zur Erkennung an Deepgram. Der erkannte Text ergänzt den Entwurf. Die Nachricht wird erst durch **Senden** an den gewählten Chat-Anbieter übermittelt. Eine Aufnahme ist auf drei Minuten begrenzt.

Formnaro enthält keine lokale Sprachlaufzeit und bietet keinen Sprachmodell-Download an. Ältere Ausgaben und ihre Datenordner behalten ihre bisherigen Dateien.

`npm run test:speech` prüft Audioformat, Entwurf, Berechtigungen und Abbruch. Der Desktop-Prüflauf verwendet synthetisches Audio und eine simulierte Deepgram-Antwort.
