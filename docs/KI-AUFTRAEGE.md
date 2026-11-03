# Saved AI tasks

The desktop chat can save task requirements, the original project state,
intermediate progress and the best checked candidate in the private
`KI-Auftraege` data directory. Interrupted tasks can resume with their
remaining step budget. Provider credentials and current provider settings are
stored separately.

## Set up and resume a task

In the chat's model and settings section, open the task requirements editor
to set the objective, quality criteria, assumptions, protected parts and
native checks. Requirements apply from the first model response. A protected
source retains its geometry, placement, locks and visibility. Technical
requirements and native measurements still apply to free-form tasks.

The saved task list shows status, used steps, requirements and concrete
findings. Resume continues an interrupted task with its remaining budget.
Restore candidate rechecks the saved proposal without contacting the provider
or spending another step. A failed check requires explicit acceptance of
the reported issues before Apply. Apply and Discard update the task status.
If saving that status fails, the app reports the storage error separately.

The project checksum, revision, selection and reference checksum must
match the saved basis for a resume. If they differ, open the saved task
model using the normal save or discard flow for the current project. Saved
bases include the original FNPACK geometry blocks. A missing required runtime,
such as FreeCAD, is reported before the affected task can proceed.

## Progress and recovery

Automatic work stops after three equivalent failures, measurements or
geometrically identical checked candidates during an unsuccessful image
correction. Six steps without demonstrated progress also stop the run.
The configured step budget still applies. Better measurements can allow
further correction. A later worse candidate leaves a better checked draft
available for review. The stop message shows the last concrete finding.
A stopped draft remains a preview until explicitly applied.

Task data is checksummed and saved atomically. A failed write preserves the
previous saved task. A process lock and generation checks guard against
duplicate resumes. A terminated owner can leave a recoverable task without
resetting its consumed steps. Opening a saved task does not run archived code.

On resume, saved measurements, analysis programs, helper modules and
converter choices are restored together. Native candidates are rebuilt
from archived sources, receive a fresh preview ID and undergo fresh checks.
Changes to expected geometry or sources abort restoration. A pending image
check uses fresh preview views and the original bound photo references.
Its already counted attempt stays counted. Missing reference data or
incomplete older candidates are reported.

The feature was introduced in 0.111. Historical Windows verification for
0.111.0-r2 used isolated processes and simulated model responses to test
storage, resume, native output and Undo. It did not measure provider model
quality. Back up the task directory with the rest of your local data.
