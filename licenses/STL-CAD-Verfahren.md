# Eigenimplementierte STL-Flächenrekonstruktion

Die Positionserzeugung verwendet die mathematische Konstruktion kubischer
Dreiecks-Bernsteinflächen nach Alex Vlachos, Jörg Peters, Chas Boyd und
Jason L. Mitchell, *Curved PN Triangles*, I3D 2001, Seiten 159–166,
DOI [10.1145/364338.364387](https://doi.org/10.1145/364338.364387).

Formnaro enthält eine eigene JavaScript-Implementierung der Formeln, eine
gemeinsame Begrenzung der Kantenkurven, explizite Bernstein-Fehler-/Orientierungs-
prüfung und die eigene exakte Umrechnung in OCCT-B-Spline-Kontrollpunkte.
Kein Programmcode oder Text aus der Veröffentlichung wurde übernommen.
Der unveränderte gemeinsame OCCT-Kern und seine bestehenden Lizenzen gelten
weiterhin für native Geometrie, Speicherung und STEP.
