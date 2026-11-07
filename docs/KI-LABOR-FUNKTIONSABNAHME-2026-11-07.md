# KI-Labor – Funktionsabnahme und Fehlerkorrektur0.135.1-r1

07.11.2026. Private neue Version, keine Installation ersetzt, keine Veröffentlichung. Auftrag: neue Laborfunktionen prüfen, gefundene Softwareprobleme beheben und eine neue Version bereitstellen.

## Ergebnis

Die neue private Ausgabe0.135.1-r1 korrigiert die im erweiterten Test gefundenen Bewertungs- und Zeichnungsprobleme.128Standardtests und118gezielte Prüfungen bestanden. Der ausgelieferte ASAR-Renderer wurde zusätzlich vollständig verborgen über seine echte IPC-Oberfläche geprüft; native A4-Zeichnung, Titelblock und drei berechnete Ansichten bestanden. Kein Fenster erhielt den Fokus, keine echte Anbieteranfrage in dieser lokalen Abnahme; regulärer Host-Exitcode0.

Die echte KI-Serie wurde auf Nutzerfreigabe begonnen und später auf ausdrücklichen Wunsch erneut pausiert. Sie ist NICHT vollständig abgenommen. Der dritte Agent hat die reale Gesamtserie noch nicht ausgewertet.

## Tatsächlicher Live-Zwischenstand

Der eingefrorene Stand0.135.0-r2 wurde unverändert getestet:

| Bedingung | Befund |
|---|---|
| Messung22/low | Native40-mm-Messung, Projekt unverändert, Endabnahme erfüllt, Exit0, keine Formatkorrektur |
| Fase16/high | Vorgesehene native Kante korrekt, Endabnahme erfüllt, Exit0, keine Formatkorrektur |
| Aushöhlen17/high | Native Wand/Boden und Lage korrekt, Endabnahme erfüllt, Exit0, keine Formatkorrektur |
| Zeichnung21/high | Bedienziel „Ansichten aktualisieren“ nicht vorhanden; kein natives Endergebnis, kein Geometrie-FAIL behauptet |
| Messung22/high | Bei Fokusverlust angehalten, danach ausdrücklich vom Nutzer abgebrochen; neutral unterbrochen, kein Modell-Leistungsfehler |

Von53angeforderten neuen Bedingungen sind vier regulär beendet, davon drei erfolgreich. Ein weiterer Rohversuch wurde unterbrochen.49Bedingungen bleiben offen; der echte16er-Benchmark und die reale Gesamtanalyse wurden nicht gestartet. Die59angenommenen Kampagnenbedingungen bestehen aus56alten Erfolgen plus den drei neuen Erfolgen. Diese werden für die Reparaturkampagne nicht wiederholt.

Ein vorbereiteter Folgeplan enthält34Reparatur-/Restbedingungen inklusive einer gezielten Wiederholung des nun korrigierten Zeichnungsfalls sowie16Benchmarkbedingungen. Das sind50spätere Ausführungen:49offene Bedingungen plus ein gezielter Nachtest des neuen Zeichnungsfehlers. Dieser Plan ist ausdrücklich paused-by-user und erfordert eine neue Fortsetzung. Keine automatische Ausführung beim Öffnen.

## Behobene Softwarefehler

1. **Modellfehler und Infrastruktur trennen:** Nach ungültiger KI-Antwort, Bedienfehler oder Zeitlimit bedeutet „kein abgeschlossenes Übungsmodell“ nicht automatisch einen ausgefallenen nativen Prüfer. Explizite übersprungene Prüfung und tatsächlicher Prüferfehler werden getrennt gespeichert; ältere Protokolle bleiben lesbar. Die Rohdaten werden nicht verändert.
2. **Keine vollständige Abnahme nach unbehandeltem Fehler:** Native richtige Geometrie plus Exit0 genügt nicht, wenn der Versuch anschließend fehlschlägt. Vollständige Abnahme verlangt zusätzlich status=completed und keinen unbehandelten Ausführungsfehler. Die Anzeige bei ausgeschaltetem Überwacher verwendet dieselbe Endbewertung.
3. **Zeichnungsbedienung:** Die exakte bekannte Formulierung „Ansichten aktualisieren“ verweist auf den tatsächlich sichtbaren Knopf drawing-update/„Blatt aktualisieren“. Versteckte oder deaktivierte Ziele bleiben geschützt. Die Werkzeugauskunft nennt drawing-update und drawing-apply ausdrücklich. Keine allgemeine unscharfe Zielsuche und keine Koordinatenersetzung.
4. **Abschluss nach späterer Fortsetzung:** Ein unterbrochener Rohversuch bleibt erhalten. Erst ein explizit zugeordneter, tatsächlich abgeschlossener Ersatz derselben Bedingung kann seine Wartemarkierung auflösen. IDs, Aufgabe, Variante, Denkstufe, Wiederholung, Arbeitsweise und weitere Bedingungen werden geprüft. Die Unterbrechung wird dadurch kein nativer Erfolg; eine weiterhin pausierte Kampagne blockiert den Auswerter unverändert.

Benchmark-Suite1.0.1 hält die präzisierte Werkzeugauskunft fest. Native Fixtures und Prüfer sind unverändert;1.0.0und1.0.1nicht als identische Promptbedingung vermischen. Der optionale Halter-Grenztest bleibt bis eigener Aufgabendefinition/Kalibrierung gesperrt.

## Belege

- 128Standardtests: work/acceptance-01351-standard.log.
- 118gezielte Tests: work/acceptance-01351-focused.log. Die neuen Gegenproben waren vor den jeweiligen Korrekturen rot, danach grün.
- Verborgene echte ASAR-/IPC-Prüfung: work/hidden-lab-acceptance-1794078092957/result.json und work/hidden-acceptance-01351-dom.log. Neun Rollenfelder, unterschiedliche synthetische Zugänge, Denkstufe, Wiederöffnen, genau16synthetische Benchmarkbedingungen, kein Schrittüberwacher im Grundmodus, Auswerter danach, keine falsche Erfolgsgutschrift, acht Aufgabenzeilen, JSON-/ZIP-Export, native A4-/Titel-/Dreiansichtenprüfung,0Fokusereignisse und Host-Exit0. Die synthetischen Benchmarkbedingungen sind keine echten KI-Leistungswerte.
- Die unveränderte Darstellung wurde bereits in0.135.0-r2 visuell geprüft. Vollständig verborgene Fenster hatten auf dieser GPU keine aufnehmbare Bildschirmoberfläche; zwei Screenshot-Vorproben wurden als Prüfhelferfehler erhalten. Die erfolgreiche finale Prüfung verwendet DOM- und native Ergebniswerte und fordert keine Anzeigeoberfläche an. Keine Fokusübernahme zur Screenshot-Erzeugung.
- Quellabgleich.json:283Backend-/KI-/Eingangsdateien exakt im ASAR,785Renderer-/Werkzeug-/Asset-Eingaben exakt gegen die eingefrorene Buildquelle. Im Renderer seit0.135.0-r2 nur Versionshinweis und die beschränkte Zeichnungsziel-Zuordnung verändert. Fixtures und native Prüfer identisch. Frühere native Referenzen werden deshalb weiterverwendet.
- Live-Stand: F:/Formnaro-Testausgaben/KI-Gesamtpruefung-0.135.0-r2-2026-11-07/Pausenstand.json. Originale und gesicherte Protokolle erhalten; keine weitere Modellanfrage nach Nutzerpause.

Das bereinigte externe Pausenpaket enthält72historische/neue Rohprotokolle einschließlich des unterbrochenen Versuchs und die vorhandenen Modelle/Bilder:270Archivdateien,22.533.586Bytes.269Manifestdateien nach dem ZIP-Rundlauf per SHA256 geprüft. ZIP SHA256:99cc5f9c32f5f0dab23c184e1de7a42ed5acc6d0d44923db398927f533b547d7. Keine Profile, Zugangsdaten oder Verbindungsdateien. Unterschiedliche Quellstände und Rohversuche sind als solche gekennzeichnet;49offene Bedingungen werden nicht ausgeblendet.

## Neue private Ausgabe

F:/Formnaro/Programm-v0.135.1-r1/Formnaro-win32-x64/Formnaro.exe

ASAR SHA256:051f697879bb935187e9014e96d0faba4ddc3ec2d365083fc7609b4f7d074504.
EXE SHA256:fe4c7e6dd192f8973a0e7c507f23ce0bffc80c939c03ee15097a1b5bbb813749.

Die neue Version ist lokal geprüft. Die vollständige empirische KI-/Benchmark-Abnahme und die reale Abschlussanalyse bleiben auf Nutzerwunsch pausiert. Eine generelle KI-Erfolgsquote oder Fehlerfreiheit für beliebige CAD-Aufgaben folgt aus diesen Prüfungen nicht.
