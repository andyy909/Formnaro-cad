Immer zuerst die aktuelle lokale Kontextdatei `work/kontext.txt` lesen, sofern
sie vorhanden ist, und alles Wichtige ergänzen. Sie enthält die lokale
Entwicklungshistorie und bleibt außerhalb von Git. In einem neuen Checkout
`docs/PROJEKTKONTEXT.md` als technischen Projektkontext lesen und wichtige
allgemeine Änderungen dort ergänzen. Persönliche Modelle, Profile und
Zugangsdaten gehören nicht in den gemeinsamen Projektkontext.

Programmname: Formnaro (zuvor Tinkoff/OfflineCAD). Die folgenden technischen
Bezeichnungen und Profilpfade bleiben zur Kompatibilität erhalten.

Für direkte Modellieraufträge in der laufenden Formnaro-Anwendung ist der
lokale MCP-Server `offlinecad` eingerichtet. Zuerst `offlinecad_context` und
`offlinecad_scene` lesen. Änderungen mit `offlinecad_preview` gegen die aktuelle
Revision berechnen und prüfen; dann mit `offlinecad_apply` übernehmen, sofern
der Nutzer die betreffende Modelländerung beauftragt hat. Bestehende Quellen,
Parameter, Sperren und unbeteiligte Teile erhalten. Keine Teständerungen im
Nutzerprojekt übernehmen, wenn lediglich eine Verbindung geprüft werden soll.

Falls die MCP-Werkzeuge in einer laufenden Codex-Sitzung noch nicht geladen sind,
ist dieselbe direkte Steuerung über `scripts/offlinecad_ai.py` verfügbar:
`python scripts/offlinecad_ai.py --connection "<Profilpfad>/ai-bridge.json" <command>`.
Unter Windows ist der Standardprofilpfad `%APPDATA%/offlinecad`; maßgeblich ist
der in Formnaro angezeigte Verbindungsdateipfad. Python 3.10 oder neuer verwenden.
Der Client liest den lokalen Zugriffstoken intern. Verbindungsdatei und Token
nicht ausgeben, in Prompts aufnehmen oder in Auslieferungen kopieren. Formnaro
muss geöffnet und die lokale KI-Schnittstelle aktiviert sein. Es wird kein
zusätzlicher Cloud-API-Schlüssel für diese Verbindung benötigt.
