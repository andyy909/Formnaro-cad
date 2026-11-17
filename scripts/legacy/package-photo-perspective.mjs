process.env.FORMNARO_RELEASE_VERSION='0.107.0';
process.env.FORMNARO_RELEASE_NAME='Foto-Perspektive';
process.env.FORMNARO_RELEASE_LABEL='Dauerhafte Projektfotos und Perspektiventzerrung';
process.env.FORMNARO_RELEASE_PROOF='work/photo-perspective/release-'+(process.argv[2]??'r1');
process.env.FORMNARO_RELEASE_BUILD_ROOT??='work/release-build';
process.env.FORMNARO_RELEASE_OUTPUT_ROOT??='output';
for(const key of ['TASK_EVIDENCE','AI_METER','PROGRAM_ASSISTANT','PHOTO','PERSPECTIVE'])process.env['FORMNARO_RELEASE_'+key]='1';
await import('./package-freecad-python.mjs');
