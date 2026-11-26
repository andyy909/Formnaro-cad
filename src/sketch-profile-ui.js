import { sketchCircleFromThreePoints } from './sketch-three-point-circle.js';
import { isCadCurve, curveBeziers, curveControlKeys, profilePointFields } from './cad-curves.js';
import { installSketchToolsUI } from './sketch-tools-ui.js';
import { editSketchCoordinate, pickSketchEditElement } from './sketch-tools.js';
import { cadSketchExpression, resolveCadSketch } from './cad-sketch.js';
import {
  profileFromLegacy,
  profilePrimitive,
  appendProfileLoop,
  closeProfileGap,
  circleThrough,
  profileGaps,
  resolveSketchProfile,
  profileHandles,
  profileId,
} from './sketch-profile.js';
export function installSketchProfileUI({
  s, board, svg, fields, changed, message, controller, isCurrent, desktop = true, prepareLineEdit,
}) {
  const $ = (id) => document.getElementById(id),
    root = document.createElement('section');
  root.id = 'sketch-profile-tools';
  root.innerHTML =
    '<button id="sketch-profile-enable">Konturen mit Öffnungen …</button><div id="sketch-profile-controls" hidden><p class="small-note">Form aufziehen. Linien anklicken und anschließend schließen; Bogen: Start, Zwischenpunkt, Ende. Bézier: Start, zwei Kontrollpunkte, Ende. B-Spline: Kontrollpunkte anklicken, dann fertigstellen. Offene Konturen bleiben Entwürfe.</p><div class="sketch-canvas-toolbar"><label>Zeichenform<select id="sketch-profile-shape"><option value="circle">Kreis</option><option value="line">Linienzug</option><option value="circle3">Kreis durch 3 Punkte</option><option value="arc">Dreipunktbogen</option><option value="bezier">Bézier · 4 Punkte</option><option value="bspline">B-Spline · 4–16 Punkte</option><option value="rectangle">Rechteck</option><option value="roundrect">Rundrechteck</option><option value="slot">Langloch</option><option value="construction">Konstruktionslinie</option></select></label><label>Kontur<select id="sketch-profile-role"><option value="hole">Innenöffnung hinzufügen</option><option value="outer">Außenkontur ersetzen</option></select></label><label>Eckradius (mm)<input id="sketch-profile-radius" type="number" value="2" min="0.01" step="0.1"></label><button id="sketch-curve-finish">B-Spline fertigstellen</button><button id="sketch-profile-close">Linienzug schließen</button></div></div>';
  board.before(root);
  const properties = document.createElement('fieldset');
  properties.id = 'sketch-profile-properties';
  properties.hidden = true;
  properties.innerHTML =
    '<legend>Konturelement bearbeiten</legend><label>Element<select id="sketch-profile-element"></select></label><div id="sketch-profile-fields"></div><button id="sketch-profile-delete">Element entfernen</button>';
  $('sketch-dimensions').closest('fieldset').after(properties);
  let pending = [],
    activeLoop = null,
    activeId = null,
    lineEdit = null,
    toolsUI;
  const commandBar = root.querySelector('.sketch-canvas-toolbar');
  const finish = document.createElement('button');
  finish.type = 'button';
  finish.id = 'sketch-profile-finish-open';
  finish.textContent = 'Offen beenden';
  finish.onclick = finishOpen;
  commandBar.insertBefore(finish, $('sketch-profile-close'));
  const lineEditButtons = new Map();
  if (desktop) {
    for (const [mode, label] of [['trim', 'Linie trimmen'], ['extend', 'Linie verlängern']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'sketch-profile-canvas-' + mode;
      button.textContent = label;
      button.setAttribute('aria-pressed', 'false');
      button.onclick = () => startLineEdit(mode);
      commandBar.append(button);
      lineEditButtons.set(mode, button);
    }
  }
  const select = $('sketch-kind'),
    option = document.createElement('option');
  option.value = 'profile';
  option.textContent = 'Konturen mit Öffnungen';
  select.append(option);
  function enable() {
    if (![2, 3, 4].includes(s.sketch.version)) s.sketch = profileFromLegacy(s.sketch, resolveCadSketch(s.sketch));
    select.value = 'profile';
    fields();
    changed();
  }
  $('sketch-profile-enable').onclick = enable;
  function inputFields() {
    const container = $('sketch-profile-fields');
    container.replaceChildren();
    const e = s.sketch.elements?.find((e) => e.id === activeId);
    if (!e) return;
    const bindings = isCadCurve(e)
      ? profilePointFields(e).flatMap((key) => [
          [key, 0, (key === 'start' ? 'Start' : key === 'end' ? 'Ende' : 'Kontrollpunkt ' + key.slice(7)) + ' X'],
          [key, 1, (key === 'start' ? 'Start' : key === 'end' ? 'Ende' : 'Kontrollpunkt ' + key.slice(7)) + ' Y'],
        ])
      : e.type === 'circle'
        ? [
            ['center', 0, 'Mitte X'],
            ['center', 1, 'Mitte Y'],
            ['diameter', null, 'Durchmesser'],
          ]
        : e.type === 'arc'
          ? [
              ['start', 0, 'Start X'],
              ['start', 1, 'Start Y'],
              ['through', 0, 'Zwischenpunkt X'],
              ['through', 1, 'Zwischenpunkt Y'],
              ['end', 0, 'Ende X'],
              ['end', 1, 'Ende Y'],
            ]
          : [
              ['start', 0, 'Start X'],
              ['start', 1, 'Start Y'],
              ['end', 0, 'Ende X'],
              ['end', 1, 'Ende Y'],
            ];
    for (const [key, axis, title] of bindings) {
      const label = document.createElement('label');
      label.textContent = title + ' (mm / Formel)';
      const input = document.createElement('input');
      input.value = axis === null ? e[key] : e[key][axis];
      input.maxLength = 200;
      input.dataset.profileField = key + (axis ?? '');
      input.oninput = () => {
        try {
          if (axis === null) s.sketch.elements.find((item) => item.id === e.id)[key] = input.value;
          else s.sketch = editSketchCoordinate(s.sketch, e.id, key, axis, input.value);
          changed();
          toolsUI?.dimensions();
        } catch (error) {
          message(error.message, true);
        }
      };
      label.append(input);
      container.append(label);
    }
    if (e.type === 'bspline') {
      const fixed = s.sketch.constraints?.some(
        (c) => c.type === 'fixed' && c.refs.some((r) => r.element === e.id && !r.point),
      );
      const add = document.createElement('button'),
        remove = document.createElement('button');
      add.textContent = 'Kontrollpunkt ergänzen';
      add.disabled = fixed || curveControlKeys(e).length >= 14;
      add.dataset.profileControlAdd = '';
      remove.dataset.profileControlRemove = '';
      add.onclick = () => {
        if (fixed) {
          message('Zuerst die elementweite Fixierung entfernen.', true);
          return;
        }
        const e = s.sketch.elements.find((item) => item.id === activeId),
          keys = curveControlKeys(e),
          last = e[keys.at(-1)];
        e['control' + (keys.length + 1)] = last.map((v, k) => '(' + v + ' + ' + e.end[k] + ')/2');
        fields();
        changed();
      };
      remove.textContent = 'Letzten Kontrollpunkt entfernen';
      remove.disabled = fixed || curveControlKeys(e).length <= 2;
      remove.onclick = () => {
        if (fixed) {
          message('Zuerst die elementweite Fixierung entfernen.', true);
          return;
        }
        const e = s.sketch.elements.find((item) => item.id === activeId),
          key = curveControlKeys(e).at(-1);
        if (s.sketch.constraints?.some((c) => c.refs.some((r) => r.element === e.id && r.point === key))) {
          message('Zuerst die Bedingung dieses Kontrollpunkts entfernen.', true);
          return;
        }
        delete e[key];
        fields();
        changed();
      };
      container.append(add, remove);
    }
  }
  $('sketch-profile-element').onchange = () => {
    activeId = $('sketch-profile-element').value;
    inputFields();
    toolsUI?.refresh();
  };
  $('sketch-profile-delete').onclick = () => {
    if (!activeId) return;
    if (s.sketch.version >= 3 && s.sketch.constraints.some((c) => c.refs.some((r) => r.element === activeId))) {
      message('Zuerst die Bedingungen dieses Elements entfernen.', true);
      return;
    }
    s.sketch.elements = s.sketch.elements.filter((e) => e.id !== activeId);
    for (const l of s.sketch.loops) l.elements = l.elements.filter((id) => id !== activeId);
    s.sketch.loops = s.sketch.loops.filter((l) => l.elements.length);
    activeId = null;
    fields();
    changed();
  };
  function resetLineEdit() {
    lineEdit = null;
    delete board.dataset.lineEdit;
    board.querySelector('.sketch-line-edit-target')?.remove();
    for (const button of lineEditButtons.values()) button.setAttribute('aria-pressed', 'false');
  }
  function clearPreview() {
    board.querySelector('.sketch-line-preview')?.remove();
  }
  function refreshFinish() {
    finish.disabled = !(pending.length && $('sketch-profile-shape').value === 'line');
  }
  const reset = () => {
    pending = [];
    activeLoop = null;
    clearPreview();
    resetLineEdit();
    refreshFinish();
  };
  function finishOpen() {
    if (!pending.length || $('sketch-profile-shape').value !== 'line') return false;
    const committed = !!activeLoop;
    reset();
    if (committed) message('Linienzug offen beendet.');
    return true;
  }
  function cancelDrawing() {
    if (!lineEdit && !pending.length) return false;
    reset();
    return true;
  }
  function drawPreview(end, _extent, origin) {
    clearPreview();
    const mode = $('sketch-profile-shape').value;
    const start = mode === 'line' ? pending[0] ?? origin : origin;
    if (lineEdit || !['line', 'construction'].includes(mode) || !start || !end ||
        Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-7) return;
    svg('line', {
      x1: start[0], y1: -start[1], x2: end[0], y2: -end[1],
      class: 'sketch-line-preview', stroke: '#79e0e7', 'stroke-width': 1.5,
      'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
    });
  }
  function drawLineEditTarget(elements) {
    board.querySelector('.sketch-line-edit-target')?.remove();
    const target = elements.find((element) => element.id === lineEdit?.target?.id);
    if (!target) return;
    svg('line', {
      x1: target.start[0], y1: -target.start[1], x2: target.end[0], y2: -target.end[1],
      class: 'sketch-line-edit-target', stroke: '#ffc853', 'stroke-width': 2,
      'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
    });
  }
  function startLineEdit(mode) {
    if (!desktop || s.linked || !lineEditButtons.has(mode) || ![2, 3, 4].includes(s.sketch.version)) return false;
    const wasActive = lineEdit?.mode === mode;
    reset();
    if (wasActive) return false;
    prepareLineEdit?.();
    lineEdit = { mode, target: null };
    board.dataset.lineEdit = mode;
    lineEditButtons.get(mode).setAttribute('aria-pressed', 'true');
    message('Die Linie nahe dem Ende anklicken, das geändert werden soll.');
    return true;
  }
  function handleLineEdit(point, tolerance) {
    if (!lineEdit) return false;
    try {
      const { elements } = resolveSketchProfile(s.sketch, cadSketchExpression, { geometryOnly: true });
      const { target, mode } = lineEdit;
      const pick = pickSketchEditElement(elements, point, tolerance, { lineOnly: !target, exclude: target?.id });
      if (!pick) {
        message(target ? 'Eine andere Linie, einen Kreis oder Kreisbogen als Grenze anklicken.' : 'Eine Linie anklicken.', true);
      } else if (!target) {
        lineEdit.target = pick;
        activeId = pick.id;
        refresh();
        drawLineEditTarget(elements);
        message('Jetzt die Schnittgrenze anklicken.');
      } else {
        const ok = toolsUI.editLine({ id: target.id, end: target.end, mode, cutterId: pick.id });
        if (ok) resetLineEdit();
      }
    } catch (error) {
      message(error.message, true);
    }
    return true;
  }
  $('sketch-profile-shape').onchange = () => {
    pending = [];
    clearPreview();
    resetLineEdit();
    refreshFinish();
    if (!['line', 'arc', 'bezier', 'bspline'].includes($('sketch-profile-shape').value)) activeLoop = null;
  };
  $('sketch-profile-role').onchange = reset;
  function distancePoints(id, field, otherId, otherField) {
    const r = resolveSketchProfile(s.sketch, cadSketchExpression, { geometryOnly: true }),
      a = r.elements.find((e) => e.id === id)[field],
      b = otherId
        ? r.elements.find((e) => e.id === otherId)[otherField]
        : otherField.map((v) =>
            cadSketchExpression(String(v), (name) => {
              if (!Object.hasOwn(r.values, name)) throw Error('Unbekanntes Maß: ' + name);
              return r.values[name];
            }),
          );
    return Math.hypot(...a.map((v, k) => v - b[k]));
  }
  function appendChain(element) {
    const role = $('sketch-profile-role').value;
    if (!s.sketch.loops.some((l) => l.id === activeLoop)) activeLoop = null;
    if (!activeLoop) {
      const unfinished = s.sketch.loops.find((l) => {
        if (l.role !== role || !l.elements.length) return false;
        const first = s.sketch.elements.find((e) => e.id === l.elements[0]),
          last = s.sketch.elements.find((e) => e.id === l.elements.at(-1));
        return (
          first?.start &&
          last?.end &&
          distancePoints(last.id, 'end', first.id, 'start') > 1e-7 &&
          distancePoints(last.id, 'end', null, element.start) < 1e-7
        );
      });
      activeLoop = unfinished?.id ?? null;
    }
    if (!activeLoop) {
      s.sketch = appendProfileLoop(s.sketch, [element], role);
      activeLoop = s.sketch.loops.at(-1).id;
    } else {
      s.sketch.elements.push(element);
      s.sketch.loops.find((l) => l.id === activeLoop).elements.push(element.id);
    }
    activeId = element.id;
  }
  function finishCurve(type) {
    if (pending.length < 4 || pending.length > 16 || (type === 'bezier' && pending.length !== 4))
      throw Error('Bézier benötigt vier, B-Spline vier bis sechzehn Kontrollpunkte.');
    const element = {
      id: profileId(type),
      type,
      start: [...pending[0]],
      end: [...pending.at(-1)],
      construction: false,
    };
    pending.slice(1, -1).forEach((p, i) => (element['control' + (i + 1)] = [...p]));
    appendChain(element);
    s.sketch.version = 4;
    s.sketch.constraints ??= [];
    pending = [];
    fields();
    changed();
  }
  $('sketch-curve-finish').onclick = () => {
    try {
      if ($('sketch-profile-shape').value !== 'bspline') throw Error('Zum Fertigstellen eine B-Spline zeichnen.');
      finishCurve('bspline');
      void s.solveConstraints();
    } catch (error) {
      message(error.message, true);
    }
  };
  $('sketch-profile-close').onclick = () => {
    try {
      const { elements } = resolveSketchProfile(s.sketch, cadSketchExpression, { geometryOnly: true });
      const added = closeProfileGap(s.sketch, elements, activeLoop);
      if (added) activeId = added;
      reset();
      fields();
      changed();
      if (added && s.sketch.version >= 3) void s.solveConstraints();
    } catch (error) {
      message(error.message, true);
    }
  };
  function pointerUp(origin, end) {
    clearPreview();
    try {
      const shape = $('sketch-profile-shape').value,
        role = $('sketch-profile-role').value,
        dragged = Math.hypot(...origin.map((v, k) => v - end[k])) > 1e-6;
      let ids;
      if (['bezier', 'bspline'].includes(shape)) {
        pending.push([...end]);
        if (pending.length > 16) {
          pending.pop();
          throw Error('Höchstens sechzehn Kontrollpunkte.');
        }
        if (shape === 'bezier' && pending.length === 4) {
          try {
            finishCurve(shape);
          } catch (error) {
            pending.pop();
            throw error;
          }
          return true;
        }
        else
          message(
            shape === 'bezier'
              ? 'Bézier: ' + (4 - pending.length) + ' weitere Punkte anklicken.'
              : 'B-Spline: ' + pending.length + ' Kontrollpunkte; ab vier Punkten fertigstellen.',
          );
        return false;
      }
      if (shape === 'line') {
        if (!pending.length) {
          pending = [dragged ? origin : end];
          refreshFinish();
          if (!dragged) return false;
        }
        const start = pending[0];
        if (Math.hypot(start[0] - end[0], start[1] - end[1]) <= 1e-7) return false;
        const id = profileId('line');
        appendChain({ id, type: 'line', start: [...start], end: [...end], construction: false });
        ids = [id];
        pending = [[...end]];
        const loop = s.sketch.loops.find((item) => item.id === activeLoop);
        if (loop.elements.length >= 3 && distancePoints(loop.elements[0], 'start', activeId, 'end') < 1e-7) reset();
      } else if (shape === 'circle3') {
        if (pending.some((point) => Math.hypot(point[0] - end[0], point[1] - end[1]) <= 1e-7))
          throw Error('Einen anderen Punkt auf dem Kreisrand wählen.');
        if (pending.length < 2) {
          pending.push(end);
          message('Kreis: ' + (3 - pending.length) + ' weitere Punkte auf dem Rand wählen.');
          return;
        }
        const { center, radius } = sketchCircleFromThreePoints(pending[0], pending[1], end);
        if (radius < 0.005 || radius > 5000)
          throw Error('Kreisdurchmesser außerhalb 0,01–10000 mm. Einen anderen Punkt wählen.');
        const entities = profilePrimitive('circle', center, [center[0] + radius, center[1]]);
        s.sketch = appendProfileLoop(s.sketch, entities, role);
        activeId = entities[0].id;
        ids = [activeId];
        reset();
      } else if (shape === 'arc') {
        if (pending.length < 2) {
          if (pending.some((point) => Math.hypot(point[0] - end[0], point[1] - end[1]) <= 1e-7)) return false;
          pending.push(end);
          message('Bogen: ' + (3 - pending.length) + ' weitere Punkte anklicken.');
          return false;
        }
        circleThrough(pending[0], pending[1], end);
        appendChain({
          id: profileId('arc'),
          type: 'arc',
          start: pending[0],
          through: pending[1],
          end,
          construction: false,
        });
        pending = [];
      } else {
        if (!dragged) throw Error('Die Form mit gedrückter Maustaste aufziehen.');
        if (shape === 'rectangle' && origin.some((value, index) => Math.abs(value - end[index]) <= 1e-7))
          throw Error('Rechteck benötigt Breite und Höhe.');
        const entities = profilePrimitive(shape === 'construction' ? 'line' : shape, origin, end, {
          radius: Number($('sketch-profile-radius').value),
          construction: shape === 'construction',
        });
        if (shape === 'construction') s.sketch.elements.push(...entities);
        else s.sketch = appendProfileLoop(s.sketch, entities, role);
        ids = entities.map((entity) => entity.id);
        activeId = entities[0].id;
        reset();
      }
      fields();
      changed();
      return ids ?? true;
    } catch (error) {
      message(error.message, true);
      return false;
    }
  }
  function refresh() {
    const active = [2, 3, 4].includes(s.sketch.version);
    $('sketch-profile-enable').hidden = active;
    $('sketch-profile-controls').hidden = !active;
    properties.hidden = !active;
    $('modal').classList.toggle('sketch-profile-active', active);
    if (!active) return;
    refreshFinish();
    select.value = 'profile';
    const list = $('sketch-profile-element');
    list.replaceChildren();
    for (const e of s.sketch.elements) {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent =
        { line: 'Linie', arc: 'Bogen', circle: 'Kreis', bezier: 'Bézier', bspline: 'B-Spline' }[e.type] +
        (e.construction ? ' · Konstruktion' : '') +
        ' · ' +
        e.id.slice(-6);
      list.append(opt);
    }
    if (!s.sketch.elements.some((e) => e.id === activeId)) activeId = s.sketch.elements.at(-1)?.id ?? null;
    list.value = activeId ?? '';
    inputFields();
    toolsUI?.refresh();
  }
  function render(extent, geometry) {
    if (![2, 3, 4].includes(s.sketch.version)) return null;
    try {
      const r = geometry
        ? geometry.resolved
        : resolveSketchProfile(s.sketch, cadSketchExpression, { geometryOnly: true });
      if (!r) return [];
      const map = new Map(r.elements.map((e) => [e.id, e])),
        gapsByLoop = new Map();
      for (const { loopId, index } of profileGaps(s.sketch.loops, r.elements)) {
        if (!gapsByLoop.has(loopId)) gapsByLoop.set(loopId, new Set());
        gapsByLoop.get(loopId).add(index);
      }
      let closedPaths = '',
        openPaths = '';
      for (const loop of s.sketch.loops) {
        const entities = loop.elements.map((id) => map.get(id)).filter(Boolean);
        const gaps = gapsByLoop.get(loop.id);
        let d = '';
        for (const [index, element] of entities.entries()) {
          const { start, end } = element;
          if (index === 0 || gaps?.has(index - 1)) d += ' M ' + start[0] + ' ' + -start[1];
          if (isCadCurve(element)) {
            for (const points of curveBeziers(element))
              d +=
                ' C ' +
                points
                  .slice(1)
                  .map((p) => p[0] + ' ' + -p[1])
                  .join(' ');
          } else if (element.type === 'line') d += ' L ' + end[0] + ' ' + -end[1];
          else if (element.type === 'arc')
            d +=
              ' A ' +
              element.radius +
              ' ' +
              element.radius +
              ' 0 ' +
              (Math.abs(element.sweep) > Math.PI ? 1 : 0) +
              ' ' +
              (element.sweep > 0 ? 0 : 1) +
              ' ' +
              end[0] +
              ' ' +
              -end[1];
          else
            d +=
              ' A ' +
              element.radius +
              ' ' +
              element.radius +
              ' 0 1 0 ' +
              (element.center[0] - element.radius) +
              ' ' +
              -element.center[1] +
              ' A ' +
              element.radius +
              ' ' +
              element.radius +
              ' 0 1 0 ' +
              start[0] +
              ' ' +
              -start[1];
        }
        if (gaps) openPaths += d;
        else if (d) closedPaths += d + ' Z';
      }
      if (closedPaths) svg('path', { d: closedPaths, class: 'contour', 'fill-rule': 'evenodd' });
      if (openPaths) svg('path', { d: openPaths, class: 'contour contour-open' });
      for (const e of r.elements.filter(isCadCurve)) {
        const points = profilePointFields(e).map((k) => e[k]);
        svg('polyline', {
          points: points.map((p) => p[0] + ',' + -p[1]).join(' '),
          class: 'construction',
          fill: 'none',
        });
      }
      for (const e of r.elements.filter((e) => e.construction)) {
        if (isCadCurve(e)) {
          const d =
            'M ' +
            e.start[0] +
            ' ' +
            -e.start[1] +
            curveBeziers(e)
              .map(
                (p) =>
                  ' C ' +
                  p
                    .slice(1)
                    .map((v) => v[0] + ' ' + -v[1])
                    .join(' '),
              )
              .join('');
          svg('path', { d, class: 'construction', fill: 'none' });
        } else if (e.type === 'circle')
          svg('circle', { cx: e.center[0], cy: -e.center[1], r: e.radius, class: 'construction', fill: 'none' });
        else if (e.type === 'arc')
          svg('path', {
            d:
              'M ' +
              e.start[0] +
              ' ' +
              -e.start[1] +
              ' A ' +
              e.radius +
              ' ' +
              e.radius +
              ' 0 ' +
              (Math.abs(e.sweep) > Math.PI ? 1 : 0) +
              ' ' +
              (e.sweep > 0 ? 0 : 1) +
              ' ' +
              e.end[0] +
              ' ' +
              -e.end[1],
            class: 'construction',
            fill: 'none',
          });
        else svg('line', { x1: e.start[0], y1: -e.start[1], x2: e.end[0], y2: -e.end[1], class: 'construction' });
      }
      const handles = geometry ? geometry.handles : profileHandles(s.sketch, cadSketchExpression);
      drawLineEditTarget(r.elements);
      for (let i = 0; i < handles.length; i++) {
        const p = handles[i].point;
        svg('circle', { cx: p[0], cy: -p[1], r: extent / 100, class: 'vertex', 'data-point-index': i });
      }
      return handles.map((h) => h.point);
    } catch {
      return [];
    }
  }
  function removeLast() {
    const e = s.sketch.elements.at(-1);
    if (!e) return;
    if (s.sketch.version >= 3 && s.sketch.constraints.some((c) => c.refs.some((r) => r.element === e.id))) {
      message('Zuerst die Bedingungen dieses Elements entfernen.', true);
      return;
    }
    s.sketch.elements.pop();
    for (const l of s.sketch.loops) l.elements = l.elements.filter((id) => id !== e.id);
    s.sketch.loops = s.sketch.loops.filter((l) => l.elements.length);
    reset();
    fields();
    changed();
  }
  toolsUI = installSketchToolsUI({
    s,
    controller,
    properties,
    fields,
    changed,
    message,
    getId: () => activeId,
    isCurrent,
  });
  return {
    refresh, pointerUp, render, enable, reset, removeLast, drawPreview,
    circlePlacement(cursor) {
      if ($('sketch-profile-shape').value !== 'circle3') return null;
      let preview;
      if (cursor && pending.length === 2) {
        try {
          const circle = sketchCircleFromThreePoints(...pending, cursor);
          if (circle.radius >= 0.005 && circle.radius <= 5000) preview = circle;
        } catch {
          // The user can choose another point until a valid circle is possible.
        }
      }
      return { points: pending, preview };
    },
    lineStart: (origin) => pending[0] ?? origin,
    updateLineEnd(id, point) {
      if (activeId === id && activeLoop && pending.length === 1) pending = [[...point]];
    },
    finishOpen, cancelDrawing, startLineEdit, handleLineEdit, asCopy: () => toolsUI.asCopy(),
  };
}
