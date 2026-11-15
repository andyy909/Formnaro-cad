import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export async function findPullRequestRun(get, { repository, branch, sha, pause = delay }) {
  const owner = repository.split('/')[0];
  const pulls = new URLSearchParams({ state: 'open', head: `${owner}:${branch}`, per_page: '100' });
  const openPulls = await get(`pulls?${pulls}`);
  const matching = new Set(openPulls.filter(({ head }) =>
    head.repo?.full_name === repository && head.ref === branch && head.sha === sha,
  ).map(({ number }) => number));
  if (!matching.size) return undefined;

  const query = new URLSearchParams({ event: 'pull_request', branch, head_sha: sha, per_page: '10' });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await pause(2000);
    const { workflow_runs: runs } = await get(`actions/workflows/build.yml/runs?${query}`);
    const run = runs.find((run) =>
      run.event === 'pull_request' && run.head_sha === sha && run.head_branch === branch
      && run.head_repository?.full_name === repository
      && run.pull_requests?.some(({ number }) => matching.has(number))
      && (['queued', 'in_progress'].includes(run.status)
        || ['success', 'failure', 'timed_out'].includes(run.conclusion)),
    );
    if (run) return run.id;
  }
  return undefined;
}

if (import.meta.main) {
  const {
    GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_SHA, GITHUB_OUTPUT, GH_TOKEN,
  } = process.env;
  let run;
  try {
    const get = async (path) => {
      const response = await fetch(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/${path}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${GH_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      return response.json();
    };
    run = await findPullRequestRun(get, { repository: GITHUB_REPOSITORY, branch: GITHUB_REF_NAME, sha: GITHUB_SHA });
  } catch (error) {
    console.warn(`PR workflow lookup failed. Running push checks (${error.message}).`);
  }
  console.log(run ? `Matching PR source run ${run}. Skipping duplicate push checks.` : 'Running push checks.');
  appendFileSync(GITHUB_OUTPUT, `skip=${Boolean(run)}\n`);
}
