# Formnaro Mini Mesh für Android-Tablets

Erste installierbare Testausgabe: **0.5.0-android.1**. Referenzgerät ist das
Galaxy Tab S7. Die App verwendet keine Samsung-spezifischen APIs.

## Voraussetzungen und Installation

- Android 10 oder neuer, aktuelles Android System WebView, WebGL 2.
- Für Tablets ausgelegt; Querformat bietet mehr Platz. Hochformat und
  geteilte Fenster werden ebenfalls berücksichtigt.
- Die APK auf das Tablet übertragen, dort öffnen und bei Bedarf der
  verwendeten Datei-App die Installation aus dieser Quelle erlauben.
- Updates mit derselben Signatur über die vorhandene App installieren.
  Deinstallation löscht interne Projekte, Einstellungen und Bibliothek.
  Wichtige Projekte vorher als `.fmini` sichern.

Dies ist eine mit dem lokalen Android-Debugschlüssel signierte Testausgabe.
Eine Veröffentlichung im Play Store und eine dauerhafte Releasesignatur
sind nicht Bestandteil dieser Ausgabe. Der private Schlüssel gehört nicht
in Git oder Weitergabepakete. Vor einer späteren Veröffentlichung muss der
Signierungs- und Aktualisierungspfad festgelegt werden.

## Bedienung

- **Formen:** Form antippen, dann auf die Arbeitsfläche oder eine Körperfläche
  tippen. Android-Zurück bricht die laufende Platzierung ab.
- Ein Finger wählt Teile und bewegt sie; Eck-, Höhen- und Drehgriffe bearbeiten
  die Auswahl. Numerische Maße stehen unter **Eigenschaften**.
- **Ansicht drehen:** Mit einem Finger die Kamera drehen.
- Zwei Finger auf der Arbeitsfläche verschieben und zoomen die Ansicht;
  eine laufende Bewegung eines Teils wird dabei verworfen.
- **Mehrfachauswahl:** Teile durch Antippen zu-/abwählen, ohne Umschalttaste.
  Für gemeinsame Bearbeitung den Schalter anschließend wieder ausschalten.
- Formen und Eigenschaften lassen sich über die oberen Schalter einblenden.
  Die Werkzeugleiste lässt sich auf schmalen Fenstern seitlich scrollen.
- **Speichern/Öffnen/Importieren/Exportieren:** Android-Dateiauswahl.
  STL-Export umfasst weiterhin nur markierte sichtbare Teile.
- Android-Zurück schließt zuerst einen Dialog oder bricht eine Vorschau ab;
  ansonsten wird nach Sicherung die App geschlossen.

## Speicherung und Offlinebetrieb

Alle Programmdateien und der unveränderte Manifold-WASM-Kern liegen in der
APK. Es gibt keine Netzwerkberechtigung, keinen Server, kein Konto und keinen
Cloudschlüssel. Android-Dateianbieter können unabhängig davon auch eigene
Cloudspeicher anbieten, wenn der Nutzer diese im Systemdialog auswählt.

Bestätigte Änderungen werden direkt an eine geordnete native Schreibwarteschlange
übergeben. Android `AtomicFile` schützt die letzte vollständige interne Sicherung.
Bibliothekseinträge werden zunächst in einem temporären Ordner geschrieben und
erst vollständig veröffentlicht. Diese Mechanismen ersetzen keine exportierten
Sicherheitskopien und garantieren keinen Erhalt eines gerade noch laufenden
Rechenschritts bei Stromausfall oder erzwungenem Prozessende.

`.fmini` bleibt Format 1 und ist mit Mini 0.5 für Windows austauschbar.
Die große Formnaro-App und bestehende Windows-Ausgaben werden nicht verändert.

## Architektur und Build

Die Android-App nutzt eine kleine native Java-Hülle mit AndroidX
`WebViewAssetLoader`. Der Inhalt kommt ausschließlich aus APK-Assets über eine
lokale HTTPS-Origin. Die Nachrichtenanbindung ist auf deren Hauptfenster
beschränkt (`WebViewCompat.addWebMessageListener`); externe Navigation und
Frames sind gesperrt. Es gibt keinen allgemeinen Dateipfadzugriff aus JavaScript.
Systemdateien werden ausschließlich über das Storage Access Framework geöffnet.
Der Renderer und die Modelloperationen bleiben gemeinsame Mini-Quellen.

Voraussetzungen: Node >=22.16, JDK 17, Android SDK 35 und Buildtools,
Gradle 8.11.1. `ANDROID_HOME` und bei Bedarf `FORMNARO_GRADLE` setzen.
Der Buildhelfer erkennt unter Windows das lokale SDK und eine vorhandene
Gradle-8.11.1-Wrapperinstallation. Für andere Installationen den absoluten
Gradle-Pfad explizit über `FORMNARO_GRADLE` angeben.

```powershell
cd mini
npm ci
npm test
npm run test:touch
npm run build:android
```

Standardausgabe: `mini/work/android-output/Formnaro-Mini-Android-0.5.0-test1.apk`
mit SHA256-Datei; `FORMNARO_ANDROID_OUTPUT` setzt ein anderes Ausgabeverzeichnis.
Android-Build und Desktop-Build liegen getrennt unter `dist-android` und `dist`.
Für die Android-Prüfung startet man einen frischen eigenen Emulator, installiert
die APK und startet `de.formnaro.mini/.MainActivity`. Anschließend:

```powershell
$env:FORMNARO_ANDROID_TEST_DEVICE='emulator-5580'
npm run test:android
```

Der Smoke-Test verändert nur synthetische Daten in einem eigenen Emulator.
Er verwendet den ausschließlich in Debug-Builds aktiven WebView-Debugzugriff.
Nachweise liegen unter `mini/work/android-smoke`; ein physisches Galaxy Tab S7
oder eine breite Geräteabnahme wird damit nicht behauptet. Insbesondere reale
GPU-Leistung, S-Pen/Handballenerkennung, sehr große Modelle und unterschiedliche
Dateianbieter müssen auf Geräten geprüft werden.

AndroidX WebKit und seine transitiven AndroidX-Abhängigkeiten stehen unter
Apache License 2.0. Die vorhandenen Mini-Lizenzen für Three.js, Manifold,
fflate und die Symbole gelten auch für die Android-Ausgabe.

Technische Quellen: [lokale WebView-Inhalte](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content),
[Android-Dateiauswahl](https://developer.android.com/training/data-storage/shared/documents-files).
