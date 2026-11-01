# KI-Anbieter und Agenten in Formnaro

Formnaro bietet zwei Wege im Programm: Der normale KI-Chat berechnet Vorschläge, die du prüfst und übernimmst. Der **Agentenchat** kann einen konkreten Modellierauftrag über die lokale MCP-Schnittstelle selbst ausführen: Zustand lesen, Vorschau berechnen, Rückmeldungen prüfen, übernehmen und Ergebnis kontrollieren. Übernommene Schritte bleiben mit Rückgängig erreichbar.

## Zugang einrichten

Einstellungen → KI / API → KI-Anbieter. Vorhandene Zugänge bleiben erhalten. Ein Anbieterwechsel verwendet ein eigenes Profil und übernimmt keinen fremden Schlüssel.

| Anbieter | Zugang in Formnaro |
| --- | --- |
| OpenAI / GPT | vorhandene ChatGPT-Anmeldung oder eigener OpenAI-API-Schlüssel |
| Mistral | Vibe-Browseranmeldung oder eigener Mistral-API-Schlüssel |
| Claude / Anthropic | eigener API-Schlüssel, natives Messages-Format |
| Gemini / Google | eigener Gemini-API-Schlüssel, kompatible Chat-API |
| DeepSeek | eigener API-Schlüssel |
| Grok / xAI | eigener API-Schlüssel |
| Qwen / Alibaba Cloud | eigener API-Schlüssel und zur Region passender Endpunkt |
| Kimi / Moonshot | eigener API-Schlüssel |
| GLM / Z.ai | eigener API-Schlüssel |
| MiniMax | eigener API-Schlüssel |

Dies sind zehn Anbieterfamilien, keine garantierte Rangliste. Modellverfügbarkeit und Berechtigungen hängen vom Konto ab. Bei Qwen vorzugsweise die aktuelle Workspace-Adresse aus Alibaba Model Studio eintragen; die Vorgabe ist der dokumentierte ältere Singapur-Endpunkt. Über „Dokumentation des Anbieters“ ist die offizielle Anleitung erreichbar. Eine fehlende Modellliste bedeutet nicht zwingend, dass Modellanfragen unmöglich sind; eine freigegebene Modellkennung kann man selbst eintragen.

Für Mistral Vibe einmal lokal `uv tool install mistral-vibe` ausführen, anschließend im Programm **Mistral Vibe · Anmeldung** wählen und anmelden. Formnaro verwendet einen eigenen Vibe-Arbeitsordner, verwaltet keine Klartext-Zugangsdaten im Chat und stellt diesem Vibe-Agenten ausschließlich Formnaro-MCP-Werkzeuge bereit. Die Browseranmeldung selbst wird von Vibe durchgeführt. Ein installiertes CLI und ein funktionierender ACP-Handshake ersetzen keine erfolgreiche Kontoanmeldung.

Ein Chat-Abo ist nicht automatisch API-Guthaben. Insbesondere OpenAI-API und ChatGPT-Abo werden getrennt abgerechnet. Formnaro legt keinen neuen Schlüssel an und aktiviert keinen kostenpflichtigen Tarif. Cloudmodelle erhalten beim Senden Aufträge und den benötigten Modellkontext; eine lokale CLI macht die Modellberechnung nicht offline.

## Agentenchat

Im KI-Chat **Agentenchat** öffnen, Anbieter und Modell wählen und die lokale Schnittstelle aktivieren. Der eingebettete Chat spricht entweder über ACP mit Vibe oder über die gewählte Anbieter-API mit dem Formnaro-MCP-Adapter. MCP liefert dabei Werkzeuge; es importiert keine bestehenden Gespräche aus anderen Programmen.

Ein laufender Auftrag sperrt den Anbieterwechsel. **Stop** bricht die weitere Verarbeitung und eine laufende UI-Führung oder Übung ab. Bereits bestätigte CAD-Änderungen werden dadurch nicht stillschweigend zurückgesetzt. **Neuer Chat** entfernt den Agentenverlauf. API-Agenten haben ein begrenztes Schrittbudget und bewahren Rückmeldungen über Vorschauen und Fehler im aktuellen Auftrag.

## Kostenrechner

Gemeldete Eingabe-, Ausgabe- und Cache-Tokens erscheinen im Verbrauch. Die Schätzung verwendet bekannte, modellgenaue Standardtarife; der Tarifstand ist im Programm angegeben. Mistral-Vibe-Kostenmeldungen werden, wenn verfügbar, je Nachricht aus den Sitzungszählern abgeleitet. Abo-Werte sind API-Vergleichswerte und keine zusätzliche Rechnung.

Unter **Tokenpreise für den Kostenrechner** lassen sich für jede exakte Modellkennung eigene Eingabe-, Ausgabe- und optionale Cache-Preise in USD je einer Million Tokens speichern. Sie gelten nur für dieses Modell und dieses Anbieterprofil. Ohne bekannten Tarif oder verwertbare Tokenmeldung bleibt die Schätzung unbekannt. Freikontingente, Steuern, besondere Kontoverträge und einzelne Werkzeuggebühren können abweichen. Die Rechnung des Anbieters bleibt maßgeblich. Die vorhandene EUR-Umrechnung wird auch für diese Schätzungen verwendet.

Tarifquellen stehen in `backend/ai-token-prices.cjs` sowie den vorhandenen OpenAI-/DeepSeek-Tarifdaten. Für Google werden bekannte Kontext- und Datumsgrenzen, für Claude gemeldete Cache-Schreib- und Lese-Tokens berücksichtigt.

## Begrenzte Bedienhilfe und Übung

Die kleine Datei [FORMNARO-UI-KONTEXT.md](../ai/FORMNARO-UI-KONTEXT.md) beschreibt Layout, Modi, Menüziele und kurze Abläufe. Sie wird im lokalen Kontext unter `agentUI.layoutContext` mitgeliefert. Der aktuelle Zustand aus `offlinecad_ui` bleibt maßgeblich; feste semantische Ziele ersetzen Pixelraten.

`offlinecad_ui` unterstützt `state`, `help`, `guide`, `practice`, `status` und `cancel`. Der vollständige Plan wird vor dem ersten Schritt geprüft. Nur fest freigegebene Menüs und Ansichten dürfen angeklickt werden; andere freigegebene Werkzeuge lassen sich zeigen. Keine beliebigen Selektoren, Koordinaten, Tastendrücke, URLs, Pfade, Dateidialoge, Anbieter-Einstellungen oder Modellübernahmen über die UI-Schnittstelle.

`practice` verwendet das bestehende separate, leere Übungsfenster. Erlaubt sind Quader/Zylinder, sechs Zahlenfelder für Größe/Position, Körper-/Lochrolle, Auswahl zuvor angelegter Aliase und Gruppieren; maximal 50 Schritte. Native Eingaben bleiben im eigenen Fenster und pausieren bei Fokusverlust. Das Nutzerprojekt wird dafür weder kopiert noch verändert. Das MCP-Werkzeug wartet lokal auf den tatsächlichen Abschluss, sodass der Agent nicht wiederholt ein Cloudmodell zum Abfragen aufrufen muss. Direkte HTTP-Clients erhalten zunächst eine Auftragskennung und fragen den Status lokal ab.

Diese Begrenzung betrifft die von Formnaro angebotenen Werkzeuge und den eingebetteten Vibe-Zugang. Sie entzieht einem unabhängig gestarteten externen Agenten keine Betriebssystemrechte, die dieser außerhalb von Formnaro bereits besitzt.

## Prüfstand

Die Integration lässt sich ohne echte Anbieteranfragen mit lokalen Antwortfixtures prüfen; diese Tests belegen Protokolle, Profiltrennung, Tokenrechnung, MCP und native CAD-/UI-Abläufe. Sie belegen weder die Freigabe eines konkreten Cloudkontos noch dessen Rechnung oder die Modellqualität. Live-Anmeldung und echte Modellantworten müssen mit dem jeweiligen vorhandenen Konto geprüft werden.

Die Ansicht bleibt während zusammenhängender Maßänderungen ruhig. Kurze Übungen passen erst am Ende ein; längere Abläufe höchstens dreimal, nur bei deutlicher Größenänderung und mit zeitlichem Abstand.

## Webrecherche selbst erlauben

Einstellungen → KI / API → **Webrecherche erlauben**. Standardmäßig aus, je Anbieterprofil gespeichert. Derzeit unterstützt der eingebettete Mistral-Vibe-Zugang die vorhandene serverseitige `web_search`-Funktion mit Quellen. Normale Chats und Agentenchats verwenden dieselbe Erlaubnis. Beim Ausschalten wird die bisherige Agentensitzung geschlossen und das Suchwerkzeug aus der lokalen Vibe-Konfiguration entfernt.

Bei den anderen Zugängen ist das Kontrollkästchen mit entsprechendem Hinweis deaktiviert: Dort ist noch keine Websuche angebunden. Die Einstellung erteilt keine PC-, Datei-, Browser- oder beliebigen Netzwerkrechte. `web_fetch`, Shell und sonstige Hostwerkzeuge bleiben gesperrt. Mistral erhält Suchanfragen; diese können weiteres Kontingent verbrauchen. Suchergebnisse gelten als externe Daten, nicht als neue Anweisungen. Die Einstellung kontrolliert eingebettete Formnaro-Zugänge, nicht eigenständige externe Agenten mit eigenen Werkzeugen.

Die Windows-Startlogik berücksichtigt auch eine durch MSIX umgeleitete uv-Installation und startet deren physische Python-Umgebung direkt im isolierten Modus. Für leere Arbeitsordner wird keine nicht angebotene Vibe-Vertrauensentscheidung mehr gesendet.

## Weitere Mistral-Modelle im Vibe-Zugang

Vibe 3.0.4 bringt zunächst nur Medium 3.5 mit. Formnaro liest nun mit dem vorhandenen Vibe-Zugang die offizielle Mistral-Modellliste und ergänzt chat- und werkzeugfähige Modelle im eigenen Vibe-Profil, einschließlich Large 4, sofern gemeldet. Alias-Duplikate werden zusammengefasst. Der Zugriffsschlüssel bleibt im Python-/Vibe-Prozess; Node erhält nur Modellkennungen und Fähigkeiten. Ein neuer Schlüssel wird nicht angelegt. Die Liste wird fünf Minuten zwischengespeichert; ohne erreichbare Metadaten bleibt das eingebaute Vibe-Modell verfügbar. Automatisch zeigt den aktuell aufgelösten Modellnamen an.

Eine erfolgreiche Listenabfrage und ACP-Modellauswahl belegen noch keine erfolgreiche Inferenz oder Kontokosten. Bekannte Tokenpreise werden an Vibe übergeben; unbekannte Null-Standardpreise werden nicht als kostenlose Inferenz ausgegeben. Die Modellwahl kann Verbrauch und Kontingent beeinflussen.

## Abo-Nutzung und Restkontingent

Einstellungen → KI / API → KI-Verbrauch & Kontext zeigt bei ChatGPT- und Mistral-Vibe-Zugängen die lokal erfassten Abo-Anfragen und Tokens des gewählten Zeitraums. Diese Zahlen gelten für die hier erfassten Zugänge des aktuellen Anbieters; sie sind keine kontoweite Abrechnung und enthalten keine Nutzung anderer Programme. Fehlende Anbieterzahlen werden als bekannte Teilsumme (≥) gekennzeichnet.

Ein verbleibendes Abo-Kontingent oder Prozentwert wird von diesen eingebundenen Zugängen nicht gemeldet und bleibt ausdrücklich unbekannt. Der geschätzte API-Gegenwert wird weder als Abo-Rest noch als Rechnung ausgegeben. Mögliche Zusatzkosten hängen vom Tarif und den Einstellungen beim Anbieter ab.

**Kontoinformation aktualisieren** liest bei Mistral nur den gemeldeten Tarif über Vibes `account/read`, ohne Modellanfrage und ohne CAD-Werkzeuge. Schlüsselvorschau und Aktionslinks werden verworfen; Tarifinformationen bleiben nur im Speicher. Beim bloßen Öffnen der Anzeige wird kein Kontoabruf gestartet. **Abo-Verbrauch beim Anbieter öffnen** öffnet die feste offizielle Verbrauchs-/Aboseite im Standardbrowser.

Im getrennten Übungsfenster steht während des automatischen Ablaufs ein großer, fett gesetzter gelber Hinweis: nichts anklicken, keine Tasten drücken und die Maus nicht bewegen. Stop bzw. Esc bleiben ausdrücklich als Abbruchweg genannt. Nach Abschluss oder Abbruch verschwindet die gesamte Hinweiskarte. Stop und Esc blenden sie bereits beim Abbruch aus.

Die Abo-Karte zeigt den geschätzten API-Gegenwert unmittelbar neben den lokal erfassten Tokens, auch wenn kein Abo-Rest gemeldet wird. Teilweise fehlende Preise bleiben als bekannte Teilsumme markiert. Für Vibes Medium-3.5-Modellkennung und die offiziellen Medium-Kennungen sind die zuletzt veröffentlichten Tarife mit Quellen-/Preisdatum hinterlegt. Eine Vibe-Standardpreisangabe von null bei positiven Tokens verdrängt keinen bekannten API-Tarif. Ein Abo-Prozentwert darf erst aus einem vom Anbieter gemeldeten oder anderweitig verifizierten Kontingent mit passender Verbrauchseinheit und Bezugszeitraum berechnet werden. API-Preise und Tokenzahlen allein reichen dafür nicht.

## Fehlende Maße selbst wählen

Bei offenen Modellieraufträgen wählen die eingebauten Assistenten fehlende Entwurfsmaße und Details selbst, auch bei Modellstrenge 100. Dazu zählen Haushöhe, Wandstärke, Dachneigung sowie Maße und Positionen von Türen und Fenstern, Scharnierseite und Öffnungswinkel. Wichtige Entscheidungen werden kurz als Annahmen genannt. Ausdrücklich genannte Maße, gewünschte Funktionen und bestehende zu erhaltende Maße bleiben verbindlich. Eine weitere Erlaubnis zum Entwerfen ist dafür nicht nötig.

Die gemeinsame dauerhafte Regel steht in `ai/FORMNARO-MODELLIERFREIRAUM.json` und erreicht normalen Chat, API-Agenten, Mistral Vibe und den öffentlichen MCP-Kontext. Der Genauigkeitsregler ändert die Freiheit bei fehlenden Angaben nicht. Bei gemischten Maßprüfungen lässt `expected:[50,50,null]` die nicht vorgegebene Höhe frei; die tatsächliche Höhe wird trotzdem gemessen. Mindestens eine Achse muss vorgegeben sein; für vollständig frei gewählte Maße wird keine Sollmaßprüfung verlangt. `null` ist nur in `expected` von size/bounds erlaubt, nicht in Konstruktionsmaßen. Einmal festgehaltene Sollprüfungen bleiben während Korrekturen erhalten.

Ein Fenstermaß ist eine frei wählbare Entwurfsentscheidung, wenn es nicht vorgegeben wurde. Zwei geforderte Fenster und eine auf- und zugehende Tür sind dagegen Funktionsanforderungen. Eine bloße Türform beweist keine Bewegung. Vorschau, technische Gültigkeit, Quellen-/Sperrenschutz und die bestehende Freigabe zum Übernehmen gelten weiter. Die Bildprüfung erhält die erklärten Annahmen und soll einen brauchbaren Entwurf nicht allein wegen fehlender Maße oder anderer sinnvoller eigener Maße verwerfen.

Auch neue Agenten erhalten die gemeinsame Regel über das standardisierte MCP-Feld `initialize.instructions` und anschließend über `context.designFreedom`. Der Node-Adapter bekommt den Pfad derselben öffentlichen Regeldatei vom Programm; der Python-MCP-Adapter liest sie aus der Projekt-/AI-Ausgabe. Die Regel wird dabei ohne Modellanfrage oder Zugriff auf den Verbindungsdeskriptor geladen. Fehlt die lokale Regeldatei, verweist die MCP-Begrüßung ausdrücklich auf `context.designFreedom`. Projektagenten finden den Verweis zusätzlich in AGENTS.md.

Die portable Ausgabe enthält den aktuellen Standard-Python-MCP-Adapter auch als `ai/offlinecad_ai.py`, direkt neben der gemeinsamen Regeldatei. Neue MCP-fähige Clients können diesen Adapter verwenden; ein neuer Anbieter benötigt keine eigene Kopie der Regeln.

Auch Aufträge vollständig ohne Maße sind erlaubt, beispielsweise eine möglichst komplexe Maschine mit vielen Funktionen. Der Agent wählt ein schlüssiges Konzept, die Gesamtgröße und einen vollständigen Maßplan selbst und nennt seine Annahmen. Es werden keine erfundenen Sollmaße allein aus diesen Entscheidungen abgeleitet. Eine ausdrücklich leere erste Prüfliste bleibt auch während späterer Bildkorrekturen leer; dadurch können nachträglich selbst erfundene Maßziele den freien Entwurf nicht blockieren. Geometrie und angeforderte Funktionen werden weiterhin anhand der verfügbaren Werkzeuge geprüft.


## Lokale KI-Probe: Geometrie und Gelenke, Verlauf, Live-Aufbau

KI-Batches koennen neue Geometrie und anschliessende Gelenkaktionen atomar in einer Vorschau enthalten. Gelenke referenzieren ausschliesslich fertige Wurzelkoerper, auch per zuvor erzeugtem $Alias. Ein Apply/Undo umfasst den gesamten Auftrag. Ein einzelner Gelenkbefehl behaelt seinen metadata-only-Pfad.

Der ausdruecklich gewaehlte freie Probemodus im KI-Chat deaktiviert automatische Sollmass-/Volumen-/Koerperzahl-/Foto-/Bildpruefungen, unabhaengige FreeCAD-Ergebnispruefung und Qualitaetskorrekturen. Er zeigt keine bestandenen Pruefungen an; die Vorschau bleibt ungeprueft und erfordert ausdrueckliches Uebernehmen. Die hostseitige Preview-Policy gilt auch fuer lokale MCP-Aufrufe. Ausfuehrbare Befehle, Quellen-/Sperrschutz, Revision und Formnaro-only-Grenze bleiben erhalten. Modus ist nach Programmneustart standardmaessig aus.

Aufbau live anzeigen ist getrennt schaltbar (standardmaessig an, lokale Praeferenz). Reale bereits berechnete Befehlszwischenstaende werden transient dargestellt, ohne Zwischen-Apply/Undo. Opaque Einzelwerkzeuge koennen erst nach Rueckgabe ihres Geometrieergebnisses gezeigt werden; unvollstaendige LLM-Textausgabe ist noch kein Modell. Die bestehende Gesamtvorschau bleibt waehrend weiterer Korrekturen sichtbar.

Alle Chat-Anbieter verwenden eine stabile lokale Gespraechskennung und ihre vorhandene Verlaufsschnittstelle. Mistral Vibe verwendet bei Vorschau-Korrekturen und Anschlussnachrichten derselben Kennung/Modellauswahl dieselbe ACP-Sitzung. Nur geaenderte Kontextabschnitte und neue Rueckmeldungen werden erneut uebertragen; neuer Chat, Modellwechsel, Abbruch und Reset verwerfen die alte Sitzung. API-Anbieter ohne persistente Sitzung erhalten weiterhin den erforderlichen Verlauf; eine garantierte einmalige Tokenabrechnung wird nicht behauptet. Providerseitige verlustfreie Referenz-Deduplizierung wiederholter Vertragsstrukturen reduziert Kontexttext; oeffentliche MCP/API-Schemas bleiben vollstaendig.


Ergaenzung: Der laufende KI-Auftrag bietet So uebernehmen. Ein bereits berechneter nativer Teilstand wird vor dem Abbruch gesichert, KI/Worker werden beendet, danach wird genau dieser Stand nativ wiederhergestellt und als ein Undo-Schritt uebernommen. Keine weitere Anbieteranfrage, keine Behauptung vollstaendiger Aufgabenerfuellung.

Uebungsmodus: Neben den bisherigen Einzelklick-Aktionen stehen alle registrierten nativen Formen sowie model-Aktionen mit dem vollstaendigen bestehenden Modelliervertrag zur Verfuegung. Diese nutzen dieselben validierten CAD-/Netz-/Gelenk-/Kopplungs-/FreeCAD-/isolierten Skriptwerkzeuge im separaten leeren Kindprojekt. Keine Beschraenkung auf Box und Zylinder. Der Provider bekommt den Modelliervertrag, aber keine Geometrie, persoenlichen Kontextnotizen oder Chat-Historie des Elternprojekts. Eine normale Modellantwort darf weiterhin nicht das Elternprojekt ueber den Uebungsweg aendern. Kinematische Zahnradkopplungen simulieren keinen physischen Zahnkontakt; Berichte unterscheiden tatsächliche native Gearkoerper/Gelenke/Kopplungen und ausgefuehrte Bewegungen.


Nachpruefung So uebernehmen: gespeicherte Aliase unterstuetzen neben vorhandenen Quellen-IDs auch exakte {rootId,path}-Quelladressen und begrenzte Ergebnislisten. Jeder Pfad muss in genau diesem Wurzelkoerper existieren; fremde Wurzeln, verlorene Kinder und Zusatzselektoren bleiben ungueltig. Dadurch lassen sich gruppierte Zwischenstaende samt Gelenken unveraendert uebernehmen. Button-Verfuegbarkeit fragt nur ein Boolean ab, statt bei jedem UI-Update Geometriedaten zu kopieren.


Mistral-Denkaufwand ist im normalen Chat, Agenten-Chat und in den Einstellungen wählbar. Large 4 bietet low/medium/high, Medium 3.5 und Small 4 none/high; Automatisch behält den Modellstandard. Grundlage: https://docs.mistral.ai/studio/conversations/reasoning (31.10.2026). Vibe setzt die Auswahl vor der Anfrage über session/set_config_option mit configId thinking und prüft die Bestätigung. Der native API-Zugang sendet reasoning_effort. Unbekannte Modellstufen werden nicht erfunden, ein Modellwechsel setzt die Auswahl auf Automatisch zurück. Die Wahl ist pro Zugang gespeichert und unabhängig von OpenAI/DeepSeek.

Im Übungsfenster steuert Tempo die Vorführung: Normal, Langsam (halbes Tempo, Standard), Sehr langsam (Vierteltempo). Der sichtbare Zeiger bewegt sich entsprechend langsamer; Klickziele erhalten vor der echten Eingabe eine Markierung. Echte berechnete Befehlszwischenstände bleiben im Live-Aufbau sichtbar, bevor der nächste Befehl fortgesetzt wird. Pause/Weiter und Stop/Esc funktionieren weiterhin; reine CAD-/Python-Berechnungen erzeugen keine erfundenen Mausaktionen. Opaque Einzelwerkzeuge zeigen ihr Ergebnis erst nach der Berechnung.


## Sichtbare Übung über Menüs und Dialoge

Die allgemeine ui-Übungsaktion verwendet native Eingaben an semantisch benannten Bedienelementen des aktuellen Formnaro-Fensters (sichtbare Bezeichnung, feste ID oder registrierte Werkzeugkennung). Sie öffnet Menüs, klickt Werkzeuge, wählt echte Dropdown-Optionen und gibt Werte in echte Felder ein. Keine pro-Werkzeug-Freigabeliste; keine beliebigen Selektoren, Koordinaten, Tasten oder fremden Fenster. Gelenk-/Zahnradkopplungs-/Bewegungsbefehle aus Modellplänen werden automatisch im regulären Gelenkdialog vorgeführt und anhand der tatsächlich entstandenen Verbindungen geprüft. Geometrie kann weiterhin über den vollständigen vorhandenen Modellierkatalog aufgebaut werden. Das vorhandene Tempo und Pause/Stop gelten für beide Wege.


Bei externen Modellierclients darf eine lange Vorschau nicht mit einem Programmabsturz gleichgesetzt werden. Der mitgelieferte Python-Client berücksichtigt das längere Hostbudget für Vorschau und Export. Trennt ein Client die Verbindung, wird nur seine zugehörige Vorschau abgebrochen; ein bereits gestartetes Übernehmen wird weder zurückgesetzt noch automatisch wiederholt. Vor einem erneuten Auftrag im vorhandenen Programm prüfen, ob es wieder bereit ist. Externe Assistenten sollen keine Formnaro-Prozesse beenden und keine fremde oder ältere Installation starten.

Falls der Darstellungsprozess unerwartet beendet wird, bietet ein nativer Dialog die Wiederherstellung der Oberfläche oder das Schließen des Programms an. Gespeicherte Projekte und Autosicherungen bleiben erhalten; ungesicherte Vorschauen sind dadurch nicht automatisch gerettet. Ein Modellierauftrag wird dabei nicht von selbst erneut an einen Anbieter gesendet oder übernommen.

Python-Batches mit mehreren Quellen werden im ersten lokalen Python-Worker vor dessen Programmausführung gemeinsam mit `ast.parse` auf Syntax geprüft. Ein Fehler in einem späteren Python-Befehl wird als `AI_PYTHON_SYNTAX` mit Befehlsnummer gemeldet, bevor die vorhergehenden Python-Quellen Geometrie berechnen. Laufzeit- und Geometriefehler bleiben weiterhin möglich.

Native/Python-Vorschauen muessen auch bei verdecktem oder minimiertem Hauptfenster weiterrechnen. Das normale BrowserWindow verwendet deshalb wie bisher die Verifikationsfenster `backgroundThrottling:false`; der CAD-Viewport bleibt ueber seinen vorhandenen Render-Scheduler im Leerlauf. Eine Pruefung nur mit ungedrosselten Testfenstern deckte die vorherige Abweichung zur normalen Anwendung nicht ab. `tests/cad-packaged-preview.cjs` prueft den normalen Programmeinstieg der gepackten EXE in isolierten Datenpfaden mit ausgeblendetem Fenster und echtem lokalen Preview-Auftrag.

Ergaenzung zur Hintergrundberechnung: `backgroundThrottling:false` am Hauptfenster allein reicht fuer die getrennten Renderer der opaken Python-Frames nicht aus (r25: voller normaler EXE-Lauf weiter am600sLimit). Vor `app.ready` wird zusaetzlich der offiziell dokumentierte Schalter `disable-renderer-backgrounding` gesetzt; er verhindert die Prioritaetsabsenkung unsichtbarer Renderer-Prozesse. Sandbox, CSP und lokale Werkzeuggrenzen bleiben aktiv. Referenz: https://www.electronjs.org/docs/latest/api/command-line-switches#--disable-renderer-backgrounding . Die gezielte EXE-Pruefung erfolgt ohne Verifikationsmodus mit verdecktem Fenster und isolierten Datenpfaden; der vorhandene CAD-Render-Scheduler vermeidet fortlaufendes Zeichnen ohne Aenderung.

Externe Vorschaufehler: Ein fehlgeschlagener Vorschauauftrag entfernt ausschliesslich seine eigene transiente Live-Vorschau. Die Vorschau traegt dafuer die Host-Anfragenummer; eine abgewiesene Folgeanfrage darf einen anderen gueltigen Vorschlag nicht verwerfen. Bestaetigtes Modell und Undo bleiben unveraendert. Eine leere Schnittmenge wird weiterhin als Geometriefehler gemeldet; danach ist die Schnittstelle ohne manuellen Esc-Schritt wieder nutzbar.


## Gespeicherte Zugänge und Denkaufwand (01.11.2026)

Die Anbieterlisten in Einstellungen, normalem Chat und Agenten-Chat kennzeichnen verschlüsselt gespeicherte API-Schlüssel, Schlüssel nur für die aktuelle Sitzung, angemeldete Konten und nicht verfügbare Zugänge. Die aufklappbare Zugangsübersicht zeigt alle eingerichteten Anbieter. Je API-Anbieter bleibt ein eigener Schlüssel gespeichert; ein Anbieterwechsel erhält die anderen Zugänge. Ein nicht entschlüsselbarer gespeicherter Schlüssel wird ausdrücklich als nicht lesbar angezeigt. Die Markierung „verwendet“ wird ab dieser Version nach einer erfolgreichen Anfrage gespeichert; frühere Nutzung wird nicht rückwirkend behauptet. Speicherung belegt weder Schlüsselgültigkeit noch verbleibendes Kontingent.

Denkaufwand ist in allen drei Ansichten sichtbar. OpenAI, Mistral und DeepSeek behalten ihre getrennten Einstellungen. Gemini, Claude und Grok bieten die für bekannte Modelle dokumentierten Stufen; ausgewählte Qwen-, Kimi- und GLM-Modelle bieten An/Aus. Bei unbekannten oder nicht einstellbaren Modellen bleibt Automatisch mit Erklärung. Modellwechsel setzen die zusätzliche Anbieterwahl auf Automatisch zurück. Claude verwendet output_config.effort und bei adaptiven Modellen thinking.type=adaptive; Gemini/Grok reasoning_effort, Qwen enable_thinking, Kimi/GLM thinking.type. Keine erfundenen Stufen für stets denkende Modelle.

Abo-Anmeldung bleibt für die vorhandenen ChatGPT- und Mistral-Zugänge verfügbar. Google unterstützt die Einbettung privater Antigravity-Abos in Drittanbieter-Apps nicht; die ältere Gemini-CLI-Anleitung enthält einen Umstellungshinweis. Anthropic erlaubt Drittanbieter-Apps keine eigene Claude.ai-Anmeldung. Hier bleiben diese Anbieter API-Zugänge. Andere integrierte Anbieter werden weiterhin als API-Zugänge dargestellt; daraus folgt keine Aussage über alle gesonderten Coding-Tarife oder externen Agenten.

Geprüfte offizielle Quellen:
- [Google: Antigravity und Drittanbieter](https://antigravity.google/docs/faq)
- [Gemini: OpenAI-Kompatibilität und Thinking](https://ai.google.dev/gemini-api/docs/openai#thinking)
- [Claude: Anmeldung und Zugangsnutzung](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
- [Claude: Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Mistral: Browseranmeldung oder API](https://docs.mistral.ai/vibe/code/cli/install-setup)
- [OpenAI: Anmeldung und getrennte API-Abrechnung](https://learn.chatgpt.com/docs/auth)
- [Grok: Reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning)
- [Qwen: Thinking](https://www.alibabacloud.com/help/en/model-studio/deep-thinking)
- [Kimi K2.6: Thinking](https://platform.moonshot.ai/docs/guide/kimi-k2-6-quickstart)
- [GLM: Thinking](https://docs.z.ai/guides/capabilities/thinking-mode)


Groq ist als zusätzlicher, von Grok/xAI getrennter API-Anbieter verfügbar: https://api.groq.com/openai/v1, eigener verschlüsselt gespeicherter Schlüssel, authentifizierte Modellliste und bestehender Chat-/Agentenweg. GPT-OSS 20B/120B bietet low/medium/high; Qwen 3.8 27B none/low/medium/high, Muse Spark Open low/medium/high/xhigh. Automatisch lässt den Groq-Modellstandard unverändert. Sprach- und Sicherheitsmodelle werden aus der Chatliste ausgefiltert; ein Freikontingent oder Abozugang wird nicht behauptet. Quellen: https://console.groq.com/docs/openai und https://console.groq.com/docs/reasoning (01.11.2026).
