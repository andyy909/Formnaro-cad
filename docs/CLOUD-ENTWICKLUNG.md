# Formnaro in der Cloud entwickeln

Der aktuelle Entwicklungsstand liegt im privaten GitHub-Repository
`andyy909/Formnaro` auf dem Zweig `cloud-development`. Dies ist ein
Entwicklungsstand 0.108.0 vom 26.10.2026 einschließlich technischer Drei-Ansichten-Rekonstruktion, Projektfotos, Perspektiventzerrung und Foto-Assistent,
Programm-Assistent, lokaler KI-Analyse und vollständiger FreeCAD-Python-Anbindung.
`main` und `cloud-development` werden gemeinsam auf diesen freigegebenen Quellstand
aktualisiert. Die geprüfte Windows-Ausgabe steht unter
[Formnaro 0.108.0](https://github.com/andyy909/Formnaro/releases/tag/v0.108.0).
Die Desktop-Freigabe umfasst 285 Kernprüfungen und 738 Gruppen an der echten EXE;
sie ist keine eigenständige Codespaces-/Browser-Abnahme.

## Im Browser starten

1. Bei GitHub mit dem Konto anmelden, das Zugriff auf das Repository hat.
2. Den Zweig `cloud-development` öffnen und **Code → Codespaces → Create
   codespace on cloud-development** wählen.
3. Den ersten Aufbau abwarten. Node.js 22, npm-Abhängigkeiten, CAD-Runtimeprüfung
   und Frontend-Build werden durch `.devcontainer/devcontainer.json` eingerichtet.
4. Im Terminal `npm run dev:cloud` ausführen und im Bereich **Ports** den privaten
   Port 5173 öffnen. Dies zeigt die Browser-Vorschau der Anwendung.

Der Cloud-Rechner arbeitet unabhängig vom Windows-PC. Die Electron-Oberfläche,
Windows-Dateidialoge und die lokale KI-Verbindung zu einer Windows-Installation
werden mit dieser Browser-Vorschau nicht bereitgestellt. Windows-Paketierung
und native Desktop-Abnahme erfolgen weiterhin auf einem geeigneten Rechner.

## Änderungen sichern und auf einem anderen Rechner übernehmen

Im Codespace zuerst `git status` prüfen, dann die gewünschten Quellcode-Dateien
mit `git add <Dateien>`, `git commit` und `git push` sichern. Änderungen sind erst
nach dem Push im Repository gespeichert. Der lokale Windows-Ordner und der
Codespace werden nicht automatisch miteinander synchronisiert. Vor einem
lokalen Wechsel auf den Cloud-Zweig vorhandene Änderungen sichern; kein
`git reset --hard` verwenden.

Der gemeinsame technische Einstieg ist `docs/PROJEKTKONTEXT.md`. Persönliche
Modelle, Profile, Schlüssel und `work/kontext.txt` gehören nicht ins Repository.
Die mitgelieferte CAD-JS/WASM-Runtime ist Bestandteil des Quellstandes; ein
Neubuild des CAD-Kerns ist für normale Frontend-Entwicklung nicht erforderlich.

Prüfungen: `npm test`, `npm run test:cad-foundation`, `npm run test:cad-stl`.
Desktop-Tests benötigen Electron und eine geeignete grafische Umgebung.
Bei Bedarf ist Python 3.10+ für die optionalen Python-Werkzeuge einzurichten.

Codespaces kann abhängig vom Konto und Verbrauch kostenpflichtig werden.
Ungenutzte Codespaces stoppen und die GitHub-Nutzungslimits prüfen.

Dokumentation:
https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository
