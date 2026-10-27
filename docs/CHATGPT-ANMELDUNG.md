# ChatGPT-Abo in Formnaro 0.98

In den KI-Einstellungen den Anbieter **ChatGPT-Abo** auswählen und **Continue with ChatGPT** anklicken. Im normalen Browser bei OpenAI anmelden und die Nutzung für Formnaro freigeben. Anschließend in Formnaro ein verfügbares Modell auswählen. Die Anmeldung, Modellverfügbarkeit und Limits werden von OpenAI bestimmt; diese Anbindung befindet sich dort in der Preview. Ohne Freigabe erscheint eine Fehlermeldung; Formnaro wechselt nicht automatisch auf eine kostenpflichtige API-Verbindung.

Die offizielle dynamische Registrierung für lokal betriebene Anwendungen benötigt weder einen API-Schlüssel noch ein Client-Secret. Ein ChatGPT-Konto mit zulässiger Abo-Nutzung ist erforderlich. Formnaro überträgt beim Senden Auftrag, Chatverlauf, benötigten Modellkontext und gegebenenfalls Bilder. Bestehende ChatGPT-Unterhaltungen werden nicht gelesen. Lokal installierte Formnaro-Werkzeuge prüfen die zurückgegebenen Vorschläge wie bisher. Eine Anmeldung führt selbst keine Modelländerung aus.

**Nutzung verwalten** öffnet die ChatGPT-Nutzungseinstellungen. Dort gelten die Konto- und App-Limits sowie die vom Benutzer gewählte Behandlung eines Guthabens. Formnaro zeigt keine erfundenen Kontingente an. Die lokale Whisper-Erkennung bleibt unabhängig vom Konto; die ChatGPT-Abo-Anbindung unterstützt derzeit keine Audioeingabe oder Transkriptions-API.

## Speicherung und Abmeldung

Anmeldeinformationen bleiben im Electron-Hauptprozess und werden mit Windows/Electron safeStorage verschlüsselt unter dem lokalen Formnaro-Profil in `chatgpt/accounts.enc` gespeichert. Sie sind kein Bestandteil portabler Programmausgaben, Modelle, KI-Kontexte oder Browser-Speicher. Auch öffentliche IPC-Antworten enthalten keine Token. Account-/Client-Zuordnungen bleiben beim Abmelden erhalten; Token werden entfernt. Der stabile Host-Bezeichner bleibt über Programmstarts erhalten.

Die Anmeldung verwendet einen temporären Callback auf 127.0.0.1, PKCE/S256, State und Nonce. ID-Token werden anhand der offiziellen JWKS auf RSA-Signatur, Aussteller, Zielgruppe, Ablauf und Kontozuordnung geprüft. Token-Erneuerungen werden serialisiert, einschließlich einer lokalen Prozesssperre gegen konkurrierende Formnaro-Instanzen. Abmelden versucht die Sitzung bei OpenAI zu widerrufen und meldet einen nicht bestätigten Widerruf ausdrücklich.

API-Anbieterprofile und ChatGPT-Abo sind getrennt. Die kompatible bisherige API-Konfiguration und verschlüsselte API-Schlüssel bleiben für ältere Programmausgaben erhalten; die neue Auswahl liegt in eigenen Einstellungsfeldern.

## Transport und Prüfgrenzen

Modellliste und Anfragen verwenden ausschließlich `https://api.openai.com/v1` mit dem eigenen OAuth-Zugriffstoken. Es gibt keinen Zugriff auf Codex-Authdateien oder private ChatGPT-Webendpunkte. Die Kontomodellliste berücksichtigt die veröffentlichte Sichtbarkeit. Antworten laufen über HTTP/SSE mit `store:false`, `stream:true`, Entwickleranweisungen und vollständigem Anfragekontext. Nicht unterstützte Parameter wie `max_output_tokens` werden weggelassen. Nur ein erfolgreicher `response.completed`-Abschluss darf als Vorschlag weiterverarbeitet werden; Unterbrechungen, Limits und unvollständige Antworten werden abgelehnt.

Tests decken lokale OAuth-Gegenstellen mit echten RSA-Signaturen, PKCE, ungültige Zustände, Identitätswechsel, Abbruch, Sitzungserneuerung, Widerruf, Profiltrennung, Modelllisten und Streamfehler ab. Die isolierte Desktop-Prüfung prüft Einstellungen, IPC, Abweisung ohne Anmeldung und unveränderte CAD-Projekte. **Eine echte Anmeldung und Modellantwort über das persönliche Konto muss der Benutzer nach Freigabe im Browser erproben; synthetische Tests belegen keine Konto-Freischaltung.**

Offizielle Quellen, geprüft am 26.10.2026:

- [Übersicht für lokale Anwendungen](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registrierung und Anmeldung](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Konten und Sitzungen](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Modelle und Anfragen](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Preview-Grenzen](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

## 0.98.1 Denkaufwand und Stream-Kompatibilität

Denkaufwand ist im KI-Chat unter der Modellauswahl und in den KI-Einstellungen wählbar. Automatisch lässt den Modellstandard unverändert; low/medium/high/xhigh/max sowie gegebenenfalls none/minimal erscheinen nur bei bestätigter Unterstützung. Die Kontomodellliste hat Vorrang vor dokumentierten Modellvorgaben. Unbekannte Modelle bleiben automatisch. OpenAI und DeepSeek speichern ihre Einstellungen getrennt; ein Modellwechsel setzt die OpenAI-Auswahl auf Automatisch zurück. Höhere Stufen können mehr Zeit und Kontingent benötigen. Die ausgewählte Stufe wird tatsächlich als reasoning.effort übertragen.

Live wurde reproduziert, dass der Abo-Endpunkt gültiges SSE ohne Content-Type und mit leerem output im Abschlussereignis liefert. Der Empfänger prüft deshalb den tatsächlichen Ereignisinhalt und berücksichtigt vollständig abgeschlossene output_item.done-Teile. Erst response.completed gibt den Vorschlag frei; bloße Deltas, fehlerhafte oder abgebrochene Streams bleiben unbrauchbar.

Quelle: https://developers.openai.com/api/docs/guides/reasoning und https://developers.openai.com/api/docs/guides/deployment-checklist (26.10.2026).
