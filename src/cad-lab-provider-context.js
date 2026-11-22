import { fittingSkill } from './cad-lab-fitting-plan.js';

const allowed = new Set([
  'create',
  'group',
  'transform',
  'update',
  'drill',
  'pattern',
  'cut',
  'union',
  'feature',
  'joint',
  'drawing',
  'parameter',
]);

const geometry = new Set([
  'create',
  'group',
  'transform',
  'update',
  'drill',
  'pattern',
  'cut',
  'union',
  'feature',
  'parameter',
]);
const scopes = { drawing: new Set(['drawing']), geometry, motion: new Set([...geometry, 'joint']) };

export function compactLabCadRequest(args, scope, fittingVariant) {
  const source = args.context;
  const definitions = source?.commandSchema?.properties?.commands?.items?.oneOf;
  if (!Array.isArray(definitions)) return args;
  const drawing = scope === 'drawing';
  const supported = scopes[scope] ?? allowed;
  const commands = definitions.filter(({ properties }) =>
    [properties?.op?.const, ...(properties?.op?.enum ?? [])].some((op) => supported.has(op)),
  );
  if (!commands.length) return args;
  const keys = drawing
    ? ['application', 'units']
    : [
        'application',
        'units',
        'coordinateContract',
        'designFreedom',
        'featureScope',
        'modellingPolicy',
        'agentWorkflow',
        'taskEvidence',
      ];
  const context = Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
  const properties = source.commandSchema.properties;
  return {
    ...args,
    context: {
      ...context,
      commandSchema: {
        type: 'object',
        required: ['revision', 'commands'],
        properties: {
          revision: properties.revision,
          commands: { type: 'array', items: { oneOf: commands } },
          ...(drawing ? {} : { checks: properties.checks }),
        },
      },
      ...(drawing
        ? {
            drawingWorkflow:
              'Use drawing-only command batches. Use put with a complete sheet definition, omitting projection data, then update to compute native views. Drawing positions are paper millimetres. Use dimension on a current sheet for native dimensions. Front is X/Z, side is Y/Z, top is X/Y. A section axis of 1 cuts at the given Y offset.',
          }
        : {
            analysisContract: {
              format:
                'For a required read-only measurement, return {revision,analysis:[{id,engine,kind,options}]}. Omit commands and checks. A local result follows in the next request.',
              sourceBounds: {
                id: 'bounds', engine: 'cad', kind: 'bounds',
                options: { targets: [{ rootId: '<root id>', path: ['<source id>'] }] },
              },
              ...(fittingVariant === 'skill' ? {} : {
                useSourceBounds: 'If fit depends on existing internal faces, get the dimensions before modeling. Read source IDs from the root object children array. Put all relevant source paths in one options.targets list using the actual IDs. The result byId gives individual min and max in world coordinates. Derive gaps and heights from those individual bounds. Use this query for source bounds.',
              }),
            },
            ...(fittingVariant === 'skill' ? { activeSkill: fittingSkill } : {}),
            geometryPlacement:
              'To add a source inside an existing group, create with parent and space:"local". Convert world points through the inverse parent worldMatrix if needed. For a slanted cylindrical cut entering a flat face, extend the cutter outside far enough for the full entry cap to clear the face. Extend only the entry end and preserve the specified shoulder or blind bottom. The required axial overrun is cutter radius times tan(the angle to the face normal); add clearance beyond that.',
            resultChecks:
              'Native local validation checks dimensions, volumes, opening clearance, motion and drawings independently. Command syntax and revision are checked before any local apply.',
            benchmarkUnits:
              'mm and degrees. create.pos is the centre, rot is XYZ values with ZYX composition. Array dimensions are in the local axes. Cylinders point along local +Z. Negative solids cut material when grouped; create shapes before a group. Native joints and drawings refer to complete root objects. Only use operations shown in this task contract.',
          }),
    },
  };
}
