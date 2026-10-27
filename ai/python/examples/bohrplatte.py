"""In Formnaro: KI-Werkstatt > Python-Modellierung > Vorschau berechnen."""
from formnaro import model

platte = model.box(60, 40, 6, origin=(-30, -20, 0), name="Grundplatte")
bohrungen = [model.cylinder(2.5, 8, origin=(x, y, -1), hole=True)
             for x in (-22, 22) for y in (-12, 12)]
halter = model.cut(platte, *bohrungen, name="Bohrplatte")
result = {"bohrungen": len(bohrungen), "einheit": "mm"}
