# FreeCAD-Merkmale – Paket 4

Paket 4 ist als Windows-Ausgabe 0.110.0-r1 technisch geprüft.
Die Windows-Ausgabe liegt in `output/FreeCAD-Parameter-Testkandidat-v0.110.0-r1`.
467 Tests und 856 Prüfgruppen der gepackten EXE sind bestanden, darunter
71 Dokument- und 11 physische Speicher-/Exportprüfungen; 20 Aufnahmen wurden
visuell geprüft. Der Projekteigentümer hat die Veröffentlichung dieser Ausgabe
ohne Codesignatur ausdrücklich autorisiert. Der ältere 0.109-Testkandidat enthält
diese Funktionen noch nicht.

## Gespeicherte Konstruktion lesen

Ein mit FreeCAD erstelltes Teil oder eine erhaltene Quelle auswählen und
**FreeCAD-Merkmale** öffnen. Der Eintrag ist in allen vier Bedienmodi vorhanden.
Die lokal installierte FreeCAD-Version liest das im Projekt archivierte
FCStd-Dokument in der bestehenden isolierten CAD-Umgebung.

Der Baum beginnt beim eindeutig gespeicherten Ergebniskörper. Er zeigt die
tatsächlichen FreeCAD-Objektkennungen, Typen, verwendeten Quellen und abhängigen
Merkmale. Gemeinsam verwendete Quellen erscheinen als Verweise. Unter
**Eigenschaften** stehen native Werte, Einheiten, Verknüpfungsziele und Formeln.
Das Lesen verändert weder Projekt noch Undo-Verlauf. Eine laufende Leseabfrage
lässt sich abbrechen; nach einer Projektänderung muss der Baum neu gelesen werden.

`Part::Feature` und entsprechende statische Shape-Objekte ohne ausführbaren
Konstruktionsmechanismus sind ausdrücklich gekennzeichnet. Ein archivierter
Körper erhält durch die Anzeige keine erfundene parametrische Historie.
Fehlt eine eindeutige Ergebniszuordnung, wird dies angezeigt.

## Native Eigenschaften ändern

Die Oberfläche kann ausgewählte numerische, boolesche und
Auswahleigenschaften an einer Kopie des vorhandenen FCStd-Dokuments ändern und
die tatsächlichen Abhängigkeiten neu berechnen. Der Auftrag bindet sich an die
SHA-256-Prüfsumme der archivierten Quelle sowie Objektkennung, Eigenschaftstyp
und ursprünglichen Wert. Durch Formeln gesteuerte, schreibgeschützte und statische
Eigenschaften werden nicht überschrieben.

Ein erfolgreicher Entwurf erhält die Objektverknüpfungen und Formeln. Unabhängige
Objekte werden anhand ihrer nativen Eigenschaftsdaten und BRep-Geometrie verglichen.
Der fertige Körper und sein erneut eingelesener STEP-Export müssen gültig und
geschlossen sein; die Volumina werden zusätzlich verglichen. Die neue FCStd-Datei
bleibt bis zur ausdrücklichen Übernahme eine getrennte Vorschau.

**Änderungen als Vorschau berechnen** zeigt die beauftragten Werte und durch
Formeln entstandene Folgeänderungen. **3D-Vorschau ansehen** verkleinert den
Dialog, damit der Körper sichtbar wird. Erst **Änderung übernehmen** ersetzt die
Geometrie am vorhandenen Teil. Ein Undo stellt den vollständigen vorherigen Stand
wieder her. Verwerfen und Abbrechen übernehmen keine Änderung.

Kennung, volle Lage einschließlich affiner Transformation, Teilfarbe und
unabhängige Teile bleiben erhalten. Betroffene Formnaro-Abhängigkeiten werden
erneut berechnet und vor der Übernahme angezeigt. Ein nicht mehr eindeutig
zuordenbarer Konturbezug bleibt mit Diagnose erhalten. Flächenfarben werden nur
bei eindeutiger nativer Flächenidentität zugeordnet; übrige Farbwerte bleiben zur
ausdrücklichen Neuzuordnung gespeichert. Warnungen und Folgeänderungen müssen
bei der Übernahme ausdrücklich angenommen werden.

Die neue Quelle verwendet `freecadSource.version: 2` und bei Verwendung
Projektformat 22. Sie speichert Dokumentprüfsumme, Ergebniskennung, Modus und
Änderungswerte. Der ursprüngliche Skript-/Planquelltext bleibt erhalten; eine
native Dokumentänderung führt ihn nicht erneut aus. Alte Quellen bleiben lesbar.

Geprüft sind native Eigenschaftsänderungen, Formeln, geschützte und statische
Eigenschaften, STEP-Rücklesen, Erhalt unbeteiligter Daten, Speichern/Wiederöffnen
einschließlich `.fnpack`, Vorschau/Übernahme und Undo/Redo. Die Desktopprüfung
bedient die tatsächliche Oberfläche in einem isolierten synthetischen Projekt.

## Gespeichertes Programm mit Parametern neu ausführen

Nach dem Lesen kann **FreeCAD-Änderungsweg** zwischen nativen Merkmalen und
**Gespeichertes Skript neu ausführen** beziehungsweise **Gespeichertes
CAD-Programm neu ausführen** wechseln. Der zweite Weg verwendet das ursprüngliche
Programm mit seinen gespeicherten Parametern. Er verändert weder Quellcode noch
Helfermodule oder Konstruktionsschritte. Im Code fest eingetragene Zahlen werden
nicht als erfundene Parameter angeboten.

Die Oberfläche zeigt Zahlen, Wahrheitswerte und Texte; strukturierte
Skriptparameter lassen sich als JSON bearbeiten. CAD-Planparameter unterliegen
weiterhin den nativen Maßgrenzen. Neue unbekannte Parameternamen werden
abgewiesen. Ohne gespeicherte Parameter ist nur ein Neulauf des unveränderten
Programms möglich.

Benötigte Geometriequellen mit **Quellteil hinzufügen** für jeden Lauf ausdrücklich
wählen und den Namen aus dem Programm angeben. Die Liste darf bei eigenständigen
Konstruktionen leer bleiben. Ältere Quellen speichern keine verlässliche
Eingabezuordnung. Es wird deshalb kein historischer Bezug geraten. Die Quellen
werden nur gelesen; Ergebnis und seine Folgegeometrie sind als eigene Eingabe
gesperrt. Die Vorschau zeigt Namen, gewählte Teile, tatsächlich exportiertes
Format und die Prüfsumme der übergebenen Geometriedatei.

**Programm-Neulauf als Vorschau berechnen** baut ein neues FCStd-Dokument und
prüft den Ergebniskörper sowie den STEP-Export. Die Vorschau aktualisiert das
vorhandene Teil und zeigt Parameteränderungen sowie notwendige Folgeänderungen.
Falls das gespeicherte Dokument zuvor nativ nachbearbeitet wurde, ersetzt ein
Neulauf diese Nachbearbeitungen durch das Programm-Ergebnis. Diese Wirkung wird
ausdrücklich angezeigt und muss bei der Übernahme angenommen werden. Ein Undo
stellt auch das vorherige native Dokument und seine Programmparameter wieder her.

Nach Übernahme speichert Quelle 2 den Modus `script` oder `plan`, die aktuellen
Programmparameter und das neue FCStd-Dokument im Projektformat 22.

## Projektparameter und Varianten verwenden

Im vorhandenen Fenster **Projektparameter und Varianten** ein globales Maß
anlegen. Unter **Bindungen** die erhaltene FreeCAD-STEP-Quelle und einen Eintrag
**FreeCAD-Programmparameter …** wählen. Angeboten werden tatsächlich gespeicherte
numerische Parameter des Skripts oder CAD-Plans. Derselbe Projektparameter kann
native Formnaro-Maße, Formeln und mehrere FreeCAD-Konstruktionen gemeinsam steuern.

Die Eingaben für automatische Neuläufe ausdrücklich zuordnen. Bei einem Programm
ohne externe Geometriequellen bleibt die Liste leer. Die Zuordnung gilt für alle
Programmparameter dieses Teils und lässt sich über eine erneute Bindung ändern.
Quellen können auch erhaltene Teile innerhalb einer Gruppe sein. Selbstbezüge
und zyklische Geometrieabhängigkeiten werden abgewiesen. Eine ausdrücklich
gewählte Quelle wird als gespeicherte Geometrie gelesen, auch wenn sie in der
Variante ausgeblendet oder als eigenständiges Teil unterdrückt ist.

**Aktualisieren** berechnet den betroffenen Abhängigkeitspfad in einer Vorschau:
zuerst native Eingaben, danach abhängige FreeCAD-Programme. Jede betroffene
FreeCAD-Quelle läuft dabei höchstens einmal. Der Bericht nennt tatsächliche
FreeCAD-Läufe, native Volumina, STEP-Prüfungen und übergebene Quellen. Warnungen
vor dem Ersatz nativer Nachbearbeitungen oder verlorenen Flächenfarben stehen
vor der ausdrücklichen Übernahme. Ein Undo stellt Parameter, aktive Variante und
alle betroffenen Körper gemeinsam wieder her.

Gespeicherte Varianten verwenden dieselben Bindungen und können andere globale
Werte oder Formeln vorgeben. Ein Fehler in einem späteren FreeCAD-Programm oder
ein Abbruch übernimmt auch vorher erfolgreich berechnete Zwischenkörper nicht.
Nach einem Abbruch wartet die nächste native Anfrage auf das Aufräumen des alten
FreeCAD-Prozesses.

Die Zuordnungen verwenden `projectParameters.version: 2` mit
`freecad: [{target, inputs: [{name, target}]}]` und erfordern Projektformat 23.
Alte Projektparameter bleiben in Version 1 lesbar. Bestätigte Eingaben werden
zusätzlich mit Prüfsummen geführt. Eine Änderung ihrer Geometrie oder Lage macht
die abhängige FreeCAD-Ausgabe erneut aktualisierungspflichtig, auch wenn der
Zahlenwert des Programmparameters gleich bleibt. Ein Export dieser Ausgabe wird
bis zur Aktualisierung gesperrt.

Gruppieren und Kopieren verwenden die bestehenden exakten Quellenpfade. Ein
Bibliothekseintrag markiert nicht mit übernommene externe Eingaben ausdrücklich
als ungeklärt. Ein zufällig gleich benanntes Ziel wird nicht automatisch benutzt.
Eine neue Eingabezuordnung muss durch einen tatsächlichen Neulauf bestätigt werden.

## Vorhandene FCStd-Dateien importieren

Die normale Dateiauswahl und der Datei-Drop im CAD-Bereich nehmen `.FCStd`
entgegen. Der Dialog liest den tatsächlichen Merkmalsbaum. Bei mehreren
möglichen Ergebnissen muss ein Körper ausdrücklich gewählt werden. Nur dieser
Körper wird als neues Formnaro-Teil importiert; das vollständige ursprüngliche
FCStd-Archiv mit den anderen nativen Objekten bleibt im Projekt gespeichert.
Ein Skript oder eine parametrische Historie wird dabei nicht erfunden.

Die Vorschau prüft den gespeicherten Körper in FreeCAD sowie eine erneut
geöffnete STEP-Ausgabe. Erst „Importieren“ übernimmt das neue Teil mit einem
Undo. Native editierbare Eigenschaften bleiben über den Merkmalsdialog
zugänglich. Statische Shapes und fehlende Python-Abhängigkeiten werden weiterhin
als solche angezeigt; fehlende Proxys sperren native Änderungen am Dokument.

## Folgebezüge bei globalen FreeCAD-Parametern

Betroffene Zeichnungsansichten werden beim Aktualisieren der globalen Parameter
mit berechnet. Unabhängige Ansichten bleiben erhalten. Ein nicht mehr exakt
passender STEP-Konturbezug behält seine ursprüngliche Kontur und wird als
ungeklärt markiert. Verlorene Maße und Flächenmarkierungen sowie eine gelöste
Arbeitsebenenreferenz werden vor der Übernahme benannt. Die Lage der
Arbeitsebene und die gespeicherten Markierungspunkte bleiben erhalten.

Ein nachfolgendes FreeCAD-Programm darf keine solche ungeklärte Kontur als
berechnete Eingabe verwenden: Der gesamte Auftrag wird dann ohne Übernahme
abgelehnt. Gezielte Flächenänderungen führen FreeCAD-Parameterzuordnungen und
Programmeingaben auf die tatsächlich erhaltenen Quellenpfade weiter.
Geometrisch geschützte Originalquellen bleiben dabei schreibgeschützt.

## Native Änderungen mit abhängigen FreeCAD-Programmen

Eine native Eigenschaftsänderung und der Neulauf eines Eingabeprogramms können
bereits bestätigte FreeCAD-Folgeprogramme in derselben Vorschau aktualisieren.
Die Programme erhalten die neu berechneten Geometrieeingaben. Der Merkmalsdialog
nennt das betroffene Teil, sein natives Volumen, die STEP-Rückleseprüfung und die
bestätigten Eingaben. Erst die gemeinsame Übernahme ändert die Konstruktionen;
ein Undo stellt beide Dokumente und ihre Parameterbelege wieder her.

Das unveränderte Ursprungsprogramm einer nativen Maßänderung wird dabei nicht
zusätzlich ausgeführt. Eine globale Bindung seiner Skriptparameter setzt die
native Maßänderung deshalb nicht still zurück. Nur tatsächliche Änderungen der
Parameter oder betroffene Folgeprogramme starten einen neuen Programmlauf.
Ein verlorenes Konturprofil darf auch hier keine Eingabe eines Folgeprogramms
werden. Fehler und Abbruch lassen die gesamte bestätigte Konstruktion unverändert.

Die lokale Ausführungsfreigabe folgt den gespeicherten Abhängigkeiten. Sie
umfasst weder einen zusätzlichen Neulauf des geänderten Eingabeprogramms noch
unbeteiligte Programme. Code, Parameter, Quelldatei und bestätigte Eingaben werden
vor einem Folgelauf geprüft; ein Programm läuft je Auftrag höchstens einmal.
Paketprojekte laden dafür nur die nötigen Eingaben und Ergebnisse.

Auch eine ausdrücklich bestätigte Netzeingabe wird als tatsächliche STL-Geometrie
an FreeCAD übergeben. Eine geänderte Netzskalierung erfordert bei gleichbleibendem
Programmparameter einen neuen Lauf. Ein veraltetes Ergebnis bleibt bis dahin
für den Export gesperrt.

## Gebundene Programmparameter im manuellen Neulauf

Der Programm-Neulauf im Merkmalsdialog führt vorhandene globale Bindungen mit.
Wird beispielsweise `length = drive * 2` von 20 auf 28 geändert, wird das freie
Projektmaß `drive` von 10 auf 14 gesetzt. Eine weitere Formel wie
`width = drive / 2` bleibt erhalten und liefert anschließend 7. Die Vorschau
benennt sowohl die Programmwerte als auch die geänderten Projektparameter.
Widersprüchliche Anforderungen oder nicht eindeutig umkehrbare Formeln werden
vor dem Start abgelehnt. Das freie Ausgangsmaß kann dann direkt in der
Projektparametertabelle geändert werden.

Bei einer aktiven Variante wird deren passender freier Wert geändert; die
Basisdefinitionen und Formeln bleiben erhalten. Ungebundene Programmwerte können
im selben Auftrag geändert werden. Zuerst werden betroffene skalare Eingaben
aufgebaut, danach läuft das Hauptprogramm genau einmal und anschließend seine
Folgeprogramme. Die gemeinsame Übernahme hat einen Undo-Schritt. Bereits
veraltete, unbeteiligte Bindungen werden dabei nicht still korrigiert.

Gespeicherte bestätigte Eingabezuordnungen werden angezeigt und können geprüft
oder geändert werden. Auch eine ausdrücklich gewählte erhaltene Quelle innerhalb
einer Gruppe ist möglich. Fehlende Quellen müssen neu zugeordnet werden. Bei
älteren Projekten ohne bestätigte Zuordnung wird keine Verbindung aus dem
FCStd-Archiv geraten.

## Gezielte skalare Merkmalsänderungen mit FreeCAD-Folgen

Ein angehängter aktueller Quellen- oder Bohrungsbezug kann seine bestätigten
FreeCAD-Folgeprogramme in derselben Vorschau aktualisieren. Das gilt für native
Konstruktionsmaße und für numerische Felder gespeicherter FreeCAD-Programme mit
bereits bestätigter Eingabezuordnung. Die skalare Planung verwendet die vorhandenen
Formeln und die aktive Variante. Sie erweitert den Auftrag nur um notwendige
Folgequellen; unbeteiligte Teile und schon vorher veraltete fremde Bindungen
bleiben erhalten.

Die Durchmesserprüfung einer ausgewählten Bohrung bleibt nativ. Ihre geänderte
fertige Materialgeometrie wird anschließend an die Folgeprogramme übergeben.
Der KI-Chat nennt deren native Geometrieprüfung und STEP-Rückleseprüfung neben
dem gewählten Maß. Die gemeinsame Übernahme benötigt einen Undo-Schritt.
Veraltete, fehlende oder gesperrte Bezüge starten keinen Programmlauf.

Fehler oder Abbruch lassen Referenz, Parameter, Dokumente und bestätigte Geometrie
unverändert. Verlorene Konturen, Flächenmarkierungen und Arbeitsebenenreferenzen
werden ausdrücklich diagnostiziert; ihre ursprünglichen Daten bleiben erhalten.
Eine ungeklärte Kontur darf keine Eingabe eines weiteren Programms werden.
Paketprojekte laden nur die betroffenen Quellen und benötigten Programmeingaben.

## Noch erforderliche Arbeiten

- Zusätzliche native Merkmaltypen prüfen; nicht mitgespeicherte Add-ons
  erfordern eigene Abnahme.
- Weitere Exportfälle sowie die gepackte Windows-Anwendung vollständig abnehmen.

Die Baumansicht allein bedeutet deshalb keinen Abschluss von Paket 4.

Technische Grundlage der Eigenschafts- und Statusabfragen ist die tatsächliche
[FreeCAD-PropertyContainer-Schnittstelle](https://github.com/FreeCAD/FreeCAD/blob/main/src/App/PropertyContainerPyImp.cpp).

## Konstruktionen mit Python-Helfermodulen

Archivierte Helfermodule des ursprünglichen Skripts werden beim Lesen und Ändern
im selben isolierten Auftrag bereitgestellt. So kann FreeCAD die tatsächlichen
`FeaturePython`-Klassen wiederherstellen. Das Hauptskript wird dabei nicht erneut
ausgeführt. Ein fehlender Python-Proxy wird ausdrücklich angezeigt; dann bleiben
native Änderungen am gesamten Dokument gesperrt, damit beim Speichern keine
unvollständig wiederhergestellte Konstruktion übernommen wird. Die vorhandene
Geometrie bleibt lesbar.

Geprüft ist ein persistentes eigenes `FeaturePython` mit veränderbarer Länge,
neuer nativer Geometrie, STEP-Prüfung und erneutem Wiederöffnen. Das ist keine
pauschale Zusage für beliebige externe Add-ons: nicht mitgespeicherte oder nicht
installierte Abhängigkeiten müssen zuerst wiederhergestellt werden. FreeCAD
benötigt beim Wiederöffnen die ursprüngliche Python-Klasse; siehe die
[FreeCAD-Dokumentation zu Skriptobjekten](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Scripted_objects.md).

## Native Pad-Konstruktion und physische Exporte

Geprüft sind auch ein originales `PartDesign::Body` mit `Sketcher::SketchObject`
und `PartDesign::Pad`: die native Länge 5 → 8 mm erzeugt 480 mm³, während
die ursprüngliche Skizze und ein unabhängiges natives Objekt erhalten bleiben.
Nicht gesetzte Flächenbezüge erscheinen als leere Verknüpfung und verhindern
das Lesen des Merkmalsbaums nicht.

Der Export unter Einstellungen → KI speichert das Quelldokument des ausgewählten
Teils, auch bei einer erhaltenen Quelle innerhalb einer Gruppe. Die Abnahme
vergleicht die tatsächlich gespeicherte FCStd-Datei bytegenau und öffnet sie
nativ erneut. Ein physisch gespeichertes und über den Projektdialog wieder
geöffnetes `.fnpack` bewahrt die globale Programmparameterbindung, die native
Änderung und die ursprünglichen Skriptparameter getrennt. STEP und STL einer
ausgewählten Gruppe werden über den Exportdialog geschrieben und anschließend
in FreeCAD unabhängig auf Volumen, Abmessungen und Körper geprüft.

Der lokale Paketlauf `npm run package:freecad-document -- r1 --candidate-only`
erstellt einen getrennten unsignierten Testkandidaten. Die normale Paketierung
fordert weiterhin die eingerichtete Signieridentität. Eine technische Abnahme
ist keine signierte Veröffentlichung.
