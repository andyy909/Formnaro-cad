import { taskAt } from './cad-lab-frontiers.js';
import { plateTask } from './cad-lab-plate-task.js';

const descriptions = {
  'practice-01': 'Den markierten Quader im Übungsfenster an die vorgegebene Position verschieben.',
  drill: 'Eine mittige Durchgangsbohrung im vorhandenen Körper vorführen.',
  pattern: 'Aus dem Ausgangsteil ein Kreismuster mit den vorgegebenen Abständen erstellen.',
  'advanced-01': 'Drei Durchgänge an den vorgegebenen, asymmetrischen Positionen bohren.',
  'advanced-03': 'Gebohrte Hülsen versetzt anordnen und ihre Öffnungen erhalten.',
  'advanced-05': 'Ein offenes Gehäuse mit seitlicher Öffnung und erhaltenen Wänden modellieren.',
  'advanced-07': 'Eine bearbeitbare L-förmige Skizze mit zwei Innenkonturen erstellen.',
  'advanced-08': 'Eine technische Zeichnung mit Schnittansicht und Bezugsmaßen erzeugen.',
  'photo-calibrated': 'Die kalibrierte Außenkontur als 4 mm dicke Platte mit freier Öffnung nachbauen.',
  'photo-perspective': 'Die schräge Ansicht entzerren und die Platte mit ihrer Öffnung maßgerecht nachbauen.',
  'photo-missing-scale': 'Die fehlenden Angaben zu Maßstab und Tiefe gezielt erfragen.',
  'stl-bores': 'Die Platte als bearbeitbaren Körper mit den vorhandenen Durchgangsbohrungen nachbauen.',
  'stl-countersinks': 'Die beiden Durchgänge samt Senkungen als bearbeitbare Merkmale rekonstruieren.',
  'stl-rim': 'Das offene Gehäuse mit Hohlraum und abgeschrägtem Rand rekonstruieren.',
  'stl-cone': 'Die Profilbohrung mit ihrem konischen Abschnitt rekonstruieren.',
  'stl-freeform': 'Das Freiformdach mit dem Verlauf der Vorlage rekonstruieren.',
};

export function frontierTaskCard(document, domain, level, version) {
  const task = taskAt(domain, level, version);
  if (!task) return null;
  const section = document.createElement('section');
  section.className = 'lab-frontier-task';
  const title = document.createElement('h4');
  const description = document.createElement('p');
  section.append(title, description);
  title.textContent = task.label;

  if (domain === 'Plattengrenze') {
    const plate = plateTask(task.level);
    const span = plate.length + plate.extension;
    title.textContent = 'Platte mit ' + plate.holes + ' Durchgangsbohrungen';
    description.textContent =
      'Platte erstellen, rechts um ' + plate.extension + ' mm verlängern und die vorgesehenen Bohrungen auf Ø8 mm ändern. Linke Stirnseite, Randabstände und gleichmäßige Verteilung erhalten.';
    section.append(platePreview(document, plate, span));
  } else if (task.id === 'photo-set') {
    description.textContent = 'Jedes Foto einzeln als maßgerechte Platte mit allen Öffnungen nachbauen.';
  } else {
    description.textContent = descriptions[task.id] ?? (task.id === 'guided-set'
      ? 'Alle Übungen am Stück vorführen. Jede Übung erhält ein frisches Ausgangsprojekt.'
      : (
      domain === 'Fotogrenze'
        ? 'Die kalibrierte Platte mit allen versetzten Öffnungen aus dem Bild nachbauen.'
        : 'Die versetzten Stufenbohrungen mit ihren Durchgängen als bearbeitbare Merkmale rekonstruieren.'
    ));
  }
  return section;
}

function platePreview(document, plate, span) {
  const figure = document.createElement('figure');
  figure.className = 'lab-plate-preview';
  const outline = document.createElement('div');
  outline.className = 'lab-plate-outline';
  outline.style.aspectRatio = span + ' / ' + plate.width;
  outline.setAttribute('aria-hidden', 'true');

  const axis = document.createElement('span');
  axis.className = 'lab-plate-axis';
  outline.append(axis);

  const diameters = plate.axes(span).map((x, i) => {
    const changed = plate.changed(i);
    const diameter = changed ? 8 : 6;
    const hole = document.createElement('span');
    hole.className = changed ? 'lab-plate-hole lab-plate-hole-changed' : 'lab-plate-hole';
    hole.style.left = (x / span) * 100 + '%';
    hole.style.width = (diameter / span) * 100 + '%';
    outline.append(hole);
    return 'Ø' + diameter;
  });

  const caption = document.createElement('figcaption');
  caption.textContent = 'Soll-Draufsicht · ' + span + ' × ' + plate.width + ' × 6 mm · Bohrungen von links ' + diameters.join(' / ') +
    ' · Randabstände ' + plate.margin + ' mm';
  figure.append(outline, caption);
  return figure;
}
