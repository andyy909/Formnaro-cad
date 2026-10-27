from formnaro import model, frame

unten = model.polygon([(-10,-5),(10,-5),(10,5),(-10,5)], .1,
                      name="Unteres Profil")
oben = model.polygon([(-5,-5),(5,-5),(5,5),(-5,5)], .1,
                     plane=frame((0,0,20)), name="Oberes Profil")
teil = model.loft(unten, oben, name="Bearbeitbarer Profilübergang")
result = {"hoehe": 20, "profile": 2}
