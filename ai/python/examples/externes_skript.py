"""CPython, nachdem ai/python dem Python-Pfad hinzugefügt wurde.

Zeigt bewusst zuerst nur eine Vorschau. Zum Übernehmen nach deren Prüfung
client.apply(vorschlag) ausdrücklich aufrufen.
"""
from formnaro import Client, Model

client = Client()
kontext = client.context()
szene = client.scene()
modell = Model()
modell.box(30, 20, 5, name="Python-Bauteil")
vorschlag = client.preview(modell, revision=szene["revision"])
print({"previewId": vorschlag["previewId"], "teile": vorschlag.get("after", [])})
