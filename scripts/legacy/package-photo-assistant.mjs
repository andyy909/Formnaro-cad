process.env.FORMNARO_RELEASE_VERSION='0.106.0';
process.env.FORMNARO_RELEASE_NAME='Foto-Assistent';
process.env.FORMNARO_RELEASE_LABEL='Foto-Assistent mit Messungen und Konturvergleich';
process.env.FORMNARO_RELEASE_PROOF='work/photo-assistant/release-'+(process.argv[2]??'r1');
process.env.FORMNARO_RELEASE_TASK_EVIDENCE='1';
process.env.FORMNARO_RELEASE_AI_METER='1';
process.env.FORMNARO_RELEASE_PROGRAM_ASSISTANT='1';
process.env.FORMNARO_RELEASE_PHOTO='1';
await import('./package-freecad-python.mjs');
