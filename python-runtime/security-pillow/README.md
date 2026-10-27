# Pillow 13 für die isolierte Python-Laufzeit

Die offizielle Pyodide-Laufzeit 314.0.7 enthält Pillow 12.2.0. Für Formnaro
wurde ein eigenes Pillow-13.0.0-Wheel für dieselbe CPython-3.14-/2026_0-ABI
gebaut. Es bleibt in der bestehenden Sandbox und erhält keine Hostrechte.

`source-lock.json` enthält URLs und SHA256 der unveränderten offiziellen
Quellarchive. Die Rezepte stammen von `pyodide/pyodide-recipes`; angepasst
wurden die Versionen/Hashes von Pillow, libwebp (1.6.0) und libtiff (4.7.2).
Nicht benötigte libtiff-Werkzeuge und fremde Host-Codecs werden nicht gebaut.
Emscripten 5.0.3, pyodide-build 0.39.2 und xbuildenv 314.0.7 sind festgelegt.
Die übrigen Grafikbibliotheken stammen aus den Ports dieses Emscripten-SDKs.

Unter Linux/WSL mit Python 3.14, make, cmake, ninja, pkg-config und C-Compiler:

```sh
bash python-runtime/security-pillow/build.sh /absolute/new-build-directory
```

Der Build verändert keine vorhandene Ausgabe. Das Ergebnis liegt unter
`recipes/Pillow/dist/` des neuen Verzeichnisses. Quellarchive werden anhand der
Rezept-SHAs geprüft. Das Wheel, sein Buildnachweis und die Lizenzen werden nach
Prüfung gemeinsam aktualisiert. Ein abweichender neuer Wheel-Hash muss erklärt
und erneut geprüft werden; der erwartete Hash wird niemals automatisch gelockert.

Der aktuelle Binär-Pin liegt in `../packages/security-overrides.json`, das
geprüfte Wheel im selben Paketordner. `scripts/setup-analysis-runtime.mjs`
verwendet diese Pins und fällt bei einem fehlenden lokalen Security-Wheel
nicht auf die alte Upstream-Version zurück. Das vollständige originale
`pyodide-lock.json` bleibt als Upstream-Referenz erhalten; zur Laufzeit werden
ausschließlich die Paketversionen und SHAs aus dem Formnaro-Manifest geladen.
Auch setuptools wird dort mit dem offiziellen PyPI-Wheel auf 84.2.1 aktualisiert.

Pillow-Version, PNG/JPEG/WebP/TIFF-Rundlauf mit Text sowie Matplotlib-Ausgabe
werden in der tatsächlichen isolierten Python-Laufzeit geprüft. Bibliotheks-
versionen und erfolgreiche Bilder sind ein Integrationsnachweis, keine Zusage,
dass alle möglichen Fehler oder Sicherheitslücken ausgeschlossen sind.

Quellen: [Pillow 13](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html),
[Pyodide-Rezepte](https://github.com/pyodide/pyodide-recipes),
[Pyodide 314.0.7](https://github.com/pyodide/pyodide/releases/tag/314.0.7).
