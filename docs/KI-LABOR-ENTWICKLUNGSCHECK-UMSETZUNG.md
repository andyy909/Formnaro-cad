# AI Lab development check and portable patch

Implementation starts at the r4 checkpoint ff65726b44b334cffa1a0ea6b21d3648383b192f on PR #116. Phase B and its statistics are already integrated. Apply these tickets sequentially with the other Lab plan at any shared file. Use an isolated checkout, one ticket and commit at a time, and report the exact commit, tests, and any open result. Use local provider fixtures for ordinary acceptance.

The canon for the fifteen test IDs is [lab-development-check.json](../ai/lab-development-check.json). These are the seven diagnostic development cases and eight advanced cases, drawn from the already verified 15-case export. The pinned eight-case Core Benchmark is a different list. Its exact case IDs overlap only at assembly. Its drill, pattern, shell and drawing have corresponding diagnostic tasks with separate fixtures. B01 size/center, B05 chamfer and B07 native measurement stay covered by the 30 exercise functions. Thread and sketch are diagnostic cases. Keep both benchmark manifests, limits, workload, and calibration byte-identical and exercise verifySuite for both.

The result label is **Erste bestandene Stufe**. A pass on a repeat can occur by chance. Report newly accepted cases over attempted cases at each escalation, along with IDs and all previous outcomes. The optional fixed-Low control is a separately planned follow-up series of the eligible Low failures, with a fresh scene and identical context. It has no bearing on the default escalation decision. Phase B statistics stay in their existing module.

## A — Simple and advanced view

- A1. Add four repository-backed quick plans for 3, 15, 30 and 45 cases. Verify the row counts through the existing validator and compatible JSON import.
- A2. Add Einfach and Erweitert to the existing plan view. The modeler profile and model use the existing picker in either view. Verify changing views preserves the input and existing advanced controls.
- A3. Expose the development check preview and disable Start while the model or plan is being resolved. The preview lists the model, Low and High, with a maximum of 30 planned trials before enabling Max. Verify unsupported reasoning and stale preview handling.

## B — Low and conditional High

- B1. Validate an explicit backend preview with a supported model and exact Low/High reasoning levels. Confirm preview performs zero trial requests.
- B2. Use the existing laboratory runner for a single Low stage with the fifteen case IDs, fresh scenes and only the modeler. Confirm every request uses the frozen model and Low.
- B3. Derive eligibility from terminal attempts with exact model identity, clean exit and verifiable CAD. An explicit negative native result on a completed model is a fail. A question, absent end model, interrupted execution, infrastructure or checker failure is blocked. Cover the existing Advanced checker-error check explicitly.
- B4. When the Low queue is exhausted, schedule a fresh High series from the eligible Low failures only, in original case order. Verify mixed results and all-pass/empty-High.
- B5. Share cancellation, quota stop, busy state and the request budget across stages. Verify stop at the Low/High boundary and repeated clicks.
- B6. Route UI Start through the new backend action and show the source of a blocked result beside the phase. Verify no reviewer or monitor request even if the regular reviewer preference is enabled.

## C — Max, persistence and evidence

- C1. Add an off-by-default Max toggle gated by actual model support; preview reports 45 planned trials at most. Validate that Max takes only failed High cases.
- C2. Persist development check identity, source hash, model, phase case lists and linked raw series using the Lab atomic writer. Persist a phase list before paid work starts.
- C3. On restart reconcile original records, record unfinished started cases as interrupted, and offer explicit continuation only for not-yet-started cases with the same source hash and frozen model. Preserve raw attempts and ensure each case/stage is charged at most once by automatic dispatch.
- C4. Show every case and its ordered Low/High/Max outcomes, the first passing level and all open reasons. Do not infer higher-level necessity.
- C5. Bundle the selected development check manifest and all associated stage evidence in the existing external export, including per-run IDs and a verifiable file manifest.
- C6. Add the independently selected Low control series as a saved ordinary plan with the same case IDs and condition, with no automatic dispatch. Verify old imports, reports and exports still work.

## D — Private portable Windows patch

- D1. Run the real executable in a scratch copy before replacing app.asar, after replacement, and after restoration. Record archive and executable hashes and regular process exits with an isolated profile.
- D2. Define the small patch manifest with target, base and source identity, SHA-256 and sizes. Test a valid manifest, missing fields, wrong architecture and foreign archive.
- D3. Build a candidate ASAR from the existing portable staging filter. Reject changed Electron, native CAD, renderer WASM and other runtime inputs. Verify file inventory and packaging of drawing measurement modules.
- D4. Build the versioned patch ZIP from the validated candidate, containing the manifest and target ASAR. Check every stored hash and record the ZIP SHA-256 separately.
- D5. Dry-run the patch against an explicitly supplied private test copy. Confirm base EXE/ASAR identity, exact allowed ZIP entries, safe paths and normal file types, and reject a running executable from that copy.
- D6. Stage verified archive bytes adjacent to the original. Acquire a local exclusive updater lock, recheck process and hashes, and atomically replace the application archive with a backup. Document applying the ZIP against a separately supplied expected SHA-256.
- D7. Verify current target and backup identities before atomic rollback. Test a wrong revision, payload alterations, open application, interrupted staging, repeated apply, and round trip. Confirm data and other program files remain byte-identical.
- D8. Apply the candidate in a clean r4 test copy, start the real EXE with an isolated profile, run the development-check fixture and positive/negative packaged drawing checks, then verify rollback and restart.
