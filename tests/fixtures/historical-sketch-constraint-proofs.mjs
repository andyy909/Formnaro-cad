// The 17 authored cases retained from the P4 acceptance baseline. Later UI
// proofs may extend this list but must not silently replace these labels.
export const HISTORICAL_SKETCH_CONSTRAINT_PROOFS=Object.freeze([
 'Normal sketch opens V1 without changing the model or initializing a condition worker',
 'real rectangle drawing produces a V2 draft and retains all original model bytes',
 'explicit upgrade creates V3 with stable endpoint joins and no geometry job',
 'horizontal and vertical UI relations solve in the actual small worker with no CAD preview',
 'fixed start and dimensional lengths remain persistent independent draft data',
 'pointer moves change only a light 2D draft and do not start a solver or native job',
 'release solves once and returns the constrained rectangle without constructing 3D geometry',
 'contradictory UI relation restores the entire last valid draft and identifies conflicts',
 'explicit dimensional formula remains symbolic while its geometry is solved',
 'changing an upstream named value solves without replacing the saved measure expression',
 'only explicit 3D preview constructs the native solid and Apply stays revision bound',
 'Apply creates one Undo and preserves every persistent relation and expression',
 'saved V3 reopens with matching geometry and unchanged symbolic relations',
 'Easy CAD uses the same persistent sketch conditions editor without extra native work',
 'compact Easy controls and condition feedback remain reachable and Cancel is byte exact',
 'same local AI sketch preview solves V3 with no partial commit and rejects contradictions',
 'Mesh uses V3 constraints, correct off-center placement and preserved source without type conversion'
]);
