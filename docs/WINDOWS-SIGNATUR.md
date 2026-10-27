# Digitale Windows-Signaturen für Formnaro

**Entscheidung vom 27.10.2026:** Der Projekteigentümer hat festgelegt, dass keine
Codesignatur eingerichtet wird. Die technisch geprüften Ausgaben werden ohne
Signatur veröffentlicht; eine Signieridentität ist keine Freigabevoraussetzung.
Auf Downloadseite und in Versionshinweisen soll kein Signaturhinweis erscheinen.
Die folgenden Einrichtungs- und Prüfhinweise dokumentieren die frühere Vorbereitung
und sind kein aktueller Veröffentlichungsauftrag oder Freigabeblocker.

Stand der Vorbereitung: 26.10.2026. Die lokale Windows-Ausgabe 0.108.0 ist noch
unsigniert. Ein Codesignatur-Zertifikat oder ein verifiziertes Signierkonto ist
auf diesem Rechner derzeit nicht eingerichtet. Die Vorprüfung steht lokal unter
`work/signing/preflight-0.108.0.json` und hat ausdrücklich `ready:false`.

## Lokale Ausgaben

Die Entwicklung erfolgt weiterhin im lokalen Projektordner. Die aktuelle
freigegebene Anwendung liegt in
`output/Technische-Ansichten-v0.108.0-r3/Formnaro-win32-x64/Formnaro.exe`.
GitHub ist ein zusätzlicher Veröffentlichungsort. Persönliche Modelle und
Zugangsdaten werden nicht mit veröffentlicht.

## Benötigte Identität

Für die öffentliche Verteilung wird ein Codesignatur-Zertifikat einer anerkannten
Zertifizierungsstelle oder ein entsprechender Signierdienst benötigt. Selbst
ausgestellte Zertifikate sind für die öffentliche Windows-Verteilung ungeeignet.
Auch eine gültige Signatur beseitigt SmartScreen-Warnungen nicht sofort: Die
Reputation der Datei und des Herausgebers spielt weiterhin eine Rolle.
[Microsoft: SmartScreen-Reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation).

Ein möglicher Weg ist **Microsoft Artifact Signing**, früher Trusted Signing.
Die Zulassung ist vor einer Buchung zu prüfen: Public Trust ist für
Organisationen unter anderem in der EU verfügbar, für Einzelentwickler derzeit
jedoch nur in den USA und Kanada. Für einen privaten Entwickler in Deutschland
ist dieser Weg daher derzeit nicht verfügbar. Die folgende Microsoft-Anleitung
gilt nur bei erfüllter Zulassung; alternativ wird ein für die eigene Identität
verfügbares Codesignatur-Zertifikat benötigt.
[Microsoft: geografische Voraussetzungen](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart#prerequisites).

Der Basic-Tarif kostet laut Microsoft derzeit **9,99 USD pro Monat** für bis zu
5.000 Signaturen. Schon das Erstellen eines Signierkontos beginnt die Abrechnung.
Hier wurde kein Konto und kein kostenpflichtiger Dienst angelegt.
[Tarif und Kontingent](https://learn.microsoft.com/azure/artifact-signing/how-to-change-sku),
[Abrechnungsbeginn](https://azure.microsoft.com/pricing/details/trusted-signing/).

Die Identitätsprüfung muss der Herausgeber im Azure-Portal selbst durchführen.
Danach ein **Public Trust**-Zertifikatprofil wählen. Der im Zertifikat sichtbare
Herausgeber folgt der verifizierten Identität. Ausweise, Passwörter und private
Schlüssel gehören nicht in Chat, Repository oder Programmpaket.
[Microsoft: Einrichtung und Identitätsprüfung](https://learn.microsoft.com/azure/artifact-signing/quickstart).

## Vorbereitete Werkzeuge

`scripts/windows-signing.mjs` unterstützt zwei Verfahren:

- `certificate-store`: Zertifikat einschließlich privatem Schlüssel im lokalen
  Windows-Zertifikatspeicher; Auswahl über seinen öffentlichen Fingerabdruck.
- `artifact-signing`: Microsoft-Signierdienst über SignTool, Dlib und lokale
  Metadatendatei. Der private Schlüssel bleibt beim Dienst.

Die Beispiele `scripts/signing-profile.example.json` und
`scripts/signing-metadata.example.json` nach `work/signing/profile.json` und
`work/signing/metadata.json` kopieren und dort die tatsächlichen Angaben einsetzen.
`work/` bleibt außerhalb von Git. Die Metadaten enthalten Konto-/Profilnamen und
den passenden regionalen Endpunkt, keine Anmeldedaten.

Artifact Signing benötigt einen aktuellen SignTool, .NET-8-Runtime und
`Microsoft.ArtifactSigning.Client`. Der hier vorhandene SDK-SignTool 10.0.19041
ist für gewöhnliche Zertifikatssignaturen geprüft; für Artifact Signing muss der
neuere, von Microsoft dokumentierte SDK-Stand eingerichtet werden. Die Vorprüfung
meldet fehlende oder zu alte Werkzeuge. Anmelden beispielsweise über Azure CLI;
die Anmeldung und Identitätsprüfung bleiben getrennte Schritte.
[Microsoft: Werkzeuge und Integration](https://learn.microsoft.com/azure/trusted-signing/how-to-signing-integrations).

Vorprüfung ohne Änderung einer Programmdatei:

```powershell
node scripts/windows-signing.mjs preflight output/Technische-Ansichten-v0.108.0-r3/Formnaro-win32-x64 --report work/signing/preflight-0.108.0.json
```

Nach Einrichtung zusätzlich `--profile work/signing/profile.json` angeben.
Ein vollständig ausgefülltes Profil ersetzt nicht die Prüfung der Identität,
der Rechte am Zertifikatprofil und der tatsächlichen Anmeldung.

Für ein Zertifikat aus dem Windows-Speicher hat das lokale Profil dieses Format:

```json
{
  "provider": "certificate-store",
  "certificateThumbprint": "OEFFENTLICHEN-40STELLIGEN-FINGERABDRUCK-EINTRAGEN",
  "store": "CurrentUser",
  "timestampUrl": "https://ZEITSTEMPELDIENST-DER-ZERTIFIZIERUNGSSTELLE"
}
```

## Vorhandene Ausgabe als getrennte Kopie signieren

Erst mit gültigem Profil ausführbar:

```powershell
node scripts/windows-signing.mjs sign-copy output/Technische-Ansichten-v0.108.0-r3/Formnaro-win32-x64 --profile work/signing/profile.json --destination output/Technische-Ansichten-v0.108.0-signiert-r1/Formnaro-win32-x64 --report work/signing/signatur-0.108.0.json
```

Der bisherige Freigabeordner wird nicht überschrieben. Signiert wird der eigene
Programmeinstieg `Formnaro.exe`. Fremde Laufzeiten, vorhandene Herstellersignaturen
und `app.asar` behalten ihre Bytes. Nach dem Signieren werden Windows-Vertrauen,
Zeitstempel, PE-Programminhalt und alle übrigen Programmdateien geprüft. Nur der
PE-Prüfsummenwert, der Zertifikatverweis und die angehängte Signatur dürfen sich
an der EXE ändern. Dieser Bytevergleich ersetzt keine kryptografische Prüfung.

Die signierte Kopie braucht anschließend einen eigenen Abnahmebericht,
Startprüfung, neue Datei-Prüfsummen und ein neues Archiv. Der ursprüngliche
Abnahmebericht gilt weiterhin ausschließlich für das ursprüngliche Programm.

## Künftige Builds

Der gemeinsame Packager unterstützt:

```powershell
$env:FORMNARO_SIGNING_PROFILE = (Resolve-Path work/signing/profile.json).Path
$env:FORMNARO_REQUIRE_SIGNATURE = '1'
```

Die Signierung erfolgt nach dem Packen vor EXE-/ASAR-Manifest und vollständigen
EXE-Tests. Fehler bei Signatur oder Zeitstempel verhindern diese Freigabe. Ein
bereits abgenommener Ordner wird bei `sign-in-place` abgelehnt. Das Skript
exportiert keine privaten Schlüssel und unterstützt keine Passwortargumente.
Der neue Merkmals-Wrapper `scripts/package-feature-references.mjs` setzt diese
Signaturpflicht selbst. Nur `r1 --candidate-only` wählt einen getrennten,
ausdrücklich unsignierten Testkandidaten mit `releaseReady: false` und
`NICHT-FREIGEGEBEN.txt`. Er ist keine signierte Veröffentlichung. Ein konfiguriertes
Signierprofil ist in diesem Testmodus absichtlich ausgeschlossen.
SHA-256 und RFC-3161-Zeitstempel folgen den
[Microsoft-Empfehlungen](https://learn.microsoft.com/windows/win32/seccrypto/time-stamping-authenticode-signatures).

## FreeCAD-Parameter ab 0.110.0

`npm run package:freecad-document -- r1` verlangt die geprüfte Signieridentität.
Für die lokale technische Prüfung ohne Zertifikat gibt es ausdrücklich
`npm run package:freecad-document -- r1 --candidate-only`. Dieser Weg erstellt
einen getrennten Testkandidaten und keine signierte Freigabe. Die technische
Kandidatenabnahme erfolgt nach Sichtprüfung der tatsächlich gepackten Aufnahmen
mit `node scripts/verify-freecad-document-candidate.mjs r1 --visual-reviewed`.
Die Signierkonfiguration und Schlüssel bleiben außerhalb der Auslieferung.
