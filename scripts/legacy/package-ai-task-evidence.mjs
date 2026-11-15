process.env.FORMNARO_RELEASE_VERSION='0.104.1';
process.env.FORMNARO_RELEASE_NAME='KI-Auftragsgedaechtnis';
process.env.FORMNARO_RELEASE_PROOF='work/ai-task-evidence/release-'+(process.argv[2]??'r1');
process.env.FORMNARO_RELEASE_TASK_EVIDENCE='1';
await import('./package-freecad-python.mjs');
