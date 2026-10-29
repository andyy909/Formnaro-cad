# Formnaro 0.120.0 – veröffentlichter Quellstand

Stand 29.10.2026. Die Veröffentlichung umfasst die aktuellen Entwicklungsquellen in beiden GitHub-Repositories. Sie ist keine neue Windows-EXE-Freigabe. Die bisher veröffentlichte Ausgabe 0.117.0-r8 bleibt gesondert gekennzeichnet.

## Inhalt

Mitwachsende Bohrungen auf nativen Quadern, ursprünglich kreisrunden Zylinderquellen und begrenzten STEP-Prismen; explizite Überführung einfacher alter Bohrgruppen; gemeinsame Neuzuordnung erhaltener Bohrungsflächen mit aktuellen Projektparametern und Varianten. Verknüpfte Körper-/Bohrungsmuster und direkte Skizzenbedienung gehören ebenfalls zum Entwicklungsstand. Außerdem enthalten sind die bereits lokal entwickelten Änderungen an großen Netzprojekten, Spracheingabe, KI-Kontextbudget und getrenntem Übungsmodus. Der genaue Funktionsumfang und seine Grenzen stehen im [Umsetzungsstand](ALLTAGSAUSBAU-UMSETZUNGSSTAND.md) und im [technischen Projektkontext](PROJEKTKONTEXT.md).

## Nachweise

- Frisch ausgeführt: **2.365 Tests in 395 Suiten**, 0 Fehler, 0 Auslassungen und 0 Abbrüche; Quellen während des Laufs unverändert.
- **83 Windows-Prüfgruppen** für Werkzeuge und Projektparameter sowie **13 Dialogschritte**, zusätzliche Electron-Regression und Vite-Build bestanden.
- Physische OCAD/FNPACK-Rundläufe und unabhängiges FreeCAD-Part-Rücklesen der App-STEP-Dateien für 8 und 12 mm bestanden: je ein gültiger geschlossener Solid, strenge BOP-Prüfung fehlerfrei, beidseitige Referenzdifferenz 0. Die beiden Volumenabweichungen liegen unter 2e-11 mm³.
- Weitere Kreis-/Ellipsen-, Spiegelungs-/Scherungs- und Folgebohrungsfälle unabhängig bestätigt. Drei dauerhafte Regressionen rufen den separaten nativen STEP-Leser auf. Drei aktuelle Bilder wurden angesehen; beide abschließenden Codeprüfungen haben keine offenen Befunde.

Die automatisierten Oberflächenprüfungen verwenden native Electron-Mauseingaben und DOM-Bedienung in isolierten Profilen; sie sind keine Behauptung manueller physischer Mausbedienung oder gepackter EXE-Abnahme. Ein wegen des STEP-Befunds nach 112 bestandenen Dateien gestoppter Erstlauf wurde nicht wiederverwendet. Historische Fehlbelege bleiben lokal erhalten. Die Quell-/Prüfbindung steht maschinenlesbar in [PRUEFSTAND-0.120.0.json](PRUEFSTAND-0.120.0.json). Die ursprünglichen ausführlichen Laufprotokolle und lokalen Entwicklungskontexte gehören nicht ins Repository.

## Offene Abnahme

Gemeinsame Aktualisierung ausstehender Parameterwerte und externer abhängiger Merkmale, komplexere alte Bohrgruppen, vollständige GUI-Beispiele Platte/Flansch/Halter sowie die allgemeine gepackte Windows-/Soak-/Recovery-Abnahme stehen weiter aus. Pakete 1–3 sind deshalb nicht pauschal als vollständig abgeschlossen markiert. [Bauanleitung](BUILD.md).

Zur Veröffentlichung wurden nur README, Prüfdokumentation, technischer Kontext und Git-Ausschlüsse ergänzt. Laufzeit-, Modell- und Testquellen entsprechen dem geprüften Stand. Lokale Diagnosehelfer, Modelle, Profile und Zugangsdaten werden nicht veröffentlicht.
