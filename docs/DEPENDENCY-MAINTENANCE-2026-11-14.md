# Development dependency maintenance, 14 November 2026

The published 0.139.1-r1 executable, ASAR, Windows ZIP and source tag remain
unchanged. This subsequent source-maintenance change updates only development
tool lockfiles, their integration test and CI coverage. It is not a new
application release or a new native/AI benchmark.

GitHub reported five open development dependency alerts across the main,
Mini Mesh and Mini CAD lockfiles: minimatch amplification and fast-xml-parser
stop-node scanning. The current npm audit also identified glob cancellation
handling. Updating the compatible @electron/asar dependency to 4.3.2 brings
glob 14.0.6 and minimatch 11.0.8; the two XML parser trees now use 5.12.1.
No override or application dependency change is required.

All three updated dependency trees report zero known npm audit vulnerabilities
at this check. This is a dated registry result, not a guarantee against unknown
vulnerabilities. Main, Mini Mesh and Mini CAD retain their existing versions.

Validation includes the three application builds and standard test suites,
plus an archive round-trip with unpacked native resources, filesystem matching
and an already-aborted traversal. The same integration check runs against each
project's own dependency tree. Windows CI now covers both Mini projects as
well as the main application. Release downloads continue to reference the
frozen release tag, rather than this later maintenance commit.

The local acceptance counts are 128 main, 61 Mini Mesh and 64 Mini CAD tests,
plus one tooling integration test per dependency tree. No cloud model requests
are needed for this maintenance.

The first standalone Mini Mesh CI run exposed a test-only dependency on the
parent checkout's node_modules directory. Its mesh-import fixture now resolves
the WASM through the installed package export, matching the JavaScript import.
This allows Mini Mesh to be tested with only its own dependencies installed.
