# Lokales Paketformat .fnpack, Version 1

Das Dateiformat ist unabhängig vom ursprünglichen STEP-Eingabepfad und benötigt keine externe Bibliothek. Alle Zahlen im festen Kopf verwenden Little Endian.

| Bereich | Inhalt |
| --- | --- |
| Byte 0–7 | ASCII-Magic `FNPACK\r\n` |
| Byte 8–11 | Formatversion, uint32, aktuell 1 |
| Byte 12–15 | Länge des UTF-8-Index, uint32, höchstens 16 MiB |
| Byte 16–47 | SHA-256 der exakten Indexbytes |
| Byte 48–63 | Reserviert, ausschließlich Nullbytes |
| Ab Byte 64 | Index, anschließend unmittelbar die Geometrieblöcke |

Der Index enthält ausschließlich `format: "FormnaroPackage"`, `version: 1`, `project` und `blocks`. Das Projekt verwendet Version 17. Gespeicherte BRep- und Netzpuffer werden durch strenge `Formnaro-GeometryRef`-Datensätze ersetzt. Ein Verweis enthält Blockart, SHA-256 und Bytezahl; Netzverweise ergänzen Kataloggrenzen, Punkt-/Dreieckszahlen und eine ausdrücklich ungeprüfte Darstellungsklasse. Native Körper behalten ihre bisherigen lokalen Statistik- und Quellenmetadaten.

Jeder Blockeintrag enthält `sha256`, `kind`, `bytes` und `offset`. Der Offset ist relativ zum Beginn der Geometrieblöcke. Blöcke folgen ohne Lücken und Überlappungen, Hashes sind eindeutig, und die Dateilänge muss exakt zum letzten Block passen. Jeder referenzierte Block muss aufgeführt sein; unreferenzierte Blöcke sind nicht erlaubt. Der gesamte Container ist auf 2 GiB begrenzt.

BRep-Blöcke enthalten den exakten UTF-8-BRep-Text ohne Änderung seiner Topologie. Netzblöcke enthalten UTF-8-JSON mit originalen `verts` und `triangles`. Hashes prüfen tatsächliche Bytes, keine ungefähre geometrische Ähnlichkeit. Instanzen mit verschiedenen Kennungen oder affinen Matrizen können denselben Block verwenden.

`geometryIdentity` bewahrt die bisherigen Korrespondenzsignaturen und Metadatenschlüssel für unveränderte ausgelassene Quellen. Diese Angaben sind Kataloginformationen und kein nativer Geometriebeweis. Nach dem Hydratisieren werden Geometriesignaturen aus den tatsächlichen Bytes berechnet. Geänderte Platzierungen und Quellen erhalten die entsprechenden neuen Signaturen. Ein Katalogobjekt wird in Szenenantworten ausdrücklich mit `geometryLoaded: false` und `geometryEvidence: "package-catalogue-only"` gekennzeichnet.

Die native Dateiseite liest Kopf und Index beim Öffnen sowie einzelne erforderliche Blöcke über begrenzte Bereichszugriffe. Speichern kopiert ungeladene Blöcke stückweise mit erneuter Prüfsummenprüfung. Private Dateizugriffskennungen und Zwischenspeicher gehören zur laufenden Sitzung und werden niemals Bestandteil des Paketformats.
