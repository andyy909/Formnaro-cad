// Start- und Verify-Optionen aus process.argv und der FORMNARO-*-Umgebung.
// Bewusst ohne "verification" im Namen: das Modul wird auch im Produktpfad
// geladen und darf deshalb nicht vom portablen Paketfilter entfernt werden.
// Wird vor app.whenReady und vor dem Profil-/Fensteraufbau geladen; Fenster-,
// Profil- und IPC-Logik bleiben beim Aufrufer electron.cjs.
'use strict';
const path = require('path');
const fs = require('node:fs');

function parseStartupOptions(options = {}) {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const app = options.app ?? require('electron').app;
  const baseDirectory = options.baseDirectory ?? path.join(__dirname, '..');
  const hasIpc = options.hasIpc ?? (typeof process.send === 'function');

  const diagnosticHost=argv.includes('--formnaro-diagnostics')||require('../package.json').diagnosticEdition===true;
  const diagnosticHome=env.FORMNARO_DIAGNOSTIC_HOME?path.resolve(cwd, env.FORMNARO_DIAGNOSTIC_HOME):path.join(app.isPackaged?path.dirname(process.execPath):baseDirectory,'Testprofil');
  const diagnosticChild=argv.includes('--formnaro-diagnostic-child');
  const practiceChild=diagnosticChild||argv.includes('--formnaro-practice-child');
  if(practiceChild&&!hasIpc)process.exit(125);
  const practiceDirectory=practiceChild?(env.FORMNARO_PRACTICE_DIRECTORY||fs.mkdtempSync(path.join(app.getPath('temp'),'formnaro-practice-'))):null;

  const maintenanceVerifyArg=argv.find(a=>a.startsWith('--verify-maintenance='));
  const speechVerifyArg=argv.find(a=>a.startsWith('--verify-speech='));
  if(speechVerifyArg){app.commandLine.appendSwitch('use-fake-device-for-media-stream');app.commandLine.appendSwitch('use-file-for-fake-audio-capture',path.join(path.dirname(path.resolve(cwd, speechVerifyArg.slice('--verify-speech='.length))),'fixture.wav'));}
  const allFunctionsVerifyArg=argv.find(a=>a.startsWith('--verify-all-functions='));
  const allFunctionsPhase=argv.find(a=>a.startsWith('--verify-all-phase='))?.slice('--verify-all-phase='.length)??'interactions';
  const aiResultChecksVerifyArg=argv.find(a=>a.startsWith('--verify-ai-result-checks='));
  const easyCompleteVerifyArg=argv.find(a=>a.startsWith('--verify-easy-complete='));
  const easyAutoRepairVerifyArg=argv.find(a=>a.startsWith('--verify-easy-auto-repair='));
  const easyDomainVerifyArg=argv.find(a=>a.startsWith('--verify-easy-domain='));
  const rotationVerifyArg=argv.find(a=>a.startsWith('--verify-rotation-ring='));
  const moveDimensionsVerifyArg=argv.find(a=>a.startsWith('--verify-move-dimensions='));
  const drawingsVerifyArg=argv.find(a=>a.startsWith('--verify-drawings='));
  const modelingContextVerifyArg=argv.find(a=>a.startsWith('--verify-modeling-context='));
  const reconstructionVerifyArg=argv.find(a=>a.startsWith('--verify-reconstruction='));
  const pythonVerifyArg=argv.find(a=>a.startsWith('--verify-python='));
  const autoDimensionsVerifyArg=argv.find(a=>a.startsWith('--verify-auto-dimensions='));
  const fnpackPhase=argv.find(a=>a.startsWith('--verify-fnpack-phase='))?.slice('--verify-fnpack-phase='.length)??'main';
  const fnpackVerifyArg=argv.find(a=>a.startsWith('--verify-fnpack='));
  const assemblyVerifyArg=argv.find(a=>a.startsWith('--verify-assembly-display='));
  const jointsVerifyArg=argv.find(a=>a.startsWith('--verify-joints='));
  const sketchConstraintsVerifyArg=argv.find(a=>a.startsWith('--verify-sketch-constraints='));
  const linkedContoursVerifyArg=argv.find(a=>a.startsWith('--verify-linked-contours='));
  const parametersVerifyArg=argv.find(a=>a.startsWith('--verify-project-parameters='));
  const modelingVerifyArg=argv.find(a=>a.startsWith('--verify-modeling='));
  const sketchUpgradeVerifyArg=argv.find(a=>a.startsWith('--verify-sketch-upgrade='));
  const numberDisplayVerifyArg=argv.find(a=>a.startsWith('--verify-number-display='));
  const holeGroupsVerifyArg=argv.find(a=>a.startsWith('--verify-hole-groups='));
  const meshImportVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-import='));
  const viewToolbarVerifyArg=argv.find(a=>a.startsWith('--verify-view-toolbar='));
  const contextMenuVerifyArg=argv.find(a=>a.startsWith('--verify-context-menu='));
  const fusionVerifyArg=argv.find(a=>a.startsWith('--verify-fusion='));
  const solidVerifyArg=argv.find(a=>a.startsWith('--verify-solid='));
  const workbenchVerifyArg=argv.find(a=>a.startsWith('--verify-workbench='));
  const meshHollowVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-hollow='));
  const meshMakeSolidVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-make-solid='));
  const meshEraseFillVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-erase-fill='));
  const stepThicknessVerifyArg=argv.find(a=>a.startsWith('--verify-step-thickness='));
  const placementVerifyArg=argv.find(a=>a.startsWith('--verify-model-placement='));
  const inspectionVerifyArg=argv.find(a=>a.startsWith('--verify-inspection='));
  const meshSculptVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-sculpt='));
  const meshSmoothVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-smooth='));
  const meshRemeshVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-remesh='));
  const meshReduceVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-reduce='));
  const meshConnectorsVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-connectors='));
  const meshPartitionVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-partition='));
  const meshHoleVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-hole-fill='));
  const meshRepairVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-simple-repair='));
  const meshInspectorVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-inspector='))??(argv.includes('--verify-mesh-inspector')?'--verify-mesh-inspector='+path.join(require('node:os').tmpdir(),'formnaro-mesh-inspector-'+require('node:crypto').randomUUID(),'result.json'):undefined);
  const meshSelectionVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-selection='))??(argv.includes('--verify-mesh-selection')?'--verify-mesh-selection='+path.join(require('node:os').tmpdir(),'formnaro-mesh-selection-'+require('node:crypto').randomUUID(),'result.json'):undefined);
  const releaseWorkflowVerifyArg=argv.find(a=>a.startsWith('--verify-release-workflow='));
  const releaseWorkflowReopenArg=argv.find(a=>a.startsWith('--verify-release-reopen='));
  const unifiedWorkflowsVerifyArg=argv.find(a=>a.startsWith('--verify-unified-workflows='));
  const meshToCadVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-to-cad='));
  const cadMeshCopyVerifyArg=argv.find(a=>a.startsWith('--verify-cad-mesh-copy='));
  const sharedAIVerifyArg=argv.find(a=>a.startsWith('--verify-shared-ai='))??(argv.includes('--verify-shared-ai')?'--verify-shared-ai='+path.join(require('node:os').tmpdir(),'formnaro-shared-ai-'+require('node:crypto').randomUUID(),'result.json'):undefined);
  const verifyArg=argv.find(a=>a.startsWith('--verify-local='));
  const stlVerifyArg=argv.find(a=>a.startsWith('--verify-stl-integration='));
  const converterWorkspaceVerifyArg=argv.find(a=>a.startsWith('--verify-converter-workspace='));
  const toolParityVerifyArg=argv.find(a=>a.startsWith('--verify-tools='));

  const workspaceVerifyArg=argv.find(a=>a.startsWith('--verify-workspace='));
  const meshVerifyArg=argv.find(a=>a.startsWith('--verify-mesh='));
  const mixedVerifyArg=argv.find(a=>a.startsWith('--verify-mixed='));
  const meshFeaturesVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-features='));
  const meshDisplayVerifyArg=argv.find(a=>a.startsWith('--verify-mesh-display='));
  const cadMiniPerformanceVerifyArg=argv.find(a=>a.startsWith('--verify-cad-mini-performance='));
  const creationDomainVerifyArg=argv.find(a=>a.startsWith('--verify-creation-domain='));
  const easyPerformanceVerifyArg=argv.find(a=>a.startsWith('--verify-easy-performance='));
  const verifyInput=maintenanceVerifyArg?.slice('--verify-maintenance='.length)??fusionVerifyArg?.slice('--verify-fusion='.length)??contextMenuVerifyArg?.slice('--verify-context-menu='.length)??solidVerifyArg?.slice('--verify-solid='.length)??speechVerifyArg?.slice('--verify-speech='.length)??reconstructionVerifyArg?.slice('--verify-reconstruction='.length)??modelingContextVerifyArg?.slice('--verify-modeling-context='.length)??pythonVerifyArg?.slice('--verify-python='.length)??autoDimensionsVerifyArg?.slice('--verify-auto-dimensions='.length)??fnpackVerifyArg?.slice('--verify-fnpack='.length)??assemblyVerifyArg?.slice('--verify-assembly-display='.length)??jointsVerifyArg?.slice('--verify-joints='.length)??sketchConstraintsVerifyArg?.slice('--verify-sketch-constraints='.length)??linkedContoursVerifyArg?.slice('--verify-linked-contours='.length)??parametersVerifyArg?.slice('--verify-project-parameters='.length)??drawingsVerifyArg?.slice('--verify-drawings='.length)??modelingVerifyArg?.slice('--verify-modeling='.length)??rotationVerifyArg?.slice('--verify-rotation-ring='.length)??moveDimensionsVerifyArg?.slice('--verify-move-dimensions='.length)??sketchUpgradeVerifyArg?.slice('--verify-sketch-upgrade='.length)??numberDisplayVerifyArg?.slice('--verify-number-display='.length)??holeGroupsVerifyArg?.slice('--verify-hole-groups='.length)??meshImportVerifyArg?.slice('--verify-mesh-import='.length)??viewToolbarVerifyArg?.slice('--verify-view-toolbar='.length)??stepThicknessVerifyArg?.slice('--verify-step-thickness='.length)??placementVerifyArg?.slice('--verify-model-placement='.length)??inspectionVerifyArg?.slice('--verify-inspection='.length)??meshSculptVerifyArg?.slice('--verify-mesh-sculpt='.length)??cadMiniPerformanceVerifyArg?.slice('--verify-cad-mini-performance='.length)??creationDomainVerifyArg?.slice('--verify-creation-domain='.length)??easyPerformanceVerifyArg?.slice('--verify-easy-performance='.length)??meshFeaturesVerifyArg?.slice('--verify-mesh-features='.length)??meshDisplayVerifyArg?.slice('--verify-mesh-display='.length)??allFunctionsVerifyArg?.slice('--verify-all-functions='.length)??aiResultChecksVerifyArg?.slice('--verify-ai-result-checks='.length)??meshHollowVerifyArg?.slice('--verify-mesh-hollow='.length)??meshMakeSolidVerifyArg?.slice('--verify-mesh-make-solid='.length)??meshEraseFillVerifyArg?.slice('--verify-mesh-erase-fill='.length)??meshSmoothVerifyArg?.slice('--verify-mesh-smooth='.length)??meshRemeshVerifyArg?.slice('--verify-mesh-remesh='.length)??meshReduceVerifyArg?.slice('--verify-mesh-reduce='.length)??meshConnectorsVerifyArg?.slice('--verify-mesh-connectors='.length)??meshPartitionVerifyArg?.slice('--verify-mesh-partition='.length)??easyCompleteVerifyArg?.slice('--verify-easy-complete='.length)??easyAutoRepairVerifyArg?.slice('--verify-easy-auto-repair='.length)??easyDomainVerifyArg?.slice('--verify-easy-domain='.length)??workbenchVerifyArg?.slice('--verify-workbench='.length)??meshHoleVerifyArg?.slice('--verify-mesh-hole-fill='.length)??meshRepairVerifyArg?.slice('--verify-mesh-simple-repair='.length)??meshInspectorVerifyArg?.slice('--verify-mesh-inspector='.length)??meshSelectionVerifyArg?.slice('--verify-mesh-selection='.length)??releaseWorkflowVerifyArg?.slice('--verify-release-workflow='.length)??unifiedWorkflowsVerifyArg?.slice('--verify-unified-workflows='.length)??meshToCadVerifyArg?.slice('--verify-mesh-to-cad='.length)??cadMeshCopyVerifyArg?.slice('--verify-cad-mesh-copy='.length)??sharedAIVerifyArg?.slice('--verify-shared-ai='.length)??converterWorkspaceVerifyArg?.slice('--verify-converter-workspace='.length)??toolParityVerifyArg?.slice('--verify-tools='.length)??workspaceVerifyArg?.slice('--verify-workspace='.length)??meshVerifyArg?.slice('--verify-mesh='.length)??mixedVerifyArg?.slice('--verify-mixed='.length)??stlVerifyArg?.slice('--verify-stl-integration='.length)??verifyArg?.slice('--verify-local='.length);
  const workingSpeedVerifyArg=argv.find(a=>a.startsWith('--verify-working-speed='));
  const verifyPath=workingSpeedVerifyArg?path.resolve(cwd, workingSpeedVerifyArg.slice('--verify-working-speed='.length)):verifyInput?path.resolve(cwd, verifyInput):undefined;

  return { diagnosticHost, diagnosticHome, diagnosticChild, practiceChild, practiceDirectory, maintenanceVerifyArg, speechVerifyArg, allFunctionsVerifyArg, allFunctionsPhase, aiResultChecksVerifyArg, easyCompleteVerifyArg, easyAutoRepairVerifyArg, easyDomainVerifyArg, rotationVerifyArg, moveDimensionsVerifyArg, drawingsVerifyArg, modelingContextVerifyArg, reconstructionVerifyArg, pythonVerifyArg, autoDimensionsVerifyArg, fnpackPhase, fnpackVerifyArg, assemblyVerifyArg, jointsVerifyArg, sketchConstraintsVerifyArg, linkedContoursVerifyArg, parametersVerifyArg, modelingVerifyArg, sketchUpgradeVerifyArg, numberDisplayVerifyArg, holeGroupsVerifyArg, meshImportVerifyArg, viewToolbarVerifyArg, contextMenuVerifyArg, fusionVerifyArg, solidVerifyArg, workbenchVerifyArg, meshHollowVerifyArg, meshMakeSolidVerifyArg, meshEraseFillVerifyArg, stepThicknessVerifyArg, placementVerifyArg, inspectionVerifyArg, meshSculptVerifyArg, meshSmoothVerifyArg, meshRemeshVerifyArg, meshReduceVerifyArg, meshConnectorsVerifyArg, meshPartitionVerifyArg, meshHoleVerifyArg, meshRepairVerifyArg, meshInspectorVerifyArg, meshSelectionVerifyArg, releaseWorkflowVerifyArg, releaseWorkflowReopenArg, unifiedWorkflowsVerifyArg, meshToCadVerifyArg, cadMeshCopyVerifyArg, sharedAIVerifyArg, verifyArg, stlVerifyArg, converterWorkspaceVerifyArg, toolParityVerifyArg, workspaceVerifyArg, meshVerifyArg, mixedVerifyArg, meshFeaturesVerifyArg, meshDisplayVerifyArg, cadMiniPerformanceVerifyArg, creationDomainVerifyArg, easyPerformanceVerifyArg, verifyInput, workingSpeedVerifyArg, verifyPath };
}

module.exports = { parseStartupOptions };
