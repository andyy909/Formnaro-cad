process.env.FORMNARO_RELEASE_VERSION='0.105.0';
process.env.FORMNARO_RELEASE_NAME='Programm-Assistent';
process.env.FORMNARO_RELEASE_LABEL='Programm-Assistent und sichtbare Bedienhilfe';
process.env.FORMNARO_RELEASE_PROOF='work/program-assistant/release-'+(process.argv[2]??'r1');
process.env.FORMNARO_RELEASE_TASK_EVIDENCE='1';
process.env.FORMNARO_RELEASE_AI_METER='1';
process.env.FORMNARO_RELEASE_PROGRAM_ASSISTANT='1';
await import('./package-freecad-python.mjs');
