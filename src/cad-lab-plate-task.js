import settings from '../ai/lab-plate-frontier.json' with { type: 'json' };

export function plateTask(level, repeat = false) {
  const holes = level + 1,
    margin = repeat ? 12 : 10;
  const length = 80 + (level - 1) * 24 + (repeat ? 8 : 0);
  const width = repeat ? 44 : 40,
    extension = repeat ? 24 : 20;
  const axes = (span) => Array.from({ length: holes }, (_, i) => margin + (i * (span - 2 * margin)) / (holes - 1));
  const changed = (i) => i === holes - 1 || (level > 2 && i % 3 === 1);
  const ordinals = Array.from({ length: holes }, (_, i) => i)
    .filter(changed)
    .map((i) => i + 1);
  const values = {
    length,
    width,
    holes,
    margin,
    extension,
    boreNoun: ordinals.length > 1 ? 'Bohrungen' : 'Bohrung',
    ordinals: ordinals.join(', '),
  };
  return {
    level,
    repeat,
    holes,
    width,
    margin,
    length,
    extension,
    axes,
    changed,
    prompts: settings.prompts.map((template) =>
      template.replace(/\{(\w+)\}/g, (_, key) => {
        if (!Object.hasOwn(values, key)) throw Error('Unbekanntes Aufgabenfeld: ' + key);
        return values[key];
      }),
    ),
  };
}
