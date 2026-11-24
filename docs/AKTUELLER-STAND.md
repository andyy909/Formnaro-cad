# Öffentliche Windows-Ausgaben / Public Windows releases

- [Formnaro 0.144.0-r1](#formnaro-01440-r1) – reguläre Ausgabe / stable release
- [Windows Nightly 0.148.0-r5](#windows-nightly-01480-r5) – Vorabversion / pre-release

## Formnaro 0.144.0-r1

Ausgabe vom 18. November 2026 · Release dated 18 November 2026.

[GitHub Release](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.144.0-r1) · [Windows x64 ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.144.0-r1/Formnaro-v0.144.0-r1-Windows-x64.zip) · [SHA-256](https://github.com/andyy909/Formnaro-cad/releases/download/v0.144.0-r1/SHA256SUMS.txt) · [Application sources / Programmquellen](https://github.com/andyy909/Formnaro-cad/releases/download/v0.144.0-r1/Formnaro-Quellcode-v0.144.0-r1.zip)

### Deutsch

Das KI-Labor bietet die Ansichten **Einfach** und **Erweitert**. Der Entwicklungscheck beginnt mit 15 Aufgaben auf Low. Fachlich fehlgeschlagene Fälle können auf High und, wenn vom Modell unterstützt und ausgewählt, auf Max erneut laufen. Das Übungsfenster kann für die Serie sichtbar bleiben oder im Hintergrund laufen.

Zusatzprüfungen decken CAD-Alltag, STL-Konvertierung und Fotomodus ab. Der Ergebnisbericht zeigt, ob ein Versuch sofort oder nach einem Prüferhinweis bestand. Das exportierte Prüfpaket enthält Kontextlücken, wiederkehrende Muster, Erstreaktionen und frühere Stufen. Der Benchmarkbericht weist einen Wilson-Bereich und geschätzte Kosten pro bestätigtem Erfolg aus, soweit die Daten dafür vorliegen.

Das Windows-ZIP vollständig in einen beschreibbaren Ordner entpacken und **Formnaro starten** öffnen. Die Windows-EXE ist unsigniert. Programm-, CAD-Kern- und FreeCAD-Quellen sind separate Downloads.

Die Paketprüfung umfasste 999 EXE-Prüfungen. Die Quell-CI prüfte je 544 Testdateien unter Windows und Linux. Die Abnahme am entpackten Paket bestätigte den Start mit frischem Profil, Speichern und Wiederöffnen, STEP-Export, ein Beispielprojekt und die KI-Labor-Anzeige mit archivierten Läufen.

### English

AI Lab has **Simple** and **Advanced** views. The development check starts with 15 tasks at Low. Cases that fail validation can run again at High and at Max when supported by the model and selected. The practice window can stay visible or run in the background.

Supplemental checks cover everyday CAD, STL conversion, and photo mode. Results show whether a run passed on the first attempt or after verifier feedback. The exported evidence includes context gaps, recurring patterns, initial reactions, and earlier stages. The benchmark report includes a Wilson interval and estimated cost per verified success when the data supports those figures.

Extract the entire Windows ZIP into a writable folder and open **Formnaro starten**. The Windows executable is unsigned. Application, CAD-kernel, and FreeCAD sources are separate downloads.

The package passed 999 executable checks. Source CI passed 544 test files each on Windows and Linux. Acceptance of the extracted package verified a launch with a fresh profile, saving and reopening, STEP export, a bundled example, and AI Lab results with recorded runs.

[Release acceptance / Abnahme](https://github.com/andyy909/Formnaro-cad/releases/download/v0.144.0-r1/Abnahmebericht.md) · [PR-CI](https://github.com/andyy909/Formnaro-cad/actions/runs/44264685374) · [main-CI](https://github.com/andyy909/Formnaro-cad/actions/runs/44267318443) · [Tag-CI](https://github.com/andyy909/Formnaro-cad/actions/runs/44267368075) · [Release history / Frühere Ausgaben](https://github.com/andyy909/Formnaro-cad/releases)

## Windows Nightly 0.148.0-r5

[Windows x64 ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.148.0-r5/Formnaro-v0.148.0-r5-Windows.zip) · [SHA-256](https://github.com/andyy909/Formnaro-cad/releases/download/v0.148.0-r5/SHA256SUMS.txt) · [Release notes and sources / Versionshinweise und Quellen](https://github.com/andyy909/Formnaro-cad/releases/tag/v0.148.0-r5)

Das ZIP vollständig entpacken und **Formnaro starten** öffnen. FreeCAD und der STL-Konverter sind enthalten. Die Windows-EXE ist unsigniert. Die Korrektur für Nahtdaten im Orca-3MF-Export aus 0.148.0-r3 ist enthalten.

Im Projektmenü öffnet **Tablet verbinden** den Windows-Begleitmodus. Formnaro erzeugt das TLS-Zertifikat für die lokale Verbindung selbst, ohne externes OpenSSL. Am frisch entpackten Paket wurden QR-Kopplung, Wiederverbindung und der direkte Teiletransfer als Vorschau mit Übernahme und Rückgängig geprüft. Der Transfer wurde mit dem separaten Android-Pilot 35 r32 geprüft. Für die öffentliche APK dokumentiert das Android-Release seinen eigenen Windows-Teststand. [Öffentlicher Android-Pilot 32](https://github.com/andyy909/Formnaro-Android/releases/tag/v0.1.0-pilot.32)

Extract the entire ZIP and open **Formnaro starten**. FreeCAD and the STL converter are included. The Windows executable is unsigned. This build includes the Orca 3MF seam data export fix from 0.148.0-r3.

In the project menu, **Tablet verbinden** opens Windows companion mode. Formnaro generates the TLS certificate for the local connection without external OpenSSL. Checks on the freshly extracted package covered QR pairing, reconnecting, and sending a part directly to the PC for preview, apply and undo. Direct transfer was tested with the separate Android Pilot 35 r32 build. The public APK release records its own tested Windows build. [Public Android Pilot 32](https://github.com/andyy909/Formnaro-Android/releases/tag/v0.1.0-pilot.32)
