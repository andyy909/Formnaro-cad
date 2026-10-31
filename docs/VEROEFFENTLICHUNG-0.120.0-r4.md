# Formnaro 0.120.0-r4 – gezielt geprüfte Entwicklungsausgabe

Stand 31.10.2026. Die Windows-Ausgabe ergänzt Zahnradkopplungen auf einem gemeinsamen bewegten Träger und die zuvor lokal korrigierte Objektliste/Bohrungsanzeige. Beide Repositories und der Download beziehen sich auf diese Ausgabe.

## Änderungen und Nachweise

- Zwei parallele Drehgelenke auf demselben starren Elternkörper dürfen gekoppelt werden, auch wenn dieser selbst verschoben oder gedreht wird. Phase und Übersetzung bleiben relativ zum Träger erhalten.
- Unterschiedliche Träger und Planetengetriebe bleiben ausgeschlossen. Grenzen, Sperren, Quellen, Vorschau und Undo bleiben wirksam.
- Die Objektliste bleibt beim Wechsel zwischen Normal, Solid und Fusion vom unteren Bedienbereich getrennt. Mitwachsende Bohrungen erklären ihre besondere Bearbeitung.
- 18 gezielte Quelltests; 12 Mechanik- und 10 Sidebar-Prüfgruppen im isolierten Quelllauf bestanden.
- Die tatsächliche Windows-EXE bestand 12 Mechanik- und 21 Gelenk-Prüfgruppen, ohne gemeldete Rendererfehler oder externe Anfragen.
- ATLAS-5: 144 Wurzelbauteile, 78 Gelenke, fünf Achsen und gekoppelte A-Wiege/Ritzel (48:20). 15 geprüfte kinematische Stellungen; 13 native Zahnrad-Schnittproben über eine Zahnteilung mit jeweils 0 mm³ Überschneidung.

## Umfang und Grenzen

Diese Ausgabe enthält den aktuellen Entwicklungsstand. Die historischen vollständigen Prüfungen früherer Ausgaben sind keine vollständige neue Prüfung dieses Builds. Eine neue allgemeine Gesamt-, Langzeit- und Recovery-Abnahme steht aus. Das Beispiel demonstriert Kinematik, keine durchgehend kollisionsgeprüfte Maschine und keine Fertigungs- oder Kraftsimulation.

Die Aufnahmen stammen aus dem unveränderten, gepackten Renderer 0.120.0-r4 mit einem getrennten Profil. Die Animation steuert echte Gelenkregler; Ritzelbewegung entsteht aus der gespeicherten Kopplung. Die Modellgeometrie und der Undo-Verlauf bleiben dabei erhalten. Die Aufnahme erzeugt keine KI-Anfragen.

EXE SHA-256: `04ec86d1bd5eae557b14ec844239234ac1aeb37e62dd696498efafd2935ec079`

app.asar SHA-256: `05fb42dba0ad8a3a7a3218d39539e27bcce1a7e6c867cfe214246b36afdb9a04`

Der Windows-Download enthält die benötigten Laufzeiten, Lizenzen und ein ATLAS-Beispiel. Persönliche Datenordner und Zugangsdaten sind ausgeschlossen. Eigene Projekte und Einstellungen vor einem Update sichern und bewusst in einen neuen Programmordner übernehmen.
