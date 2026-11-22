const roles = { target: 'Soll', result: 'Ergebnis', start: 'Ausgang' };
const typePrefix = { model: 'Modell', drawing: 'Zeichnung' };
const base64Image = /^data:image\/(webp|png);base64,([A-Za-z0-9+/]+={0,2})$/;
const assetLimit = 145000;

function store(report, asset) {
  const assets = report.referenceAssets ?? [];
  const remaining =
    (report.simpleRun?.kind === 'stl-challenge' ? 1450000 : assetLimit) - assets.reduce((size, entry) => (entry.name === asset.name ? size : size + entry.base64.length), 0);
  if (asset.base64.length > remaining) return false;
  report.referenceAssets = [...assets.filter((entry) => entry.name !== asset.name), asset];
  return true;
}

export function recordLabReference(report, row, reference) {
  const attempt = report.caseIds.indexOf(row.id) + 1;
  if (reference.pictures && Object.hasOwn(roles, reference.role)) {
    const pictures = [];
    for (const [index, picture] of reference.pictures.slice(0, 4).entries()) {
      const match = base64Image.exec(picture.dataUrl);
      const kind = typePrefix[picture.kind];
      if (!match || !kind) continue;
      const name = 'Versuch-' + attempt + '-' + kind + '-' + roles[reference.role] + '-' + (index + 1) + '.' + match[1];
      if (store(report, { name, base64: match[2] }))
        pictures.push({ name, caption: String(picture.caption).slice(0, 200) });
    }
    if (pictures.length) (row.referencePictures ??= {})[reference.role] = pictures;
    return;
  }
  if (reference.photos) {
    const names = [];
    for (const [index, photo] of reference.photos.slice(0, 3).entries()) {
      const content = base64Image.exec(photo.image?.dataUrl)?.[2];
      const name = report.campaign
        ? 'Foto-' + (index + 1) + '.png'
        : 'Versuch-' + attempt + '-Foto-' + (index + 1) + '.png';
      if (content && store(report, { name, base64: content })) names.push({ name, view: photo.reference?.view });
    }
    row.reference = { photos: reference.photos.map((photo) => photo.reference?.view ?? 'Foto'), photoFiles: names };
    return;
  }
  if (reference.stl) {
    const name = report.campaign ? 'Vorlage.stl' : 'Versuch-' + attempt + '-Vorlage.stl';
    const bytes = new Uint8Array(reference.stl);
    row.reference = { mesh: reference.name, bytes: bytes.byteLength,
      ...(reference.sha256 ? { sha256: reference.sha256 } : {}) };
    if (bytes.byteLength <= (report.simpleRun?.kind === 'stl-challenge' ? 1000000 : 100000) && bytes.toBase64 && store(report, { name, base64: bytes.toBase64() }))
      row.reference.meshFile = name;
    return;
  }
  if (reference.size) row.reference = reference;
}

export function savedLabReferences(report, row) {
  const byName = new Map(report.referenceAssets?.map((asset) => [asset.name, asset.base64]));
  const dataUrl = (name) => {
    const data = byName.get(name);
    return data ? 'data:image/' + (name.endsWith('.webp') ? 'webp' : 'png') + ';base64,' + data : null;
  };
  const ref = row?.reference;
  const result = [];
  if (ref?.size && Array.isArray(ref.bores)) result.push(ref);
  if (ref?.mesh) {
    const asset = byName.get(ref.meshFile ?? 'Vorlage.stl');
    if (asset && Uint8Array.fromBase64) {
      try {
        result.push({ stl: Uint8Array.fromBase64(asset), name: ref.mesh });
      } catch {
        /* Old or incomplete exports may omit usable model bytes. */
      }
    }
  }
  if (ref?.photos) {
    const entries = ref.photoFiles ?? ref.photos.map((view, i) => ({ name: 'Foto-' + (i + 1) + '.png', view }));
    const photos = entries
      .map(({ name, view }) => ({ image: { dataUrl: dataUrl(name) }, reference: { view } }))
      .filter((photo) => photo.image.dataUrl);
    if (photos.length) result.push({ photos });
  }
  for (const role of Object.keys(roles)) {
    const pictures = (row?.referencePictures?.[role] ?? [])
      .map(({ name, caption }) => ({ dataUrl: dataUrl(name), caption, kind: name.includes('-Zeichnung-') ? 'drawing' : 'model' }))
      .filter((picture) => picture.dataUrl);
    if (pictures.length) result.push({ role, pictures });
  }
  return result;
}
