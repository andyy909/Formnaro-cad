export function cadFinishAmountOperation(node, stepId, amount) {
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 1000)
    throw Error('Radius oder Fasenmaß von 0,01–1000 mm wählen.');
  const steps = node?.kind === 'cad' ? node.finish?.steps : undefined,
    index = steps?.findIndex((step) => step.id === stepId) ?? -1;
  if (index === -1) throw Error('Gespeicherter Kantenschritt fehlt.');
  const edited = structuredClone(steps);
  edited[index].amount = amount;
  return { kind: 'editFinish', target: node.id, steps: edited };
}
