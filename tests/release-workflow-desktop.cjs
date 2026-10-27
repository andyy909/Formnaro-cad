// Node wrapper intentionally waits for two separate normal application exits.
import('../scripts/run-release-workflow.mjs').catch(error=>{console.error(error);process.exitCode=1;});
