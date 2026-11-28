const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

exports.verifyB03 = async ({ directory, proof, run, click, field, until, shot }) => {
  const file = process.env.FORMNARO_VERIFY_B03_FIXTURE;
  if (!file) throw Error('Set FORMNARO_VERIFY_B03_FIXTURE to the four-placement OCAD fixture.');
  const raw = fs.readFileSync(file, 'utf8');
  const initial = JSON.parse(raw);
  const primaryDefinition = initial.componentDefinitions.definitions.find((definition) =>
    initial.nodes.filter((node) => node.definitionId === definition.id).length === 4,
  );
  assert.ok(primaryDefinition, 'Fixture needs a shared definition with four placements');
  const pins = initial.nodes.filter((node) => node.definitionId === primaryDefinition.id);
  const foreign = initial.nodes.find((node) => !node.definitionId && node.name === pins[0].name);
  assert.ok(foreign);
  const baseLength = pins[0].recipe.size[2];
  const targetLength = baseLength + 4;
  const newLength = targetLength + 2;
  const readProject = async () => JSON.parse(await run('return a.serialize();'));
  const openFixture = (data = raw) => run(`await a.controller.open(JSON.parse(${JSON.stringify(data)})); await a.settled(); a.workbenchUI.setMode('normal');`);
  const openDefinition = async (id) => {
    await run(`a.select([{rootId: ${JSON.stringify(id)}, path:[]}]);`);
    await click('#part-properties-open');
    await field('#part-mode', 'definition');
    const selected = await run("return document.querySelector('#part-target').value;");
    assert.equal(selected, id);
  };
  const measureLengths = (project) => pins.map(({ id }) => {
    const node = project.nodes.find((part) => part.id === id);
    const height = node.stats.bounds.max[2] - node.stats.bounds.min[2];
    assert.ok(Math.abs(height - node.recipe.size[2]) < 1e-6, 'native height disagrees with recipe');
    return [node.recipe.size[2], node.definitionId, node.transform];
  });
  const close = () => click('#part-close');
  const waitPreview = () => until("!a.partPropertiesUI.state().busy && a.partPropertiesUI.state().hasPreview && !document.querySelector('#part-apply').disabled");
  const waitApplied = () => until("!a.partPropertiesUI.state().hasPreview && document.querySelector('#part-status').textContent.includes('übernommen')");
  let original, afterShared, afterDetach, finalProject;
  await proof('B03-01 Normal desktop changes all four native lengths in a single Apply', async () => {
    await openFixture();
    original = await readProject();
    await openDefinition(pins[0].id);
    const placementOptions = await run("return [...document.querySelector('#part-target').options].map(option=>[option.value,option.text]);");
    const pinLabels = pins.map(({ id }) => placementOptions.find(([value]) => value === id)[1]);
    assert.equal(new Set(pinLabels).size, 4, 'same-name placement labels must be distinguishable');
    await field('#part-definition-length', targetLength, 'input');
    await click('#part-definition-length-preview');
    await waitPreview();
    assert.deepEqual(await readProject(), original, 'native preview changed confirmed parts');
    await shot('B03-Gemeinsame-Laenge');
    await click('#part-apply');
    await waitApplied();
    afterShared = await readProject();
    assert.deepEqual(measureLengths(afterShared), pins.map((node) => [targetLength, primaryDefinition.id, node.transform]));
    assert.deepEqual(afterShared.nodes.find((node) => node.id === foreign.id), original.nodes.find((node) => node.id === foreign.id));
  });
  await proof('B03-02 exact desktop placement detachment separates the fourth pin from later definition edits', async () => {
    await field('#part-target', pins[3].id);
    await field('#part-definition-detached-number', 'Q01-BOLZEN-GELOEST', 'input');
    await click('#part-definition-detach-preview');
    await waitPreview();
    assert.deepEqual(await readProject(), afterShared);
    await click('#part-apply');
    await waitApplied();
    afterDetach = await readProject();
    const detached = afterDetach.nodes.find((node) => node.id === pins[3].id);
    assert.notEqual(detached.definitionId, primaryDefinition.id);
    assert.equal(afterDetach.componentDefinitions.definitions.find((definition) => definition.id === detached.definitionId).partNumber, 'Q01-BOLZEN-GELOEST');
    await field('#part-target', pins[0].id);
    await field('#part-definition-length', newLength, 'input');
    await click('#part-definition-length-preview');
    await waitPreview();
    await click('#part-apply');
    await waitApplied();
    finalProject = await readProject();
    assert.deepEqual(measureLengths(finalProject), pins.map((node, index) =>
      [index === 3 ? targetLength : newLength, index === 3 ? detached.definitionId : primaryDefinition.id, node.transform]));
    assert.deepEqual(finalProject.nodes.find((node) => node.id === pins[3].id), detached);
    assert.deepEqual(finalProject.nodes.find((node) => node.id === foreign.id), original.nodes.find((node) => node.id === foreign.id));
    await close();
  });
  await proof('B03-03 Undo returns the original assignment and physical reopen preserves three plus one', async () => {
    const saved = path.join(directory, 'B03-Geloeste-Verwendung.ocad');
    fs.writeFileSync(saved, await run('return a.serialize();'));
    await run('await a.actions.undo(); await a.settled();');
    assert.deepEqual(await readProject(), afterDetach);
    await run('await a.actions.undo(); await a.settled();');
    assert.deepEqual(await readProject(), afterShared);
    await run('await a.actions.redo(); await a.settled();');
    assert.deepEqual(await readProject(), afterDetach);
    await run('await a.actions.redo(); await a.settled();');
    assert.deepEqual(await readProject(), finalProject);
    await openFixture(fs.readFileSync(saved, 'utf8'));
    assert.deepEqual(await readProject(), finalProject);
  });
  await proof('B03-04 locked/suppressed members refuse a shared preview and a locked placement refuses detachment', async () => {
    for (const property of ['locked', 'suppressed']) {
      const candidate = structuredClone(original);
      candidate.nodes.find((node) => node.id === pins[2].id)[property] = true;
      await openFixture(JSON.stringify(candidate));
      const protectedState = await readProject();
      await openDefinition(pins[0].id);
      const shared = await run(`
        return {
          disabled: document.querySelector('#part-definition-length-preview').disabled,
          message: document.querySelector('#part-definition-length-note').textContent,
          pending: a.partPropertiesUI.state().hasPreview,
        };
      `);
      assert.equal(shared.disabled, true);
      assert.match(shared.message, property === 'locked' ? /gesperrt/ : /unterdrückt/);
      assert.equal(shared.pending, false);
      await close();
      assert.deepEqual(await readProject(), protectedState);
      if (property === 'locked') {
        await openDefinition(pins[2].id);
        assert.equal(await run("return document.querySelector('#part-definition-detach-preview').disabled;"), true);
        await close();
      }
    }
    await openFixture(JSON.stringify(finalProject));
  });
};
