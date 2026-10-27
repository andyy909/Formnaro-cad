# Formnaro 0.108.0 – technische Fotoansichten

Paket 2 des Ausbauplans verbindet drei bestätigte Fotoansichten über gemeinsame
Achsen, Nullpunkte und Zielmaße. Fehlende oder widersprüchliche Referenzen sperren
die Berechnung. Aus den Profilen entsteht eine editierbare native CAD-Schnittmenge
mit drei gemeinsamen Projektparametern und neun Quellenbindungen.

Jede Ansicht wird getrennt an demselben Nullpunkt verglichen. Native Außenmaße,
ein einzelner Körper und optionale Freiraum-/Bohrungsprüfungen entscheiden über die
Übernahme. Ein verschobenes Teil kann trotz unveränderter Maße nicht durch erneutes
Zentrieren bestehen. Verdeckte Geometrie erfordert ausdrückliche Annahmen.

Ansichtssätze, Originalbilder und Herkunft werden in Projektformat 20 erhalten;
reine Foto-Projekte bleiben Format 19. Bestehende Quellen und Sperren bleiben,
Übernahme und Metadatenänderungen verwenden den vorhandenen Undo-Stack. Native
STEP-Ausgabe bleibt möglich. Details: [Foto-Assistent](FOTO-ASSISTENT.md).

Die Windows-Abnahme wird am eingefrorenen Quellstand und an der tatsächlichen
gepackten Anwendung dokumentiert. Prüfergebnisse und Freigabe stehen beim Release.
Pakete 3–10 sind weiterhin offen; optionale Zusatzmodule sind nicht enthalten.

Abnahme: 285 eingefrorene Tests und 738 Gruppen an der tatsächlichen
Windows-EXE bestanden, davon 37 gerade und 37 schräge Mehransichtenprüfungen.
Keine Rendererfehler oder externen Testanfragen. 138 geschützte frühere
EXE-/ASAR-Dateien unverändert; vollständige Source-/Stage-/ASAR-/Runtime-Integrität
geprüft. Reale Screenshots vor Freigabe gesichtet.
