const {imageTypes,maxImageBytes,maxAttachmentBytes}=require('./ai-input-limits.json');
const maxStlBytes = 32 * 1024 * 1024;

// File data comes from the trusted main window after explicit selection.
// Never resolve a filename or a path supplied by a plan.
function validatePracticeFiles(files = []) {
  if (!Array.isArray(files) || files.length > 4) throw Error('Höchstens vier Übungsdateien wählen.');
  let photoBytes = 0;
  let meshes = 0;
  return files.map(file => {
    if (!file || Object.keys(file).sort().join(',') !== 'base64,kind,mimeType,name' ||
        typeof file.name !== 'string' || !file.name.trim() || file.name.length > 120 ||
        /[\x00-\x1f<>:"/\\|?*]/.test(file.name)) throw Error('Ungültiger Name für Übungsdatei.');
    const photo = file.kind === 'photo' && imageTypes.includes(file.mimeType);
    const stl = file.kind === 'stl' && file.mimeType === 'model/stl' && /\.stl$/i.test(file.name);
    if (!photo && !stl) throw Error('Nur Fotos und STL-Dateien sind für die Übung verfügbar.');
    const limit = photo ? maxImageBytes : maxStlBytes;
    if (typeof file.base64 !== 'string' || !file.base64.length || file.base64.length > Math.ceil(limit/3)*4 ||
        file.base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64) ||
        Buffer.byteLength(file.base64,'base64') > limit) throw Error('Übungsdatei ist leer, zu groß oder beschädigt.');
    if (photo) photoBytes += Buffer.byteLength(file.base64,'base64');
    if (stl) meshes++;
    if (photoBytes > maxAttachmentBytes || meshes > 1) throw Error('Übungsdateien: maximal 12 MiB Fotos und eine STL-Datei.');
    return {...file};
  });
}

module.exports = {validatePracticeFiles};
