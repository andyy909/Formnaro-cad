# Gemeinsamer Formnaro-CAD-Kern

Dieses lokale Runtimepaket enthält den gemeinsamen produktiven CAD-Kern für
Formnaro 0.11: den vorhandenen Replicad/OCCT-Kern mit zusätzlichen nativen
Formnaro-Schnittstellen. Alle CAD-Körper bleiben im selben WASM-Modul.
Es enthält keine Modelle, Profile, Tokens oder persönlichen Daten.

Der Kernel stammt aus den exakten Quellen und dem Buildimage in
`upstream-lock.json`. `build-inputs.json` enthält die Eingabehashes;
`formnaro_cad.provenance.json` und `formnaro_cad.build-manifest.json` dokumentieren
den Originalbuild. `integrity.json` enthält vollständige SHA256-Werte.
Die Zeitstempel der Upstream-Provenienz verwenden dessen festes
`SOURCE_DATE_EPOCH`, damit Builds reproduzierbar bleiben.

OpenCascade.js steht unter LGPL 2.1; OCCT unter LGPL 2.1 mit der
Open-CASCADE-Ausnahme (SPDX: `LGPL-2.1-only WITH OCCT-exception-1.0`).
Die Original-Replicad-Wrapper und die ergänzte Formnaro-Bridge stehen unter MIT;
FreeType und RapidJSON enthalten ihre eigenen Lizenztexte unter `licenses/`.
Die ursprünglichen Copyright-Vermerke bleiben erhalten.

Der mit Emscripten5.0.1 erzeugte Laufzeitcode enthält auch dessen System-
Bibliotheken. Die vollständigen Originaltexte für Emscripten/AUTHORS, mimalloc,
musl, libc++/libc++abi, libunwind und compiler-rt sind unter `licenses/` enthalten;
ihre exakten Quellen und SHA256-Werte stehen in `system-license-lock.json`.
Portions of this software are copyright © 1996–2023 The FreeType Project
(www.freetype.org). All rights reserved.
Formnaro ergänzt den gemeinsamen Kern am11.10.2026 um native affine
Transformationen, CAD-Strahlen/Normalen, CAD-Punktklassifikation,
triangulierungsfreie BRep-Schreibung und Double-Exporttessellierung.

Die überprüften Quellen können im gemeinsamen Repository mit
`node cad-kernel-build/prepare.mjs` erneut heruntergeladen werden. Ein Neubuild
und die Materialisierung erfolgen über `cad-kernel-build/build.ps1` (Docker)
oder `cad-kernel-build/build.ps1 -Runner Wsl -Distribution Ubuntu` (bereits
vorhandene WSL-Distribution). Es werden keine Systempakete installiert.
Die Binärdateien dürfen nur nach bestandenen Kernel-Laufzeitprüfungen kopiert
werden. `node cad-kernel-build/verify-runtime.mjs` prüft das Paket.

Die produktive Ladeschnittstelle ist `src/cad-kernel-loader.js`; der neue
Einstieg `src/cad-main.js`, Browser-Worker und Node-Prüfungen verwenden dieselbe
JS/WASM-Kombination. `integrity.json` umfasst 24 Dateien einschließlich
14 vollständiger Originallizenz-/Autoren-Dateien. Die Vite-Ausgabe enthält
genau eine gemeinsame CAD-WASM-Datei.

Die vollständigen entsprechenden Quellen stehen in
`Formnaro-CAD-Quellen-v0.11.zip` (fünf exakte Archive, zusätzliche Bridge,
Bindingkonfiguration und Buildskripte) sowie `Formnaro-Quellcode-v0.11.zip`
(Anwendung und tatsächliche Laufzeitprüfungen). Neubuild und vollständiger
Ersatz der passenden JS/WASM-Kombination sind in
`licenses/CAD-Quellen-und-Build.txt` beschrieben. Quellen-Pruefsummen.json
nennt die vollständigen Archiveinträge und SHA256-Werte der Auslieferung.
