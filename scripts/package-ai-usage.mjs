process.env.FORMNARO_RELEASE_VERSION='0.104.2';
process.env.FORMNARO_RELEASE_NAME='KI-Verbrauch';
process.env.FORMNARO_RELEASE_LABEL='KI-Verbrauch und Kontextgrößen';
process.env.FORMNARO_RELEASE_PROOF='work/ai-usage/release-'+(process.argv[2]??'r1');
process.env.FORMNARO_RELEASE_TASK_EVIDENCE='1';
process.env.FORMNARO_RELEASE_AI_METER='1';
await import('./package-freecad-python.mjs');
