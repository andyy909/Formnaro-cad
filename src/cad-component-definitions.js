// Component definitions data and validation for Formnaro assemblies
// Enables reusable internal component definitions with stable identities across placements.

import { cloneCadSources } from './cad-source-clone.js';
import { validateAffineMatrix, cadProjectSnapshot } from './cad-project.js';
import { flags } from './organization.js';

export const COMPONENT_DEFINITIONS_VERSION = 1;
export const COMPONENT_DEFINITION_LIMITS = Object.freeze({
  maxDefinitions: 1000,
  maxIdLength: 200,
  maxNameLength: 200,
  maxPartNumberLength: 120,
  maxDescriptionLength: 4000,
});

const fail = (message) => {
  throw Object.assign(new Error(message), { code: 'INVALID_COMPONENT_DEFINITION' });
};

const isPlainObject = (v) =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)));

/** Validate a single component definition. */
export function validateComponentDefinition(value) {
  if (!isPlainObject(value)) fail('Ungültige Bauteildefinition.');
  const allowed = ['id', 'name', 'sourceNodeId', 'partNumber', 'description', 'metadata'];
  for (const k of Object.keys(value)) {
    if (!allowed.includes(k)) fail(`Unbekanntes Definitionsfeld ${k}.`);
  }
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > COMPONENT_DEFINITION_LIMITS.maxIdLength) {
    fail('Ungültige Definitionskennung.');
  }
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > COMPONENT_DEFINITION_LIMITS.maxNameLength) {
    fail('Definitionsname mit 1–200 Zeichen erforderlich.');
  }

  const out = {
    id: value.id.trim(),
    name: value.name.trim(),
  };

  if (value.sourceNodeId !== undefined) {
    if (value.sourceNodeId !== null && (typeof value.sourceNodeId !== 'string' || !value.sourceNodeId.trim() || value.sourceNodeId.length > COMPONENT_DEFINITION_LIMITS.maxIdLength)) {
      fail('Ungültige Quellkörperkennung in Definition.');
    }
    out.sourceNodeId = value.sourceNodeId ? value.sourceNodeId.trim() : null;
  }

  if (value.partNumber !== undefined) {
    if (
      typeof value.partNumber !== 'string' ||
      !value.partNumber.trim() ||
      value.partNumber.length > COMPONENT_DEFINITION_LIMITS.maxPartNumberLength ||
      /[\r\n]/.test(value.partNumber)
    ) {
      fail('Teilenummer mit 1–120 Zeichen in einer Zeile eingeben oder offen lassen.');
    }
    out.partNumber = value.partNumber.trim();
  }

  if (value.description !== undefined) {
    if (typeof value.description !== 'string' || value.description.length > COMPONENT_DEFINITION_LIMITS.maxDescriptionLength) {
      fail('Ungültige Definitionsbeschreibung.');
    }
    out.description = value.description;
  }

  if (value.metadata !== undefined) {
    if (!isPlainObject(value.metadata)) fail('Ungültige Definitions-Metadaten.');
    out.metadata = structuredClone(value.metadata);
  }

  return out;
}

/** Validate the project-level component definitions directory. */
export function validateComponentDefinitions(value, projectNodes = null) {
  if (!isPlainObject(value)) fail('Ungültiges Definitionsverzeichnis.');
  const allowed = ['version', 'definitions'];
  for (const k of Object.keys(value)) {
    if (!allowed.includes(k)) fail(`Unbekanntes Feld ${k} in Definitionsverzeichnis.`);
  }
  if (value.version !== COMPONENT_DEFINITIONS_VERSION) {
    fail('Unbekannte Version des Definitionsverzeichnisses.');
  }
  if (!Array.isArray(value.definitions) || value.definitions.length > COMPONENT_DEFINITION_LIMITS.maxDefinitions) {
    fail('Ungültige Definitionsliste.');
  }

  const seenIds = new Set();
  const definitions = value.definitions.map((def) => {
    const valid = validateComponentDefinition(def);
    if (seenIds.has(valid.id)) fail(`Doppelte Definitionskennung ${valid.id}.`);
    seenIds.add(valid.id);
    return valid;
  });

  if (Array.isArray(projectNodes)) {
    const checkNode = (node) => {
      if (node?.definitionId !== undefined && node?.definitionId !== null) {
        if (!seenIds.has(node.definitionId)) {
          fail(`Referenzierte Definition ${node.definitionId} ist im Projekt nicht definiert.`);
        }
      }
      if (Array.isArray(node?.children)) {
        for (const child of node.children) checkNode(child);
      }
    };
    for (const n of projectNodes) checkNode(n);
  }

  return {
    version: COMPONENT_DEFINITIONS_VERSION,
    definitions,
  };
}

/** Find a component definition by its stable ID. */
export function findComponentDefinition(project, definitionId) {
  if (!project || !definitionId) return null;
  const defs = project.componentDefinitions?.definitions;
  if (!Array.isArray(defs)) return null;
  return defs.find((d) => d.id === definitionId) ?? null;
}

/** Find all placed instances referencing a component definition. */
export function findComponentInstances(project, definitionId) {
  if (!project || !definitionId) return [];
  const instances = [];
  const collect = (node) => {
    if (node?.definitionId === definitionId) {
      instances.push(node);
    }
    if (Array.isArray(node?.children)) {
      for (const child of node.children) collect(child);
    }
  };
  for (const n of project.nodes ?? []) collect(n);
  return instances;
}

/** Compute the component identity of a node. */
export function getComponentIdentity(project, node) {
  if (!node) return null;
  if (node.definitionId) {
    const def = findComponentDefinition(project, node.definitionId);
    return {
      kind: 'definition',
      definitionId: node.definitionId,
      name: def?.name ?? node.name,
      partNumber: def?.partNumber ?? node.metadata?.partProperties?.partNumber ?? null,
      definition: def ? structuredClone(def) : null,
    };
  }
  return {
    kind: 'standalone',
    nodeId: node.id,
    name: node.name,
    partNumber: node.metadata?.partProperties?.partNumber ?? null,
    definition: null,
  };
}

/** Check if two nodes represent placements of the same component definition. */
export function isSameComponent(project, nodeA, nodeB) {
  if (!nodeA || !nodeB) return false;
  if (nodeA.definitionId && nodeB.definitionId) {
    if (nodeA.definitionId !== nodeB.definitionId) return false;
    // Verify definition exists in project if project is provided
    if (project?.componentDefinitions?.definitions) {
      return Boolean(findComponentDefinition(project, nodeA.definitionId));
    }
    return true;
  }
  // Standalone parts or parts without definition are distinct identities
  return false;
}

/** Add or update a definition in project.componentDefinitions. */
export function registerComponentDefinition(project, definitionInput) {
  const valid = validateComponentDefinition(definitionInput);
  const existing = project.componentDefinitions?.definitions ?? [];
  const idx = existing.findIndex((d) => d.id === valid.id);
  const updated = idx >= 0 ? existing.map((d, i) => (i === idx ? valid : d)) : [...existing, valid];
  return {
    ...project,
    componentDefinitions: {
      version: COMPONENT_DEFINITIONS_VERSION,
      definitions: updated,
    },
  };
}

/** Remove a definition from project.componentDefinitions and optionally detach instances. */
export function removeComponentDefinition(project, definitionId, { detachInstances = true } = {}) {
  const existing = project.componentDefinitions?.definitions ?? [];
  const updated = existing.filter((d) => d.id !== definitionId);
  const clean = (node) => {
    const copy = { ...node };
    if (detachInstances && copy.definitionId === definitionId) {
      delete copy.definitionId;
    }
    if (Array.isArray(copy.children)) {
      copy.children = copy.children.map(clean);
    }
    return copy;
  };
  const updatedNodes = (project.nodes ?? []).map(clean);
  const out = {
    ...project,
    nodes: updatedNodes,
  };
  if (updated.length > 0) {
    out.componentDefinitions = { version: COMPONENT_DEFINITIONS_VERSION, definitions: updated };
  } else {
    delete out.componentDefinitions;
  }
  return out;
}

/** Attach a definition ID to a placement node. */
export function attachComponentDefinition(node, definitionId) {
  if (!node || typeof node !== 'object') fail('Ungültiger Bauteilknoten.');
  if (typeof definitionId !== 'string' || !definitionId.trim() || definitionId.length > COMPONENT_DEFINITION_LIMITS.maxIdLength) {
    fail('Ungültige Definitionskennung.');
  }
  node.definitionId = definitionId.trim();
  return node;
}

/** Detach a definition ID from a placement node. */
export function detachComponentDefinition(node) {
  if (!node || typeof node !== 'object') fail('Ungültiger Bauteilknoten.');
  delete node.definitionId;
  return node;
}

/** Check if project contains any component definitions or references. */
export function hasComponentDefinitions(project) {
  if (!project) return false;
  if (project.componentDefinitions?.definitions?.length > 0) return true;
  const checkNode = (n) => {
    if (n?.definitionId !== undefined && n?.definitionId !== null) return true;
    if (n?.children?.some(checkNode)) return true;
    if (n?.meshSource?.sources?.some(checkNode)) return true;
    if (n?.meshSource?.node && checkNode(n.meshSource.node)) return true;
    return false;
  };
  return Boolean(project.nodes?.some(checkNode));
}

/**
 * Place a new instance of an existing component definition in the project.
 *
 * @param {object} project - Validated CAD project snapshot or project data
 * @param {string} definitionId - ID of the definition to instantiate
 * @param {object} [options] - Placement options
 * @param {string} [options.id] - Optional custom node ID (must be unique in project)
 * @param {string} [options.name] - Optional custom name for the placed instance
 * @param {Array<number>} [options.transform] - 16-element affine transform matrix
 * @param {object} [options.templateNode] - Optional node to clone geometry from
 * @param {function} [options.makeId] - Optional ID generator
 * @returns {{ project: object, instance: object }} Updated project snapshot and new instance node
 */
export function placeComponentInstance(project, definitionId, options = {}) {
  if (!project || typeof project !== 'object') fail('Projekt erforderlich.');
  if (typeof definitionId !== 'string' || !definitionId.trim()) fail('Definitionskennung erforderlich.');
  const trimmedDefId = definitionId.trim();
  const definition = findComponentDefinition(project, trimmedDefId);
  if (!definition) {
    fail(`Referenzierte Definition ${trimmedDefId} ist im Projekt nicht definiert.`);
  }

  // Determine template node to copy geometry from
  let sourceNode = options.templateNode ?? null;
  if (!sourceNode && definition.sourceNodeId) {
    const findNodeRecursive = (nodes) => {
      for (const n of nodes ?? []) {
        if (n.id === definition.sourceNodeId) return n;
        if (Array.isArray(n.children)) {
          const found = findNodeRecursive(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    sourceNode = findNodeRecursive(project.nodes);
  }
  if (!sourceNode) {
    const existingInstances = findComponentInstances(project, trimmedDefId);
    if (existingInstances.length > 0) {
      sourceNode = existingInstances[0];
    }
  }

  if (!sourceNode) {
    fail(`Kein Quellkörper für Definition ${trimmedDefId} im Projekt vorhanden.`);
  }

  // Collect all existing node IDs in the project to prevent collisions
  const existingIds = new Set();
  const collectIds = (n) => {
    existingIds.add(n.id);
    if (Array.isArray(n.children)) for (const c of n.children) collectIds(c);
  };
  for (const n of project.nodes ?? []) collectIds(n);

  let newId = options.id;
  if (!newId) {
    if (typeof options.makeId === 'function') {
      newId = options.makeId();
    } else {
      newId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
  }
  if (existingIds.has(newId)) {
    fail(`Knoten-ID ${newId} existiert bereits im Projekt.`);
  }

  const mapping = new Map();
  const copy = cloneCadSources(sourceNode, { mapping });
  copy.id = newId;
  copy.definitionId = trimmedDefId;

  if (options.name) {
    copy.name = options.name;
  } else if (!copy.name) {
    copy.name = definition.name;
  }

  if (options.transform) {
    copy.transform = validateAffineMatrix(options.transform);
  }

  // Synchronize partNumber if definition defines one
  if (definition.partNumber) {
    const existingProps = copy.metadata?.partProperties ?? { version: 1 };
    copy.metadata = {
      ...copy.metadata,
      partProperties: {
        ...existingProps,
        version: 1,
        partNumber: definition.partNumber,
      },
    };
  }

  const updatedNodes = [...(project.nodes ?? []), copy];
  const updatedProject = cadProjectSnapshot({
    ...project,
    nodes: updatedNodes,
  });

  return {
    project: updatedProject,
    instance: copy,
  };
}

/**
 * Move a component placement by updating its transform matrix.
 * Preserves the exact state and bytes of the other placements and definitions.
 *
 * @param {object} project - Validated CAD project snapshot
 * @param {string} instanceId - Node ID of the instance to move
 * @param {Array<number>} transform - 16-element affine transform matrix
 * @returns {object} Updated project snapshot
 */
export function moveComponentInstance(project, instanceId, transform) {
  if (!project || typeof project !== 'object') fail('Projekt erforderlich.');
  if (typeof instanceId !== 'string' || !instanceId.trim()) fail('Instanzkennung erforderlich.');
  const validMatrix = validateAffineMatrix(transform);

  let found = false;
  const updateNode = (n) => {
    if (n.id === instanceId) {
      found = true;
      return { ...n, transform: validMatrix };
    }
    if (Array.isArray(n.children)) {
      return { ...n, children: n.children.map(updateNode) };
    }
    return n;
  };

  const updatedNodes = (project.nodes ?? []).map(updateNode);
  if (!found) {
    fail(`Instanz ${instanceId} nicht im Projekt gefunden.`);
  }

  return cadProjectSnapshot({
    ...project,
    nodes: updatedNodes,
  });
}

/**
 * Remove a specific component placement from the project.
 * Leaves the other placements and the component definition untouched.
 *
 * @param {object} project - Validated CAD project snapshot
 * @param {string} instanceId - Node ID of the instance to remove
 * @returns {object} Updated project snapshot
 */
export function removeComponentInstance(project, instanceId) {
  if (!project || typeof project !== 'object') fail('Projekt erforderlich.');
  if (typeof instanceId !== 'string' || !instanceId.trim()) fail('Instanzkennung erforderlich.');

  let found = false;
  const filterNode = (n) => {
    if (n.id === instanceId) {
      found = true;
      return false;
    }
    if (Array.isArray(n.children)) {
      n.children = n.children.filter(filterNode);
    }
    return true;
  };

  const updatedNodes = (project.nodes ?? []).filter(filterNode);
  if (!found) {
    fail(`Instanz ${instanceId} nicht im Projekt gefunden.`);
  }

  return cadProjectSnapshot({
    ...project,
    nodes: updatedNodes,
  });
}

/**
 * Create a component definition from an existing node, attach definitionId to the node,
 * and register the definition in project.componentDefinitions.
 *
 * @param {object} project - CAD project snapshot
 * @param {string|object} nodeOrId - Node or ID of the node to turn into a definition
 * @param {object} [definitionData] - Optional overrides for definition fields
 * @returns {{ project: object, definition: object, node: object }} Updated project snapshot, definition, and node
 */
export function createComponentDefinitionFromNode(project, nodeOrId, definitionData = {}) {
  if (!project || typeof project !== 'object') fail('Projekt erforderlich.');
  const nodeId = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId?.id;
  const targetNode = (project.nodes ?? []).find((n) => n.id === nodeId);
  if (!targetNode) fail(`Knoten ${nodeId} nicht gefunden.`);

  const defId = definitionData.id ?? `def-${targetNode.id}`;
  const defName = definitionData.name ?? targetNode.name;
  const partNumber = definitionData.partNumber ?? targetNode.metadata?.partProperties?.partNumber;

  const def = validateComponentDefinition({
    id: defId,
    name: defName,
    sourceNodeId: targetNode.id,
    ...(partNumber !== undefined ? { partNumber } : {}),
    ...(definitionData.description ? { description: definitionData.description } : {}),
    ...(definitionData.metadata ? { metadata: definitionData.metadata } : {}),
  });

  const updatedNode = { ...targetNode, definitionId: def.id };
  if (def.partNumber) {
    const existingProps = updatedNode.metadata?.partProperties ?? { version: 1 };
    updatedNode.metadata = {
      ...updatedNode.metadata,
      partProperties: {
        ...existingProps,
        version: 1,
        partNumber: def.partNumber,
      },
    };
  }
  const updatedNodes = (project.nodes ?? []).map((n) => (n.id === nodeId ? updatedNode : n));

  const existingDefs = project.componentDefinitions?.definitions ?? [];
  const idx = existingDefs.findIndex((d) => d.id === def.id);
  const updatedDefs = idx >= 0 ? existingDefs.map((d, i) => (i === idx ? def : d)) : [...existingDefs, def];

  return {
    project: cadProjectSnapshot({
      ...project,
      nodes: updatedNodes,
      componentDefinitions: {
        version: COMPONENT_DEFINITIONS_VERSION,
        definitions: updatedDefs,
      },
    }),
    definition: def,
    node: updatedNode,
  };
}

/**
 * Check whether a node or its containers (layer/folder/hierarchy) are locked.
 */
export function isNodeLocked(node, project) {
  if (!node) return false;
  if (node.locked) return true;
  const org = project?.organization ?? (Array.isArray(project?.layers) ? project : null);
  if (org && Array.isArray(org.layers) && Array.isArray(org.folders)) {
    try {
      if (flags(node, org).locked) return true;
    } catch {
      // fallback
    }
  }
  if (org?.layers && node.layerId) {
    const layer = org.layers.find((l) => l.id === node.layerId);
    if (layer?.locked) return true;
  }
  if (org?.folders && node.folderId) {
    let fid = node.folderId;
    const seen = new Set();
    while (fid && !seen.has(fid)) {
      seen.add(fid);
      const f = org.folders.find((x) => x.id === fid);
      if (f?.locked) return true;
      fid = f?.parentId;
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (isNodeLocked(child, project)) return true;
    }
  }
  return false;
}

/**
 * Validate that a component operation on a definition and its instances is safe,
 * ensuring no locks or broken dependencies prevent atomic execution.
 */
export function assertValidComponentOperation(rawProject, definitionId, { targetInstanceId = null } = {}) {
  const project = rawProject?.project ?? rawProject;
  if (!project || typeof project !== 'object') fail('Projekt erforderlich.');
  if (typeof definitionId !== 'string' || !definitionId.trim()) fail('Definitionskennung erforderlich.');
  const trimmedDefId = definitionId.trim();

  const definition = findComponentDefinition(project, trimmedDefId);
  if (!definition) {
    fail(`Referenzierte Definition ${trimmedDefId} ist im Projekt nicht definiert.`);
  }

  if (definition.locked || definition.metadata?.locked) {
    fail(`Definition ${trimmedDefId} ist gesperrt.`);
  }

  // Validate directory consistency against nodes
  if (project.componentDefinitions) {
    validateComponentDefinitions(project.componentDefinitions, project.nodes);
  }

  const instances = findComponentInstances(project, trimmedDefId);

  if (targetInstanceId) {
    const target =
      instances.find((i) => i.id === targetInstanceId) ??
      (project.nodes ?? []).find((n) => n.id === targetInstanceId);
    if (!target) {
      fail(`Instanz ${targetInstanceId} nicht im Projekt gefunden.`);
    }
    if (target.definitionId !== trimmedDefId) {
      fail(`Instanz ${targetInstanceId} gehört nicht zur Definition ${trimmedDefId}.`);
    }
    if (isNodeLocked(target, project)) {
      fail(`Platzierung ${targetInstanceId} ist gesperrt und kann nicht geändert oder gelöst werden.`);
    }
    if (target.unresolved || target.brokenReference) {
      fail(`Platzierung ${targetInstanceId} besitzt eine unauflösbare Abhängigkeit.`);
    }
  } else {
    for (const inst of instances) {
      if (isNodeLocked(inst, project)) {
        fail(`Platzierung ${inst.id} der Definition ${trimmedDefId} ist gesperrt.`);
      }
      if (inst.unresolved || inst.brokenReference) {
        fail(`Platzierung ${inst.id} besitzt eine unauflösbare Abhängigkeit.`);
      }
    }
  }

  return { definition, instances };
}

function visibleComponentPlacement(project, instanceId) {
  const node = project.nodes.find((candidate) => candidate.id === instanceId);
  if (!node || !((node.kind === 'cad' && node.solid) || (node.kind === 'mesh' && node.meshRole !== 'hole')))
    fail('Eine vollständige Bauteilplatzierung wählen.');
  if (node.suppressed) fail('Eine Platzierung der Definition ist unterdrückt.');
  if (flags(node, project).hidden) fail('Eine Platzierung der Definition ist ausgeblendet.');
  return node;
}

export function cadComponentPlacement(project, instanceId) {
  const node = visibleComponentPlacement(project, instanceId);
  if (!node.definitionId) fail('Das gewählte Teil hat keine gemeinsame Bauteildefinition.');
  const { definition, instances } = assertValidComponentOperation(project, node.definitionId, {
    targetInstanceId: instanceId,
  });
  return { node, definition, instances };
}

export function cadComponentDefinitionLength(project, instanceId) {
  const { node, definition, instances } = cadComponentPlacement(project, instanceId);
  assertValidComponentOperation(project, definition.id);
  const length = node.recipe?.size?.[2],
    type = node.recipe?.type;
  for (const instance of instances) {
    const part = visibleComponentPlacement(project, instance.id);
    if (
      part.source !== 'native' ||
      !['cylinder', 'tube'].includes(type) ||
      part.recipe?.type !== type ||
      part.children?.length ||
      part.finish || part.drill || part.extraction || part.modeling
    )
      fail('Gemeinsame Länge ist nur für einfache native Zylinder und Rohre verfügbar.');
    if (part.recipe.size[2] !== length)
      fail('Die Platzierungen haben unterschiedliche Nennlängen.');
  }
  return { definition, instances, length };
}

export function changeCadComponentDefinitionLength(project, instanceId, length) {
  const scope = cadComponentDefinitionLength(project, instanceId);
  if (!Number.isFinite(length) || length < 0.01 || length > 10000)
    fail('Länge zwischen 0,01 und 10 000 mm eingeben.');
  if (length === scope.length) fail('Eine andere Länge eingeben.');
  const originals = new Map(scope.instances.map((instance) => [instance.id, instance]));
  return updateComponentDefinition(project, scope.definition.id, {
    nodePatch: ({ id }) => {
      const original = originals.get(id);
      return { ...original, recipe: { ...original.recipe, size: [...original.recipe.size.slice(0, 2), length] } };
    },
  });
}

/**
 * Atomically update a component definition and synchronize all active placements.
 * Each placement maintains its own node.id and independent transform matrix.
 * Unrelated and foreign parts with the same name remain untouched.
 *
 * @param {object} project - Validated CAD project snapshot
 * @param {string} definitionId - ID of the component definition to update
 * @param {object|function} updaterOrPatch - Patch object or updater function
 * @param {object} [options] - Options (e.g. syncNodeNames)
 * @returns {object} Updated project snapshot (with .project, .definition, .instances)
 */
export function updateComponentDefinition(rawProject, definitionId, updaterOrPatch, options = {}) {
  const project = rawProject?.project ?? rawProject;
  const { definition, instances } = assertValidComponentOperation(project, definitionId);
  const trimmedDefId = definitionId.trim();

  if (!updaterOrPatch || (typeof updaterOrPatch !== 'function' && !isPlainObject(updaterOrPatch))) {
    fail('Ungültige Aktualisierungsangaben für Bauteildefinition.');
  }

  let defPatch = {};
  let nodePatch = {};
  let customFn = null;

  if (typeof updaterOrPatch === 'function') {
    customFn = updaterOrPatch;
  } else {
    const allowedDef = ['id', 'name', 'sourceNodeId', 'partNumber', 'description', 'metadata'];
    for (const [k, v] of Object.entries(updaterOrPatch)) {
      if (allowedDef.includes(k) && k !== 'id') {
        defPatch[k] = v;
      }
    }
    if (updaterOrPatch.definition && isPlainObject(updaterOrPatch.definition)) {
      Object.assign(defPatch, updaterOrPatch.definition);
    }
    if (updaterOrPatch.recipe !== undefined) nodePatch.recipe = updaterOrPatch.recipe;
    if (updaterOrPatch.brep !== undefined) nodePatch.brep = updaterOrPatch.brep;
    if (updaterOrPatch.stats !== undefined) nodePatch.stats = updaterOrPatch.stats;
    if (updaterOrPatch.solid !== undefined) nodePatch.solid = updaterOrPatch.solid;
    if (updaterOrPatch.nodePatch !== undefined) {
      if (typeof updaterOrPatch.nodePatch === 'function') {
        nodePatch.customNodePatch = updaterOrPatch.nodePatch;
      } else if (isPlainObject(updaterOrPatch.nodePatch)) {
        Object.assign(nodePatch, updaterOrPatch.nodePatch);
      }
    }
  }

  let updatedDef = { ...definition, ...defPatch };

  if (customFn) {
    const fnResult = customFn(definition, instances, project);
    if (fnResult && isPlainObject(fnResult)) {
      if (fnResult.definition) updatedDef = { ...updatedDef, ...fnResult.definition };
      if (fnResult.nodePatch) {
        if (typeof fnResult.nodePatch === 'function') {
          nodePatch.customNodePatch = fnResult.nodePatch;
        } else if (isPlainObject(fnResult.nodePatch)) {
          Object.assign(nodePatch, fnResult.nodePatch);
        }
      }
      if (fnResult.recipe !== undefined) nodePatch.recipe = fnResult.recipe;
      if (fnResult.brep !== undefined) nodePatch.brep = fnResult.brep;
      if (fnResult.stats !== undefined) nodePatch.stats = fnResult.stats;
      if (fnResult.partNumber !== undefined) updatedDef.partNumber = fnResult.partNumber;
      if (fnResult.name !== undefined) updatedDef.name = fnResult.name;
    }
  }

  updatedDef = validateComponentDefinition(updatedDef);

  const updateNode = (n) => {
    if (n.definitionId === trimmedDefId) {
      let copy = { ...n };
      if (nodePatch.recipe !== undefined) {
        copy.recipe = structuredClone(nodePatch.recipe);
      }
      if (nodePatch.brep !== undefined) {
        copy.brep = structuredClone(nodePatch.brep);
      }
      if (nodePatch.stats !== undefined) {
        copy.stats = structuredClone(nodePatch.stats);
      }
      if (nodePatch.solid !== undefined) {
        copy.solid = nodePatch.solid;
      }
      if (updatedDef.name && (copy.name === definition.name || options.syncNodeNames)) {
        copy.name = updatedDef.name;
      }
      if (updatedDef.partNumber !== undefined) {
        const existingProps = copy.metadata?.partProperties ?? { version: 1 };
        copy.metadata = {
          ...copy.metadata,
          partProperties: {
            ...existingProps,
            version: 1,
            partNumber: updatedDef.partNumber,
          },
        };
      }
      if (nodePatch.customNodePatch) {
        copy = nodePatch.customNodePatch(copy);
      }
      return copy;
    }
    if (Array.isArray(n.children)) {
      return { ...n, children: n.children.map(updateNode) };
    }
    return n;
  };

  const updatedNodes = (project.nodes ?? []).map(updateNode);
  const existingDefs = project.componentDefinitions?.definitions ?? [];
  const updatedDefs = existingDefs.map((d) => (d.id === trimmedDefId ? updatedDef : d));

  const updatedProject = cadProjectSnapshot({
    ...project,
    nodes: updatedNodes,
    componentDefinitions: {
      version: COMPONENT_DEFINITIONS_VERSION,
      definitions: updatedDefs,
    },
  });

  const updatedInstances = findComponentInstances(updatedProject, trimmedDefId);

  return {
    project: updatedProject,
    definition: updatedDef,
    instances: updatedInstances,
  };
}

/**
 * Unlink a single component instance into its own independent definition (or standalone part).
 * The unlinked instance receives a new unique definitionId and decoupled data,
 * so subsequent changes to the original definition only affect the remaining linked instances.
 *
 * @param {object} rawProject - Validated CAD project snapshot or wrapper
 * @param {string} instanceId - Node ID of the instance to unlink
 * @param {object} [options] - Options (newDefinitionId, name, partNumber, standalone, etc.)
 * @returns {object} Updated project snapshot (with .project, .definition, .instance)
 */
export function unlinkComponentInstance(rawProject, instanceId, options = {}) {
  const project = rawProject?.project ?? rawProject;
  if (!project || typeof project !== 'object') fail('Projekt erforderlich.');
  if (typeof instanceId !== 'string' || !instanceId.trim()) fail('Instanzkennung erforderlich.');
  const trimmedInstanceId = instanceId.trim();

  let targetNode = null;
  const findNodeRecursive = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.id === trimmedInstanceId) return n;
      if (Array.isArray(n.children)) {
        const f = findNodeRecursive(n.children);
        if (f) return f;
      }
    }
    return null;
  };
  targetNode = findNodeRecursive(project.nodes);
  if (!targetNode) {
    fail(`Instanz ${trimmedInstanceId} nicht im Projekt gefunden.`);
  }
  if (!targetNode.definitionId) {
    fail(`Knoten ${trimmedInstanceId} ist keiner Bauteildefinition zugeordnet.`);
  }

  const { definition: oldDef } = assertValidComponentOperation(project, targetNode.definitionId, {
    targetInstanceId: trimmedInstanceId,
  });

  if (options.standalone) {
    const detachNode = (n) => {
      if (n.id === trimmedInstanceId) {
        const copy = { ...n };
        delete copy.definitionId;
        return copy;
      }
      if (Array.isArray(n.children)) {
        return { ...n, children: n.children.map(detachNode) };
      }
      return n;
    };
    const updatedNodes = (project.nodes ?? []).map(detachNode);
    const updatedProject = cadProjectSnapshot({
      ...project,
      nodes: updatedNodes,
    });
    const detachedInstance = findNodeRecursive(updatedProject.nodes);
    return {
      project: updatedProject,
      definition: null,
      instance: detachedInstance,
    };
  }

  const existingDefIds = new Set(project.componentDefinitions?.definitions?.map((d) => d.id) ?? []);
  let newDefId = options.newDefinitionId ?? options.id;
  if (!newDefId) {
    if (typeof options.makeId === 'function') {
      newDefId = options.makeId();
    } else {
      newDefId = `def-${targetNode.id}`;
      if (existingDefIds.has(newDefId)) {
        newDefId = `${oldDef.id}-unlinked-${targetNode.id}`;
      }
      let counter = 1;
      while (existingDefIds.has(newDefId)) {
        newDefId = `${oldDef.id}-unlinked-${targetNode.id}-${counter++}`;
      }
    }
  }
  if (existingDefIds.has(newDefId)) {
    fail(`Definitionskennung ${newDefId} existiert bereits im Projekt.`);
  }

  const newDefName = options.name ?? options.newDefinitionName ?? `${oldDef.name} (gelöst)`;
  const newPartNumber = options.partNumber !== undefined ? options.partNumber : oldDef.partNumber;

  const newDef = validateComponentDefinition({
    id: newDefId,
    name: newDefName,
    sourceNodeId: targetNode.id,
    ...(newPartNumber !== undefined ? { partNumber: newPartNumber } : {}),
    ...(options.description !== undefined
      ? { description: options.description }
      : oldDef.description
        ? { description: oldDef.description }
        : {}),
    ...(options.metadata !== undefined
      ? { metadata: options.metadata }
      : oldDef.metadata
        ? { metadata: structuredClone(oldDef.metadata) }
        : {}),
  });

  const updateNode = (n) => {
    if (n.id === trimmedInstanceId) {
      const copy = { ...n, definitionId: newDef.id };
      if (options.name || options.instanceName) {
        copy.name = options.instanceName ?? options.name;
      }
      if (newDef.partNumber) {
        const existingProps = copy.metadata?.partProperties ?? { version: 1 };
        copy.metadata = {
          ...copy.metadata,
          partProperties: {
            ...existingProps,
            version: 1,
            partNumber: newDef.partNumber,
          },
        };
      }
      return copy;
    }
    if (Array.isArray(n.children)) {
      return { ...n, children: n.children.map(updateNode) };
    }
    return n;
  };

  const updatedNodes = (project.nodes ?? []).map(updateNode);
  const updatedDefs = [...(project.componentDefinitions?.definitions ?? []), newDef];

  const updatedProject = cadProjectSnapshot({
    ...project,
    nodes: updatedNodes,
    componentDefinitions: {
      version: COMPONENT_DEFINITIONS_VERSION,
      definitions: updatedDefs,
    },
  });

  const updatedInstance = findNodeRecursive(updatedProject.nodes);

  return {
    project: updatedProject,
    definition: newDef,
    instance: updatedInstance,
  };
}
